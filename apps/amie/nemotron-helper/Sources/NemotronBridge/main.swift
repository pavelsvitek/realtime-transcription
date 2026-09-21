import Darwin
import Foundation
import NemotronCore
import NemotronStreamingASR

private let modelID = "aufklarer/Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8"
private let modelDisplayName = "Nemotron 3.5 ASR Streaming 0.6B CoreML INT8"
private let targetSampleRate = 16_000
private let modelComponents = [
    "encoder.mlmodelc",
    "decoder.mlmodelc",
    "joint.mlmodelc",
    "config.json",
    "vocab.json",
    "languages.json",
]

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

private enum BridgeError: Error, LocalizedError {
    case invalidMessage(String)
    case incompleteModel(String)

    var errorDescription: String? {
        switch self {
        case let .invalidMessage(message), let .incompleteModel(message):
            message
        }
    }
}

@main
struct NemotronBridgeApp {
    static func main() async {
        do {
            let args = Array(CommandLine.arguments.dropFirst())
            if args.contains("--download-only") {
                let cacheRoot = try argument(named: "--cache-dir", in: args)
                try await downloadOnly(cacheRoot: URL(fileURLWithPath: cacheRoot, isDirectory: true))
                return
            }
            try await runBridge()
        } catch {
            emit(ErrorMessage(message: error.localizedDescription))
            Foundation.exit(1)
        }
    }

    private static func runBridge() async throws {
        guard let initLine = readLine(strippingNewline: true) else {
            throw BridgeError.invalidMessage("Expected init message on stdin")
        }
        let initMessage = try JSONDecoder().decode(InitMessage.self, from: Data(initLine.utf8))
        guard initMessage.type == "init" else {
            throw BridgeError.invalidMessage("First message must have type=init")
        }

        let bundleDir = URL(fileURLWithPath: initMessage.bundleDir, isDirectory: true)
        try validateModelBundle(bundleDir)

        emit(LoadingMessage(stage: "loading_models"))
        let model = try await NemotronStreamingASRModel.fromLocal(
            bundleDir: bundleDir,
            progressHandler: { _, stage in emit(LoadingMessage(stage: stage)) }
        )
        let session = try BridgeSession(
            model: model,
            inputSampleRate: initMessage.sampleRate,
            stream: initMessage.stream
        )
        emit(ReadyMessage())

        while let line = readLine(strippingNewline: true) {
            let basic = try JSONDecoder().decode(BasicMessage.self, from: Data(line.utf8))
            switch basic.type {
            case "audio":
                let message = try JSONDecoder().decode(AudioMessage.self, from: Data(line.utf8))
                try session.pushAudio(base64PCM16: message.pcm16Base64)
            case "finish":
                try session.finish()
                emit(FinishedMessage())
                return
            case "shutdown":
                emit(FinishedMessage())
                return
            default:
                throw BridgeError.invalidMessage("Unsupported message type: \(basic.type)")
            }
        }
    }

    private static func downloadOnly(cacheRoot: URL) async throws {
        try FileManager.default.createDirectory(at: cacheRoot, withIntermediateDirectories: true)
        setenv("QWEN3_CACHE_DIR", cacheRoot.path, 1)

        let bundleDir = modelBundleDirectory(cacheRoot: cacheRoot)
        let model: NemotronStreamingASRModel
        if modelBundleIsComplete(bundleDir) {
            emit(LoadingMessage(stage: "loading_cached_models"))
            model = try await NemotronStreamingASRModel.fromLocal(bundleDir: bundleDir)
        } else {
            emit(LoadingMessage(stage: "downloading_models"))
            model = try await NemotronStreamingASRModel.fromPretrained(
                modelId: modelID,
                progressHandler: { progress, stage in
                    emit(LoadingMessage(stage: "\(stage) \(Int(progress * 100))%"))
                }
            )
        }

        emit(LoadingMessage(stage: "warming_models"))
        try autoreleasepool {
            try model.warmUp()
        }
        try validateModelBundle(bundleDir)
        emit(DownloadedMessage(modelPath: bundleDir.path))
    }
}

