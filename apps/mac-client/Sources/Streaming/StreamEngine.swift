// StreamEngine.swift — Main streaming coordinator
// CrazyStream macOS Client
//
// Orchestrates the entire receive -> decode -> render pipeline for a single
// streaming session. Owns the decoder, renderer, audio, transport, and input
// subsystems and manages their lifecycle.
//
// Thread model:
//   - Receive: UDPTransport callback (Network.framework dispatch queue)
//   - Decode:  Dedicated async task pulling from JitterBuffer
//   - Render:  MTKView draw callback (main thread via CADisplayLink)
//   - Audio:   AVAudioEngine (system audio thread)
//   - Input:   NSEvent monitors (main thread)
//   - Stats:   Periodic timer (background queue)

import Foundation
import MetalKit
import CoreVideo

/// Configuration for a streaming session.
struct StreamSessionConfig: Sendable {
    let sessionId: String
    let hostId: String
    let hostIP: String
    let hostPort: UInt16
    let codec: CodecType
    let width: UInt32
    let height: UInt32
    let fps: UInt32
    let gamingMode: GamingMode
    let useDTLS: Bool

    /// Gaming mode enum matching the C++ GamingMode in gaming_modes.h.
    enum GamingMode: String, Sendable, CaseIterable, Identifiable {
        case competitive = "competitive"
        case balanced = "balanced"
        case cinematic = "cinematic"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .competitive: return "Competitive"
            case .balanced:    return "Balanced"
            case .cinematic:   return "Cinematic"
            }
        }

        var description: String {
            switch self {
            case .competitive: return "240fps max, lowest latency"
            case .balanced:    return "1440p@120fps, best overall"
            case .cinematic:   return "4K@60fps, highest quality"
            }
        }

        var targetFps: UInt32 {
            switch self {
            case .competitive: return 240
            case .balanced:    return 120
            case .cinematic:   return 60
            }
        }

        var jitterBufferMs: UInt32 {
            switch self {
            case .competitive: return 1
            case .balanced:    return 4
            case .cinematic:   return 8
            }
        }
    }
}

/// The main streaming session coordinator. Manages all subsystems for a single
/// active streaming session.
@MainActor
final class StreamEngine: ObservableObject {

    // MARK: - Published State

    @Published private(set) var state: EngineState = .idle
    @Published private(set) var stats = StreamStats()
    @Published var showOverlay = false

    enum EngineState: Equatable {
        case idle
        case connecting
        case streaming
        case reconnecting
        case error(String)
        case stopped

        static func == (lhs: EngineState, rhs: EngineState) -> Bool {
            switch (lhs, rhs) {
            case (.idle, .idle),
                 (.connecting, .connecting),
                 (.streaming, .streaming),
                 (.reconnecting, .reconnecting),
                 (.stopped, .stopped):
                return true
            case (.error(let a), .error(let b)):
                return a == b
            default:
                return false
            }
        }
    }

    // MARK: - Subsystems

    private var transport: UDPTransport?
    private var jitterBuffer: JitterBuffer?
    private var nackSender: NACKSender?
    private var statsReporter: StatsReporter?
    private var videoDecoder: VideoDecoder?
    private var metalRenderer: MetalRenderer?
    private var opusDecoder: OpusDecoder?
    private var audioPlayer: AudioPlayer?
    private var inputCapture: InputCapture?
    private var inputSender: InputSender?

    private var config: StreamSessionConfig?
    private var decodeTask: Task<Void, Never>?
    private var isRunning = false

    // MARK: - Public API

