import AVFoundation
import CoreML
import Darwin
import FluidAudio
import Foundation
import NemotronCore
import os

private let modelDisplayName = "Nemotron Labs Unified ASR 0.6B CoreML"
private let targetSampleRate = 16_000

private struct InitMessage: Decodable {
    let type: String
    let bundleDir: String
    let sampleRate: Int
    let stream: String
}

private struct AudioMessage: Decodable {
    let type: String
    let pcm16Base64: String
}

private struct BasicMessage: Decodable {
    let type: String
}

private struct ReadyMessage: Encodable {
    let type = "ready"
    let model = modelDisplayName
}

private struct LoadingMessage: Encodable {
    let type = "loading"
    let stage: String
}

private struct DownloadedMessage: Encodable {
    let type = "downloaded"
    let model = modelDisplayName
    let modelPath: String
}

private struct PartialMessage: Encodable {
    let type = "partial"
    let text: String
    let startMs: Int
    let endMs: Int
}

private struct CommitMessage: Encodable {
    let type = "commit"
    let text: String
    let startMs: Int
    let endMs: Int
}

private struct ErrorMessage: Encodable {
    let type = "error"
    let message: String
}

private struct FinishedMessage: Encodable {
    let type = "finished"
}

private struct BoundaryDoneMessage: Encodable {
    let type = "boundary-done"
}

private enum BridgeError: Error, LocalizedError {
    case invalidMessage(String)
    case incompleteModel(String)
    case audioBufferCreationFailed

    var errorDescription: String? {
        switch self {
        case let .invalidMessage(message), let .incompleteModel(message):
            message
        case .audioBufferCreationFailed:
            "Failed to allocate 16 kHz PCM audio buffer"
        }
    }
}

private final class ProgressThrottle: Sendable {
    private let lastPercent = OSAllocatedUnfairLock(initialState: -1)

    func shouldEmit(percent: Int) -> Bool {
        lastPercent.withLock { current in
            guard percent != current else { return false }
            current = percent
            return true
        }
    }
}

@main
struct NemotronBridgeApp {
    static func main() async {
        // Keep FluidAudio diagnostic logs off stderr unless warning/error.
        AppLogger.minimumLevel = .warning

        do {
            let args = Array(CommandLine.arguments.dropFirst())
            let options = UnifiedRuntimeOptions.fromEnvironment(ProcessInfo.processInfo.environment)
            if args.contains("--download-only") {
                let cacheRoot = try argument(named: "--cache-dir", in: args)
                try await downloadOnly(
                    cacheRoot: URL(fileURLWithPath: cacheRoot, isDirectory: true),
                    options: options
                )
                return
            }
            try await runBridge(options: options)
        } catch {
            emit(ErrorMessage(message: error.localizedDescription))
            Foundation.exit(1)
        }
    }

    private static func runBridge(options: UnifiedRuntimeOptions) async throws {
        guard let initLine = readLine(strippingNewline: true) else {
            throw BridgeError.invalidMessage("Expected init message on stdin")
        }
        let initMessage = try JSONDecoder().decode(InitMessage.self, from: Data(initLine.utf8))
        guard initMessage.type == "init" else {
            throw BridgeError.invalidMessage("First message must have type=init")
        }

        let bundleDir = URL(fileURLWithPath: initMessage.bundleDir, isDirectory: true)
        try validateModelBundle(bundleDir, components: options.requiredBundleComponents)

        emit(LoadingMessage(stage: "loading_models"))
        let manager = makeManager(options: options)
        try await manager.loadModels(from: bundleDir)

        let session = try BridgeSession(
            manager: manager,
            inputSampleRate: initMessage.sampleRate,
            stream: initMessage.stream,
            latencyMs: options.latencyTier.rawValue
        )
        emit(ReadyMessage())

        while let line = readLine(strippingNewline: true) {
            let basic = try JSONDecoder().decode(BasicMessage.self, from: Data(line.utf8))
            switch basic.type {
            case "audio":
                let message = try JSONDecoder().decode(AudioMessage.self, from: Data(line.utf8))
                try await session.pushAudio(base64PCM16: message.pcm16Base64)
            case "boundary":
                try await session.boundary()
            case "finish":
                try await session.finish()
                emit(FinishedMessage())
                return
            case "shutdown":
                await manager.cleanup()
                emit(FinishedMessage())
                return
            default:
                throw BridgeError.invalidMessage("Unsupported message type: \(basic.type)")
            }
        }
    }

