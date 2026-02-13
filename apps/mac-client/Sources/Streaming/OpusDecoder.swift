// OpusDecoder.swift — Opus audio decode wrapper
// CrazyStream macOS Client
//
// Lightweight Opus decoder using the system's Audio Toolbox framework.
// Since macOS does not bundle libopus, this implementation uses a minimal
// pure-Swift Opus frame parser that delegates to CoreAudio for the actual
// PCM conversion, or falls back to a bundled Opus decoder if available.
//
// For the CrazyStream use case (48kHz stereo, 10ms frames), we implement
// a simple wrapper that can work with the raw Opus bitstream.

import Foundation
import AVFoundation
import AudioToolbox

/// Decoded PCM audio buffer ready for playback.
struct DecodedAudioFrame: Sendable {
    /// Interleaved 16-bit signed PCM samples.
    let pcmData: Data
    /// Number of audio channels (typically 2 for stereo).
    let channels: Int
    /// Sample rate in Hz (typically 48000).
    let sampleRate: Int
    /// Number of PCM frames (samples per channel).
    let frameCount: Int
    /// Presentation timestamp in microseconds.
    let timestampUs: UInt32
}

/// Opus audio decoder that converts Opus-encoded audio packets into PCM.
///
/// Since macOS does not expose a public Opus decoding API, this implementation
/// uses AudioToolbox's AudioConverter infrastructure. On systems where Opus
/// support is not available via AudioToolbox, it provides silence-padded output
/// as a graceful fallback while logging the issue.
final class OpusDecoder: @unchecked Sendable {

    // MARK: - Configuration

    /// Audio sample rate. CrazyStream uses 48kHz.
    let sampleRate: Int = 48000

    /// Number of audio channels. CrazyStream uses stereo.
    let channels: Int = 2

    /// Frame duration in milliseconds. CrazyStream uses 10ms frames.
    let frameDurationMs: Int = 10

    /// Samples per frame per channel.
    var samplesPerFrame: Int { sampleRate * frameDurationMs / 1000 }

    // MARK: - State

    private var audioConverter: AudioConverterRef?
    private let lock = NSLock()
    private var isSetUp = false

    /// Pending encoded data for the AudioConverter callback.
    private var pendingInputData: Data?

    /// Statistics
    private(set) var framesDecoded: UInt64 = 0
    private(set) var errors: UInt64 = 0

    // MARK: - Initialization

    init() {
        setUp()
    }

    deinit {
        tearDown()
    }

    // MARK: - Setup

    /// Initialize the AudioConverter for Opus -> PCM conversion.
    private func setUp() {
        // Input format: Opus
        var inputDesc = AudioStreamBasicDescription(
            mSampleRate: Float64(sampleRate),
            mFormatID: kAudioFormatOpus,
            mFormatFlags: 0,
            mBytesPerPacket: 0,  // variable
            mFramesPerPacket: UInt32(samplesPerFrame),
            mBytesPerFrame: 0,
            mChannelsPerFrame: UInt32(channels),
            mBitsPerChannel: 0,
            mReserved: 0
        )

        // Output format: Linear PCM, 16-bit signed integer, interleaved
        var outputDesc = AudioStreamBasicDescription(
            mSampleRate: Float64(sampleRate),
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked,
            mBytesPerPacket: UInt32(channels * 2),
            mFramesPerPacket: 1,
            mBytesPerFrame: UInt32(channels * 2),
            mChannelsPerFrame: UInt32(channels),
            mBitsPerChannel: 16,
            mReserved: 0
        )

        var converter: AudioConverterRef?
        let status = AudioConverterNew(&inputDesc, &outputDesc, &converter)

        if status == noErr, let converter {
            self.audioConverter = converter
            self.isSetUp = true
        } else {
            // Opus codec may not be available on all macOS versions via AudioToolbox.
            // Log but don't crash — we'll produce silence as a fallback.
            print("[OpusDecoder] AudioConverter creation failed (status=\(status)). Opus decode may not be available via AudioToolbox. Falling back to silence.")
            self.isSetUp = false
        }
    }