    /// Start a streaming session with the given configuration.
    func start(config: StreamSessionConfig, metalView: MTKView) async {
        guard state == .idle || state == .stopped else { return }
        self.config = config
        state = .connecting

        do {
            try initSubsystems(config: config, metalView: metalView)
            startReceiving()
            startDecodeLoop()
            state = .streaming
            isRunning = true
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    /// Stop the streaming session and tear down all subsystems.
    func stop() {
        isRunning = false
        state = .stopped

        // Cancel decode loop
        decodeTask?.cancel()
        decodeTask = nil

        // Stop subsystems in reverse order of dependency
        inputCapture?.disable()
        audioPlayer?.stop()
        nackSender?.stop()
        statsReporter?.stop()
        transport?.disconnect()

        // Tear down decoder
        videoDecoder?.flush()
        videoDecoder?.teardown()

        // Clear renderer
        metalRenderer?.flushTextureCache()

        // Reset references
        transport = nil
        jitterBuffer = nil
        nackSender = nil
        statsReporter = nil
        videoDecoder = nil
        metalRenderer = nil
        opusDecoder = nil
        audioPlayer = nil
        inputCapture = nil
        inputSender = nil
    }

    /// Toggle input capture (cursor lock).
    func toggleInputCapture() {
        inputCapture?.toggleCursorLock()
    }

    /// Toggle the stats overlay HUD.
    func toggleOverlay() {
        showOverlay.toggle()
    }

    // MARK: - Initialization

    /// Initialize all subsystems for the streaming session.
    private func initSubsystems(config: StreamSessionConfig, metalView: MTKView) throws {
        // 1. Transport
        let udp = UDPTransport()
        self.transport = udp

        // 2. Jitter buffer
        let jb = JitterBuffer()
        jb.targetDepthMs = config.gamingMode.jitterBufferMs
        self.jitterBuffer = jb

        // 3. NACK sender
        let nack = NACKSender(transport: udp)
        self.nackSender = nack

        // 4. Stats reporter
        let reporter = StatsReporter(transport: udp)
        reporter.setNackSender(nack)
        reporter.setCodecName(codecName(for: config.codec))
        reporter.setResolution(width: config.width, height: config.height)
        reporter.onStatsUpdate = { [weak self] newStats in
            Task { @MainActor [weak self] in
                self?.stats = newStats
            }
        }
        self.statsReporter = reporter

        // 5. Video decoder
        let decoder = VideoDecoder(codec: config.codec)
        decoder.onDecodedFrame = { [weak self] pixelBuffer, _ in
            Task { @MainActor [weak self] in
                self?.metalRenderer?.enqueueFrame(pixelBuffer)
                self?.statsReporter?.onFrameDecoded()
            }
        }
        self.videoDecoder = decoder

        // 6. Metal renderer
        guard let renderer = MetalRenderer() else {
            throw EngineError.metalInitFailed
        }
        renderer.configure(view: metalView)
        self.metalRenderer = renderer

        // 7. Opus decoder
        let opus = OpusDecoder()
        self.opusDecoder = opus

        // 8. Audio player
        let audio = AudioPlayer()
        try audio.start()
        self.audioPlayer = audio

        // 9. Input capture + sender
        let sender = InputSender(transport: udp)
        self.inputSender = sender

        let capture = InputCapture()
        capture.onInput = { [weak sender] event in
            sender?.send(event: event)
        }
        self.inputCapture = capture

        // Connect transport
        udp.connect(host: config.hostIP, port: config.hostPort, useDTLS: config.useDTLS)

        // Start background services
        nack.start()
        reporter.start()
    }

    // MARK: - Receive Pipeline

    /// Start the receive loop: dispatch incoming packets to the appropriate handler.
    private func startReceiving() {
        transport?.onReceive { [weak self] data in
            guard let self else { return }

            guard let packetType = identifyPacket(data) else { return }

            switch packetType {
            case .video:
                self.handleVideoPacket(data)
            case .audio:
                self.handleAudioPacket(data)
            case .qosFeedback, .fec, .nack, .input:
                // These are host->client control packets we don't normally receive,
                // but log them for debugging.
                break
            }
        }

        transport?.onStateChange { [weak self] newState in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch newState {
                case .disconnected(let error):
                    if self.isRunning {
                        self.state = .error(error?.localizedDescription ?? "Disconnected")
                    }
                case .connected:
                    if self.state == .reconnecting {
                        self.state = .streaming
                    }
                default:
                    break
                }
            }
        }
    }

    /// Handle a received video packet: parse header, feed to jitter buffer and NACK sender.
    private func handleVideoPacket(_ data: Data) {
        guard let header = VideoPacketHeader.deserialize(from: data) else { return }

        let payload = data.dropFirst(VideoPacketHeader.wireSize)
        guard !payload.isEmpty else { return }

        // Track for NACK and stats
        nackSender?.onPacketReceived(seq: header.sequenceNumber)

        let recvTime = StatsReporter.currentTimeUs()
        statsReporter?.onPacketReceived(header: header, recvTimeUs: recvTime)

        // Push to jitter buffer for reassembly
        jitterBuffer?.pushPacket(header: header, payload: Data(payload))
    }

    /// Handle a received audio packet: parse header, decode Opus, enqueue for playback.
    private func handleAudioPacket(_ data: Data) {
        guard let header = AudioPacketHeader.deserialize(from: data) else { return }

        let payload = data.dropFirst(AudioPacketHeader.wireSize)
        guard !payload.isEmpty else { return }

        // Decode Opus and enqueue for playback
        if let frame = opusDecoder?.decode(opusData: Data(payload), timestampUs: header.timestampUs) {
            audioPlayer?.enqueueFrame(frame)
        }
    }

    // MARK: - Decode Loop

    /// Start the async decode loop that pulls complete frames from the jitter buffer
    /// and submits them to the video decoder.
    private func startDecodeLoop() {
        decodeTask = Task.detached(priority: .userInitiated) { [weak self] in
            while !Task.isCancelled {
                guard let self else { break }

                let frame = await MainActor.run { self.jitterBuffer?.popFrame() }

                if let frame {
                    let decoder = await MainActor.run { self.videoDecoder }
                    let reporter = await MainActor.run { self.statsReporter }

                    do {
                        try decoder?.decode(
                            nalData: frame.data,
                            timestamp: frame.header.timestampUs,
                            isKeyframe: frame.header.keyframe
                        )

                        let decodeTime = decoder?.lastDecodeTimeMs ?? 0
                        reporter?.setDecodeTimeMs(decodeTime)
                    } catch {
                        reporter?.onFrameDropped()
                    }
                } else {
                    // No frame available — sleep briefly before polling again
                    try? await Task.sleep(nanoseconds: 500_000)  // 0.5ms
                }
            }
        }
    }

    // MARK: - Input Control

    /// Enable input capture (start sending mouse/keyboard to host).
    func enableInput() {
        inputCapture?.enable(lockCursor: true)
    }

    /// Disable input capture.
    func disableInput() {
        inputCapture?.disable()
    }

    // MARK: - Helpers

    private func codecName(for codec: CodecType) -> String {
        switch codec {
        case .h264: return "H.264"
        case .h265: return "H.265"
        case .av1:  return "AV1"
        }
    }
}

// MARK: - Errors

enum EngineError: Error, LocalizedError {
    case metalInitFailed
    case transportFailed
    case decoderFailed

    var errorDescription: String? {
        switch self {
        case .metalInitFailed: return "Failed to initialize Metal renderer."
        case .transportFailed: return "Failed to establish UDP transport."
        case .decoderFailed: return "Failed to initialize video decoder."
        }
    }
}