    private static func downloadOnly(
        cacheRoot: URL,
        options: UnifiedRuntimeOptions
    ) async throws {
        try FileManager.default.createDirectory(at: cacheRoot, withIntermediateDirectories: true)

        let bundleDir = modelBundleDirectory(cacheRoot: cacheRoot)
        let manager = makeManager(options: options)
        if modelBundleIsComplete(bundleDir, components: options.requiredBundleComponents) {
            emit(LoadingMessage(stage: "loading_cached_models"))
            try await manager.loadModels(from: bundleDir)
        } else {
            emit(LoadingMessage(stage: "downloading_models 0%"))
            let throttle = ProgressThrottle()
            try await manager.loadModels(
                to: cacheRoot,
                progressHandler: { progress in
                    let pct = max(0, min(100, Int((progress.fractionCompleted * 100.0).rounded())))
                    if throttle.shouldEmit(percent: pct) {
                        emit(LoadingMessage(stage: "downloading_models \(pct)%"))
                    }
                }
            )
        }

        emit(LoadingMessage(stage: "warming_models"))
        try await warmUp(manager: manager)
        try validateModelBundle(bundleDir, components: options.requiredBundleComponents)
        emit(DownloadedMessage(modelPath: bundleDir.path))
    }

    private static func makeManager(options: UnifiedRuntimeOptions) -> StreamingUnifiedAsrManager {
        let language = NemotronUnifiedLanguage(rawValue: options.language) ?? .en
        let unifiedConfig = UnifiedConfig(
            leftFrames: options.latencyTier.leftFrames,
            chunkFrames: options.latencyTier.chunkFrames,
            rightFrames: options.latencyTier.rightFrames,
            family: .nemotronMultilingual(language)
        )
        let precision: UnifiedEncoderPrecision = options.precision == .fp16 ? .fp16 : .int8
        return StreamingUnifiedAsrManager(
            config: unifiedConfig,
            encoderPrecision: precision
        )
    }

    private static func warmUp(manager: StreamingUnifiedAsrManager) async throws {
        guard let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: Double(targetSampleRate),
            channels: 1,
            interleaved: false
        ) else {
            throw BridgeError.audioBufferCreationFailed
        }
        let silence = [Float](repeating: 0, count: targetSampleRate)
        let buffer = try makePCMBuffer(from: silence, format: format)
        try await manager.appendAudio(buffer)
        _ = try await manager.finish()
        try await manager.reset()
    }
}

private final class BridgeSession {
    private let manager: StreamingUnifiedAsrManager
    private let audioFormat: AVAudioFormat
    private let inputSampleRate: Int
    private let stream: String
    private var clock = SessionSampleClock(sampleRate: targetSampleRate)
    private var boundaryDetector: SpeechBoundaryDetector
    private var utteranceCursor = UtteranceCursor()
    private var lastPartialText = ""
    private var utteranceStartSample = 0

    init(
        manager: StreamingUnifiedAsrManager,
        inputSampleRate: Int,
        stream: String,
        latencyMs: Int
    ) throws {
        self.manager = manager
        guard let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: Double(targetSampleRate),
            channels: 1,
            interleaved: false
        ) else {
            throw BridgeError.audioBufferCreationFailed
        }
        audioFormat = format
        self.inputSampleRate = max(1, inputSampleRate)
        self.stream = stream

