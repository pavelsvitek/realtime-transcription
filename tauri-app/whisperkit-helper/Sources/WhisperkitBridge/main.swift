import Foundation
import WhisperKit

private let modelName = "large-v3-v20240930_626MB"
private let metadataFilename = "model-info.json"
private let minimumRealtimeSamples = WhisperKit.sampleRate * 10

private struct InitMessage: Decodable {
    let type: String
    let language: String
    let model: String
    let cacheDir: String
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

private struct DownloadedMessage: Encodable {
    let type = "downloaded"
    let model: String
    let modelPath: String
    let cacheDir: String
}

private struct ErrorMessage: Encodable {
    let type = "error"
    let message: String
}

private struct ReadyMessage: Encodable {
    let type = "ready"
    let model: String
}

private struct CommitMessage: Encodable {
    let type = "commit"
    let text: String
    let startMs: Int
    let endMs: Int
}

private struct PartialMessage: Encodable {
    let type = "partial"
    let text: String
    let startMs: Int
    let endMs: Int
}

private struct FinishedMessage: Encodable {
    let type = "finished"
}

private struct ModelMetadata: Codable {
    let model: String
    let modelPath: String
    let cacheDir: String
    let downloadedAt: String
}

private enum BridgeError: Error, LocalizedError {
    case invalidMessage(String)
    case invalidAudio(String)
    case missingMetadata(String)
    case unsupportedModel(String)

    var errorDescription: String? {
        switch self {
        case let .invalidMessage(message):
            return message
        case let .invalidAudio(message):
            return message
        case let .missingMetadata(message):
            return message
        case let .unsupportedModel(message):
            return message
        }
    }
}

@main
struct WhisperkitBridgeApp {
    static func main() async {
        do {
            let args = Array(CommandLine.arguments.dropFirst())
            if args.contains("--download-only") {
                let cacheDir = try cacheDirectory(from: args)
                try await downloadOnly(cacheDir: cacheDir)
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
            throw BridgeError.invalidMessage("First stdin message must be type=init")
        }
        guard initMessage.model == modelName else {
            throw BridgeError.unsupportedModel("Unsupported model \(initMessage.model); expected \(modelName)")
        }

        let cacheDir = URL(fileURLWithPath: initMessage.cacheDir, isDirectory: true)
        let metadata = try loadMetadata(cacheDir: cacheDir)
        let session = try await StreamSession(
            language: initMessage.language,
            inputSampleRate: initMessage.sampleRate,
            stream: initMessage.stream,
            modelPath: metadata.modelPath
        )

        emit(ReadyMessage(model: modelName))

        while let line = readLine(strippingNewline: true) {
            let basic = try JSONDecoder().decode(BasicMessage.self, from: Data(line.utf8))
            switch basic.type {
            case "audio":
                let message = try JSONDecoder().decode(AudioMessage.self, from: Data(line.utf8))
                try await session.pushAudio(base64PCM16: message.pcm16Base64)
            case "finish":
                try await session.finish()
                emit(FinishedMessage())
                return
            case "shutdown":
                emit(FinishedMessage())
                return
            default:
                throw BridgeError.invalidMessage("Unsupported stdin message type: \(basic.type)")
            }
        }
    }

    private static func downloadOnly(cacheDir: URL) async throws {
        try FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)

        let config = WhisperKitConfig(
            model: modelName,
            downloadBase: cacheDir,
            verbose: true,
            prewarm: true,
            load: false,
            download: true,
            useBackgroundDownloadSession: false
        )
        let whisperKit = try await WhisperKit(config)
        guard let modelFolder = whisperKit.modelFolder else {
            throw BridgeError.missingMetadata("WhisperKit did not resolve a model folder after download")
        }

        let metadata = ModelMetadata(
            model: modelName,
            modelPath: modelFolder.path,
            cacheDir: cacheDir.path,
            downloadedAt: ISO8601DateFormatter().string(from: Date())
        )

        let metadataURL = cacheDir.appending(path: metadataFilename)
        let data = try JSONEncoder().encode(metadata)
        try data.write(to: metadataURL, options: .atomic)

        emit(DownloadedMessage(model: modelName, modelPath: modelFolder.path, cacheDir: cacheDir.path))
    }

    private static func cacheDirectory(from args: [String]) throws -> URL {
        if let index = args.firstIndex(of: "--cache-dir"), args.indices.contains(index + 1) {
            return URL(fileURLWithPath: args[index + 1], isDirectory: true)
        }

        return defaultCacheDirectory()
    }

    private static func defaultCacheDirectory() -> URL {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home
            .appending(path: "Library")
            .appending(path: "Application Support")
            .appending(path: "com.pavel.tauri-app")
            .appending(path: "models")
            .appending(path: "whisperkit", directoryHint: .isDirectory)
    }