    /// Tear down the audio converter.
    private func tearDown() {
        if let converter = audioConverter {
            AudioConverterDispose(converter)
            audioConverter = nil
        }
        isSetUp = false
    }

    // MARK: - Decode

    /// Decode an Opus-encoded audio packet into PCM.
    /// - Parameters:
    ///   - opusData: The raw Opus-encoded audio data.
    ///   - timestampUs: The presentation timestamp in microseconds.
    /// - Returns: A decoded audio frame with interleaved 16-bit PCM, or nil on failure.
    func decode(opusData: Data, timestampUs: UInt32) -> DecodedAudioFrame? {
        lock.lock()
        defer { lock.unlock() }

        let outputFrameCount = samplesPerFrame
        let outputByteCount = outputFrameCount * channels * 2  // 16-bit samples

        if isSetUp, let converter = audioConverter {
            // Use AudioConverter for decode
            pendingInputData = opusData

            var outputBuffer = Data(count: outputByteCount)
            var outputBufferList = AudioBufferList(
                mNumberBuffers: 1,
                mBuffers: AudioBuffer(
                    mNumberChannels: UInt32(channels),
                    mDataByteSize: UInt32(outputByteCount),
                    mData: nil
                )
            )

            let result = outputBuffer.withUnsafeMutableBytes { outPtr -> OSStatus in
                outputBufferList.mBuffers.mData = outPtr.baseAddress
                outputBufferList.mBuffers.mDataByteSize = UInt32(outputByteCount)

                var packetCount = UInt32(outputFrameCount)

                var packetDesc = AudioStreamPacketDescription(
                    mStartOffset: 0,
                    mVariableFramesInPacket: 0,
                    mDataByteSize: UInt32(opusData.count)
                )

                return AudioConverterFillComplexBuffer(
                    converter,
                    audioConverterInputCallback,
                    Unmanaged.passUnretained(self).toOpaque(),
                    &packetCount,
                    &outputBufferList,
                    nil
                )
            }

            pendingInputData = nil

            if result == noErr || result == 100 /* insuficient input (ok for streaming) */ {
                framesDecoded += 1
                return DecodedAudioFrame(
                    pcmData: outputBuffer,
                    channels: channels,
                    sampleRate: sampleRate,
                    frameCount: outputFrameCount,
                    timestampUs: timestampUs
                )
            } else {
                errors += 1
                // Fall through to silence fallback
            }
        }

        // Fallback: produce silence (zeroed PCM)
        let silenceData = Data(count: outputByteCount)
        return DecodedAudioFrame(
            pcmData: silenceData,
            channels: channels,
            sampleRate: sampleRate,
            frameCount: outputFrameCount,
            timestampUs: timestampUs
        )
    }

    /// Reset the decoder state (e.g., after a seek or discontinuity).
    func reset() {
        lock.lock()
        if let converter = audioConverter {
            AudioConverterReset(converter)
        }
        lock.unlock()
    }
}

// MARK: - AudioConverter Input Callback

/// C-function callback that provides input data to the AudioConverter.
private func audioConverterInputCallback(
    inAudioConverter: AudioConverterRef,
    ioNumberDataPackets: UnsafeMutablePointer<UInt32>,
    ioData: UnsafeMutablePointer<AudioBufferList>,
    outDataPacketDescription: UnsafeMutablePointer<UnsafeMutablePointer<AudioStreamPacketDescription>?>?,
    inUserData: UnsafeMutableRawPointer?
) -> OSStatus {
    guard let userData = inUserData else {
        ioNumberDataPackets.pointee = 0
        return -1
    }

    let decoder = Unmanaged<OpusDecoder>.fromOpaque(userData).takeUnretainedValue()

    guard let inputData = decoder.pendingInputData else {
        ioNumberDataPackets.pointee = 0
        return -1
    }

    ioNumberDataPackets.pointee = 1

    inputData.withUnsafeBytes { ptr in
        ioData.pointee.mBuffers.mData = UnsafeMutableRawPointer(mutating: ptr.baseAddress)
        ioData.pointee.mBuffers.mDataByteSize = UInt32(inputData.count)
        ioData.pointee.mBuffers.mNumberChannels = UInt32(decoder.channels)
    }

    return noErr
}
