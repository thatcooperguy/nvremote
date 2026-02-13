// AudioPlayer.swift — Low-latency audio playback via AVAudioEngine
// CrazyStream macOS Client
//
// Plays decoded PCM audio using AVAudioEngine with a small buffer (2-3 frames)
// for continuity. Uses a schedule-ahead model: decoded frames are queued onto
// the AVAudioPlayerNode which plays them in order.

import Foundation
import AVFoundation

/// Low-latency audio player using AVAudioEngine.
/// Buffers 2-3 Opus frames (20-30ms) for smooth playback while minimizing latency.
final class AudioPlayer: @unchecked Sendable {

    // MARK: - Configuration

    /// Audio sample rate (48kHz for CrazyStream).
    let sampleRate: Double = 48000.0

    /// Number of channels (stereo).
    let channels: UInt32 = 2

    /// Frame duration from the Opus encoder (10ms).
    let frameDurationMs: Int = 10

    /// Number of frames to buffer ahead for continuity.
    let bufferFrames: Int = 3

    // MARK: - Properties

    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let format: AVAudioFormat
    private let lock = NSLock()
    private var isRunning = false

    /// Number of audio buffers currently scheduled on the player node.
    private var scheduledBufferCount: Int = 0

    /// Statistics
    private(set) var framesPlayed: UInt64 = 0
    private(set) var framesDropped: UInt64 = 0
    private(set) var underruns: UInt64 = 0

    // MARK: - Initialization

    init() {
        // 16-bit signed integer PCM, interleaved, 48kHz stereo
        self.format = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: sampleRate,
            channels: channels,
            interleaved: true
        )!
    }

    deinit {
        stop()
    }

    // MARK: - Lifecycle

    /// Start the audio engine and prepare for playback.
    func start() throws {
        lock.lock()
        defer { lock.unlock() }

        guard !isRunning else { return }

        engine.attach(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: format)

        // Set the output buffer size to the smallest possible for low latency.
        // macOS typically allows 128-512 sample frames.
        let ioBufferDuration = Double(frameDurationMs) / 1000.0  // 10ms
        try engine.outputNode.auAudioUnit.setDeviceIOBufferFrameSize(
            UInt32(sampleRate * ioBufferDuration)
        )

        try engine.start()
        playerNode.play()
        isRunning = true
    }

    /// Stop the audio engine.
    func stop() {
        lock.lock()
        defer { lock.unlock() }

        guard isRunning else { return }

        playerNode.stop()
        engine.stop()
        engine.detach(playerNode)
        isRunning = false
        scheduledBufferCount = 0
    }

    /// Pause audio playback (keeps engine running for quick resume).
    func pause() {
        playerNode.pause()
    }

    /// Resume audio playback.
    func resume() {
        playerNode.play()
    }

    // MARK: - Frame Submission

    /// Enqueue a decoded audio frame for playback.
    /// - Parameter frame: The decoded PCM audio frame.
    func enqueueFrame(_ frame: DecodedAudioFrame) {
        lock.lock()
        let running = isRunning
        let scheduled = scheduledBufferCount
        lock.unlock()

        guard running else { return }

        // Drop frames if we're too far ahead (prevents accumulating latency)
        if scheduled > bufferFrames + 2 {
            lock.lock()
            framesDropped += 1
            lock.unlock()
            return
        }

        // Create an AVAudioPCMBuffer from the decoded PCM data
        guard let pcmBuffer = createPCMBuffer(from: frame) else { return }

        lock.lock()
        scheduledBufferCount += 1
        lock.unlock()

        playerNode.scheduleBuffer(pcmBuffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            guard let self else { return }
            self.lock.lock()
            self.scheduledBufferCount -= 1
            self.framesPlayed += 1
            self.lock.unlock()
        }
    }

    /// Enqueue raw PCM data (interleaved 16-bit signed integer).
    func enqueueRawPCM(_ data: Data, frameCount: Int) {
        let frame = DecodedAudioFrame(
            pcmData: data,
            channels: Int(channels),
            sampleRate: Int(sampleRate),
            frameCount: frameCount,
            timestampUs: 0
        )
        enqueueFrame(frame)
    }

    // MARK: - Volume Control

    /// Set the playback volume (0.0 to 1.0).
    var volume: Float {
        get { playerNode.volume }
        set { playerNode.volume = max(0, min(1, newValue)) }
    }

    // MARK: - Private

    /// Convert a decoded audio frame into an AVAudioPCMBuffer.
    private func createPCMBuffer(from frame: DecodedAudioFrame) -> AVAudioPCMBuffer? {
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: UInt32(frame.frameCount)) else {
            return nil
        }

        buffer.frameLength = UInt32(frame.frameCount)

        // Copy interleaved 16-bit PCM data into the buffer
        frame.pcmData.withUnsafeBytes { srcPtr in
            guard let src = srcPtr.baseAddress else { return }
            let byteCount = min(frame.pcmData.count, Int(buffer.frameLength) * Int(channels) * 2)
            if let dst = buffer.int16ChannelData?[0] {
                memcpy(dst, src, byteCount)
            }
        }

        return buffer
    }
}

// MARK: - Audio Unit Extension

private extension AUAudioUnit {
    /// Set the device IO buffer frame size for low latency.
    func setDeviceIOBufferFrameSize(_ size: UInt32) throws {
        // This property may not be available on all configurations.
        // Silently fail if the property cannot be set.
        let propSize = UInt32(MemoryLayout<UInt32>.size)
        var frameSize = size
        let status = AudioUnitSetProperty(
            self.audioUnit,
            kAudioDevicePropertyBufferFrameSize,
            kAudioUnitScope_Global,
            0,
            &frameSize,
            propSize
        )
        if status != noErr {
            print("[AudioPlayer] Could not set IO buffer size to \(size): \(status)")
        }
    }
}