private final class BridgeSession {
    private let model: NemotronStreamingASRModel
    private var recognizer: StreamingSession
    private let inputSampleRate: Int
    private let stream: String
    private var clock = SessionSampleClock(sampleRate: targetSampleRate)
    private var boundaryDetector: SpeechBoundaryDetector
    private var lastPartialText = ""
    private var utteranceStartSample = 0

    init(model: NemotronStreamingASRModel, inputSampleRate: Int, stream: String) throws {
        self.model = model
        recognizer = try model.createSession(language: "en-US")
        self.inputSampleRate = max(1, inputSampleRate)
        self.stream = stream

        let environment = ProcessInfo.processInfo.environment
        let rmsThreshold = Float(environment["NEMOTRON_SPEECH_RMS_THRESHOLD"] ?? "") ?? 0.01
        let silenceMs = Int(environment["NEMOTRON_EOU_SILENCE_MS"] ?? "") ?? 800
        let minimumSpeechMs = Int(environment["NEMOTRON_MIN_SPEECH_MS"] ?? "") ?? 300
        boundaryDetector = SpeechBoundaryDetector(
            sampleRate: targetSampleRate,
            rmsThreshold: rmsThreshold,
            trailingSilenceMilliseconds: silenceMs,
            minimumSpeechMilliseconds: minimumSpeechMs
        )
    }

    func pushAudio(base64PCM16: String) throws {
        let decoded = try decodePCM16Base64(base64PCM16)
        let samples = resampleLinear(decoded, from: inputSampleRate, to: targetSampleRate)
        guard !samples.isEmpty else { return }

        let chunkStart = clock.totalSamples
        let reachedBoundary = boundaryDetector.observe(samples, absoluteStartSample: chunkStart)
        clock.advance(by: samples.count)

        let partials = try autoreleasepool {
            try recognizer.pushAudio(samples)
        }
        emitLatestPartial(partials)

        if reachedBoundary {
            try commitCurrentUtterance()
        }
    }

    func finish() throws {
        try commitCurrentUtterance(force: true, resetSession: false)
    }

    private func emitLatestPartial(
        _ partials: [NemotronStreamingASRModel.PartialTranscript]
    ) {
        guard boundaryDetector.speechStartSample != nil,
              let latest = partials.last?.text.trimmingCharacters(in: .whitespacesAndNewlines),
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

    private func commitCurrentUtterance(
        force: Bool = false,
        resetSession: Bool = true
    ) throws {
        let hadSpeech = boundaryDetector.speechStartSample != nil
        let finals = try autoreleasepool {
            try recognizer.finalize()
        }

        if (hadSpeech || force),
           let text = finals.last?.text.trimmingCharacters(in: .whitespacesAndNewlines),
           !text.isEmpty
        {
            emit(CommitMessage(
                text: text,
                startMs: clock.milliseconds(
                    for: boundaryDetector.speechStartSample ?? utteranceStartSample
                ),
                endMs: clock.elapsedMilliseconds
            ))
        }

        if resetSession {
            recognizer = try model.createSession(language: "en-US")
            boundaryDetector.reset()
            utteranceStartSample = clock.totalSamples
            lastPartialText = ""
            fputs("[\(stream)] Nemotron session reset at \(clock.elapsedMilliseconds)ms\n", stderr)
        }
    }
}

private func modelBundleDirectory(cacheRoot: URL) -> URL {
    cacheRoot
        .appendingPathComponent("qwen3-speech", isDirectory: true)
        .appendingPathComponent("models", isDirectory: true)
        .appendingPathComponent("aufklarer", isDirectory: true)
        .appendingPathComponent("Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8", isDirectory: true)
}

private func modelBundleIsComplete(_ bundleDir: URL) -> Bool {
    modelComponents.allSatisfy {
        FileManager.default.fileExists(atPath: bundleDir.appendingPathComponent($0).path)
    }
}

private func validateModelBundle(_ bundleDir: URL) throws {
    let missing = modelComponents.filter {
        !FileManager.default.fileExists(atPath: bundleDir.appendingPathComponent($0).path)
    }
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