        let environment = ProcessInfo.processInfo.environment
        let rmsThreshold = Float(environment["NEMOTRON_SPEECH_RMS_THRESHOLD"] ?? "") ?? 0.01
        let configuredSilenceMs = Int(environment["NEMOTRON_EOU_SILENCE_MS"] ?? "") ?? 800
        // Wait at least one streaming window latency of trailing silence before
        // slicing a commit so the utterance has already cleared the model's
        // right-context holdback without forcing an encoder/decoder reset.
        let effectiveSilenceMs = max(configuredSilenceMs, latencyMs)
        let minimumSpeechMs = Int(environment["NEMOTRON_MIN_SPEECH_MS"] ?? "") ?? 300
        boundaryDetector = SpeechBoundaryDetector(
            sampleRate: targetSampleRate,
            rmsThreshold: rmsThreshold,
            trailingSilenceMilliseconds: effectiveSilenceMs,
            minimumSpeechMilliseconds: minimumSpeechMs
        )
    }

    func pushAudio(base64PCM16: String) async throws {
        let decoded = try decodePCM16Base64(base64PCM16)
        let samples = resampleLinear(decoded, from: inputSampleRate, to: targetSampleRate)
        guard !samples.isEmpty else { return }

        let chunkStart = clock.totalSamples
        let reachedBoundary = boundaryDetector.observe(samples, absoluteStartSample: chunkStart)
        clock.advance(by: samples.count)

        let buffer = try makePCMBuffer(from: samples, format: audioFormat)
        try await manager.appendAudio(buffer)
        try await manager.processBufferedAudio()
        _ = await manager.consumeTokenTimings()

        let fullTranscript = await manager.getPartialTranscript()
        emitLatestPartial(fullTranscript)

        if reachedBoundary {
            commitSilenceBoundary(from: fullTranscript)
        }
    }

    func finish() async throws {
        try await flushAndCommit(resetSession: false)
    }

    /// Speaker change or mute. Flushes the right-context holdback, commits any
    /// remaining text (even if speech never crossed the RMS threshold), and
    /// resets the model state so the next speaker starts clean.
    /// `boundary-done` is always emitted so the Rust side never blocks waiting
    /// for an empty commit.
    func boundary() async throws {
        try await flushAndCommit(resetSession: true)
        emit(BoundaryDoneMessage())
    }

    private func emitLatestPartial(_ fullTranscript: String) {
        let latest = utteranceCursor.pendingText(from: fullTranscript)
        guard boundaryDetector.speechStartSample != nil,
              !latest.isEmpty,
              latest != lastPartialText
        else {
            return
        }

        lastPartialText = latest
        emit(PartialMessage(
            text: latest,
            startMs: clock.milliseconds(
                for: boundaryDetector.speechStartSample ?? utteranceStartSample
            ),
            endMs: clock.elapsedMilliseconds
        ))
    }

    private func commitSilenceBoundary(from fullTranscript: String) {
        let text = utteranceCursor.commit(from: fullTranscript)
        if !text.isEmpty {
            emit(CommitMessage(
                text: text,
                startMs: clock.milliseconds(
                    for: boundaryDetector.speechStartSample ?? utteranceStartSample
                ),
                endMs: clock.elapsedMilliseconds
            ))
        }
        boundaryDetector.reset()
        utteranceStartSample = clock.totalSamples
        lastPartialText = ""
    }

    private func flushAndCommit(resetSession: Bool) async throws {
        let rawFinal = try await manager.finish()
        _ = await manager.consumeTokenTimings()
        let text = utteranceCursor.commit(from: rawFinal)

        if !text.isEmpty {
            emit(CommitMessage(
                text: text,
                startMs: clock.milliseconds(
                    for: boundaryDetector.speechStartSample ?? utteranceStartSample
                ),
                endMs: clock.elapsedMilliseconds
            ))
        }

        if resetSession {
            try await manager.reset()
            utteranceCursor.reset()
            boundaryDetector.reset()
            utteranceStartSample = clock.totalSamples
            lastPartialText = ""
            fputs("[\(stream)] Nemotron session reset at \(clock.elapsedMilliseconds)ms\n", stderr)
        }
    }
}

private func makePCMBuffer(from samples: [Float], format: AVAudioFormat) throws -> AVAudioPCMBuffer {
    let frameCount = AVAudioFrameCount(samples.count)
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount),
          let channelData = buffer.floatChannelData
    else {
        throw BridgeError.audioBufferCreationFailed
    }
    buffer.frameLength = frameCount
    samples.withUnsafeBufferPointer { source in
        if let baseAddress = source.baseAddress {
            channelData[0].update(from: baseAddress, count: samples.count)
        }
    }
    return buffer
}

private func modelBundleDirectory(cacheRoot: URL) -> URL {
    cacheRoot.appendingPathComponent(Repo.nemotronUnified.folderName, isDirectory: true)
}

private func componentIsComplete(_ component: String, in bundleDir: URL) -> Bool {
    let path = bundleDir.appendingPathComponent(component)
    if component.hasSuffix(".mlmodelc") {
        return FileManager.default.fileExists(
            atPath: path.appendingPathComponent("coremldata.bin").path
        )
    }
    return FileManager.default.fileExists(atPath: path.path)
}

private func modelBundleIsComplete(_ bundleDir: URL, components: [String]) -> Bool {
    components.allSatisfy { componentIsComplete($0, in: bundleDir) }
}

private func validateModelBundle(_ bundleDir: URL, components: [String]) throws {
    let missing = components.filter { !componentIsComplete($0, in: bundleDir) }
    guard missing.isEmpty else {
        throw BridgeError.incompleteModel(
            "Nemotron bundle at \(bundleDir.path) is incomplete; missing \(missing.joined(separator: ", ")). Run scripts/setup-nemotron.sh."
        )
    }
}

private func argument(named name: String, in args: [String]) throws -> String {
    guard let index = args.firstIndex(of: name), args.indices.contains(index + 1) else {
        throw BridgeError.invalidMessage("Missing required argument \(name)")
    }
    return args[index + 1]
}

private func emit<T: Encodable>(_ value: T) {
    guard let data = try? JSONEncoder().encode(value),
          let line = String(data: data, encoding: .utf8)
    else {
        fputs("{\"type\":\"error\",\"message\":\"failed to encode helper response\"}\n", stderr)
        return
    }
    print(line)
    fflush(stdout)
}