    private static func loadMetadata(cacheDir: URL) throws -> ModelMetadata {
        let metadataURL = cacheDir.appending(path: metadataFilename)
        guard FileManager.default.fileExists(atPath: metadataURL.path) else {
            throw BridgeError.missingMetadata(
                "Missing WhisperKit model metadata at \(metadataURL.path). Run tauri-app/scripts/setup-whisperkit.sh."
            )
        }

        let data = try Data(contentsOf: metadataURL)
        let metadata = try JSONDecoder().decode(ModelMetadata.self, from: data)
        guard FileManager.default.fileExists(atPath: metadata.modelPath) else {
            throw BridgeError.missingMetadata(
                "WhisperKit model path \(metadata.modelPath) does not exist. Re-run tauri-app/scripts/setup-whisperkit.sh."
            )
        }
        return metadata
    }
}

private actor StreamSession {
    private let whisperKit: WhisperKit
    private let language: String
    private let inputSampleRate: Int

    private var accumulatedSamples: [Float] = []
    private var lastTranscribedSampleCount = 0
    private var lastTentativeFingerprint: String?

    init(language: String, inputSampleRate: Int, stream: String, modelPath: String) async throws {
        self.language = language
        self.inputSampleRate = max(1, inputSampleRate)
        let _ = stream

        let config = WhisperKitConfig(
            model: modelName,
            modelFolder: modelPath,
            verbose: false,
            logLevel: .error,
            prewarm: true,
            load: true,
            download: false
        )
        self.whisperKit = try await WhisperKit(config)
    }

    func pushAudio(base64PCM16: String) async throws {
        let samples = try decodePCM16(base64PCM16, sampleRate: inputSampleRate)
        accumulatedSamples.append(contentsOf: samples)

        guard accumulatedSamples.count - lastTranscribedSampleCount >= minimumRealtimeSamples else {
            return
        }

        lastTranscribedSampleCount = accumulatedSamples.count
        try await emitRealtimePartial()
    }

    func finish() async throws {
        guard !accumulatedSamples.isEmpty else { return }
        let text = try await transcribeText(for: accumulatedSamples)
        let normalized = collapseRepeatedBigrams(in: text)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return }
        emit(CommitMessage(
            text: normalized,
            startMs: 0,
            endMs: Int((Double(accumulatedSamples.count) / Double(WhisperKit.sampleRate) * 1000.0).rounded())
        ))
        lastTentativeFingerprint = nil
    }

    private func emitRealtimePartial() async throws {
        let text = try await transcribeText(for: accumulatedSamples)
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalized.isEmpty else {
            lastTentativeFingerprint = nil
            return
        }

        let durationMs = Int((Double(accumulatedSamples.count) / Double(WhisperKit.sampleRate) * 1000.0).rounded())
        let fingerprint = "\(durationMs):\(normalized)"
        guard fingerprint != lastTentativeFingerprint else { return }

        lastTentativeFingerprint = fingerprint
        emit(PartialMessage(
            text: normalized,
            startMs: 0,
            endMs: durationMs
        ))
    }

    private func transcribeText(for samples: [Float]) async throws -> String {
        let options = DecodingOptions(
            verbose: false,
            task: .transcribe,
            language: language,
            temperature: 0.0,
            usePrefillPrompt: true,
            detectLanguage: false,
            withoutTimestamps: false,
            wordTimestamps: false,
            chunkingStrategy: .vad
        )
        let results = try await whisperKit.transcribe(audioArray: samples, decodeOptions: options)
        return results
            .map(\.text)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func collapseRepeatedBigrams(in text: String) -> String {
        var words = text.split(whereSeparator: \.isWhitespace).map(String.init)
        guard words.count >= 4 else { return words.joined(separator: " ") }

        var index = 0
        while index + 3 < words.count {
            if words[index] == words[index + 2] && words[index + 1] == words[index + 3] {
                words.removeSubrange((index + 2)...(index + 3))
                continue
            }
            index += 1
        }

        return words.joined(separator: " ")
    }

    private func decodePCM16(_ base64: String, sampleRate: Int) throws -> [Float] {
        guard let data = Data(base64Encoded: base64) else {
            throw BridgeError.invalidAudio("audio payload is not valid base64")
        }
        guard data.count % 2 == 0 else {
            throw BridgeError.invalidAudio("audio payload length must be a multiple of 2 bytes")
        }

        let int16Samples: [Float] = data.withUnsafeBytes { rawBuffer in
            let samples = rawBuffer.bindMemory(to: Int16.self)
            return samples.map { Float($0) / Float(Int16.max) }
        }

        if sampleRate == WhisperKit.sampleRate {
            return int16Samples
        }

        return resampleLinear(int16Samples, from: sampleRate, to: WhisperKit.sampleRate)
    }

    private func resampleLinear(_ samples: [Float], from sourceRate: Int, to targetRate: Int) -> [Float] {
        guard !samples.isEmpty, sourceRate > 0, targetRate > 0 else { return [] }
        if sourceRate == targetRate { return samples }

        let ratio = Double(targetRate) / Double(sourceRate)
        let outputCount = max(1, Int((Double(samples.count) * ratio).rounded()))
        var output = [Float](repeating: 0, count: outputCount)

        for index in 0..<outputCount {
            let sourceIndex = Double(index) / ratio
            let lower = Int(sourceIndex.rounded(.down))
            let upper = min(lower + 1, samples.count - 1)
            let fraction = Float(sourceIndex - Double(lower))
            let lowerValue = samples[min(lower, samples.count - 1)]
            let upperValue = samples[upper]
            output[index] = lowerValue + (upperValue - lowerValue) * fraction
        }

        return output
    }
}

private func emit<T: Encodable>(_ message: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    guard let data = try? encoder.encode(message), let line = String(data: data, encoding: .utf8) else {
        fputs("{\"type\":\"error\",\"message\":\"failed to encode helper response\"}\n", stderr)
        return
    }

    print(line)
    fflush(stdout)
}
