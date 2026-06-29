import Foundation
import WhisperKit

private let modelName = "large-v3-v20240930_626MB"
private let metadataFilename = "model-info.json"
/// How much new audio (at 16 kHz) before we run a streaming decode cycle.
private let streamingTriggerSamples = WhisperKit.sampleRate * 10
/// Max audio decoded for a live partial hypothesis (tail window).
private let partialWindowSamples = WhisperKit.sampleRate * 30
/// Min uncommitted audio before we emit an incremental commit.
private let commitTriggerSamples = WhisperKit.sampleRate * 15
/// Max audio per commit chunk (Whisper-style ~30 s windows).
private let commitChunkSamples = WhisperKit.sampleRate * 30
/// Context retained after trimming committed prefix from the ring buffer.
private let contextOverlapSamples = WhisperKit.sampleRate * 2
private let requiredModelComponents = [
    "MelSpectrogram.mlmodelc",
    "AudioEncoder.mlmodelc",
    "TextDecoder.mlmodelc",
]

private struct InitMessage: Decodable {
    let type: String
    let language: String
    let model: String
    let cacheDir: String
    let sampleRate: Int
    let stream: String
    let disablePartials: Bool?
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
    let tokenizerPath: String
}

private struct ErrorMessage: Encodable {
    let type = "error"
    let message: String
}

private struct LoadingMessage: Encodable {
    let type = "loading"
    let stage: String
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
    let tokenizerPath: String?
}

private enum BridgeError: Error, LocalizedError {
    case invalidMessage(String)
    case invalidAudio(String)
    case missingMetadata(String)
    case unsupportedModel(String)
    case incompleteCache(String)

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
        case let .incompleteCache(message):
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
        try assertCacheComplete(cacheDir: cacheDir, metadata: metadata)

        let session = try await StreamSession(
            language: initMessage.language,
            inputSampleRate: initMessage.sampleRate,
            stream: initMessage.stream,
            cacheDir: cacheDir,
            modelPath: metadata.modelPath,
            disablePartials: initMessage.disablePartials ?? false
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

    /// Idempotent pre-flight: download, cache tokenizer, warm CoreML specialization.
    private static func downloadOnly(cacheDir: URL) async throws {
        try FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)

        let existingMetadata = try? loadMetadata(cacheDir: cacheDir)
        if isCacheComplete(cacheDir: cacheDir, metadata: existingMetadata) {
            let metadata = existingMetadata!
            let tokenizerPath = metadata.tokenizerPath ?? findTokenizerJSON(in: cacheDir)?.path ?? ""
            emit(DownloadedMessage(
                model: modelName,
                modelPath: metadata.modelPath,
                cacheDir: cacheDir.path,
                tokenizerPath: tokenizerPath
            ))
            return
        }

        emit(LoadingMessage(stage: "downloading_models"))

        let modelPath: String
        if let metadata = existingMetadata,
           FileManager.default.fileExists(atPath: metadata.modelPath),
           modelComponentsExist(at: URL(fileURLWithPath: metadata.modelPath)) {
            modelPath = metadata.modelPath
        } else {
            let downloadConfig = WhisperKitConfig(
                model: modelName,
                downloadBase: cacheDir,
                tokenizerFolder: cacheDir,
                computeOptions: computeOptions(),
                verbose: true,
                logLevel: .info,
                prewarm: false,
                load: false,
                download: true,
                useBackgroundDownloadSession: true
            )
            let downloader = try await WhisperKit(downloadConfig)
            guard let modelFolder = downloader.modelFolder else {
                throw BridgeError.missingMetadata("WhisperKit did not resolve a model folder after download")
            }
            modelPath = modelFolder.path
        }

        emit(LoadingMessage(stage: "loading_models"))
        let whisperKit = try await loadWhisperKitOffline(
            cacheDir: cacheDir,
            modelFolder: modelPath
        )

        guard let tokenizerPath = findTokenizerJSON(in: cacheDir)?.path else {
            throw BridgeError.incompleteCache(
                "Tokenizer was not cached under \(cacheDir.path) after setup. Check network and re-run tauri-app/scripts/setup-whisperkit.sh."
            )
        }

        try assertModelComponents(at: URL(fileURLWithPath: modelPath))

        let metadata = ModelMetadata(
            model: modelName,
            modelPath: modelPath,
            cacheDir: cacheDir.path,
            downloadedAt: ISO8601DateFormatter().string(from: Date()),
            tokenizerPath: tokenizerPath
        )

        let metadataURL = cacheDir.appending(path: metadataFilename)
        let data = try JSONEncoder().encode(metadata)
        try data.write(to: metadataURL, options: .atomic)

        await whisperKit.unloadModels()

        emit(DownloadedMessage(
            model: modelName,
            modelPath: modelPath,
            cacheDir: cacheDir.path,
            tokenizerPath: tokenizerPath
        ))
    }
}

private func loadWhisperKitOffline(
    cacheDir: URL,
    modelFolder: String
) async throws -> WhisperKit {
        emit(LoadingMessage(stage: "setup"))

        let config = WhisperKitConfig(
            model: modelName,
            downloadBase: cacheDir,
            modelFolder: modelFolder,
            tokenizerFolder: cacheDir,
            computeOptions: computeOptions(),
            verbose: true,
            logLevel: .info,
            prewarm: false,
            load: false,
            download: false,
            useBackgroundDownloadSession: true
        )

        let whisperKit = try await WhisperKit(config)

        emit(LoadingMessage(stage: "specializing"))
        do {
            try await whisperKit.loadModels()
        } catch {
            throw BridgeError.missingMetadata(
                "Failed to load WhisperKit models from local cache. Re-run tauri-app/scripts/setup-whisperkit.sh. Error: \(error.localizedDescription)"
            )
        }

    return whisperKit
}

private func computeOptions() -> ModelComputeOptions {
        let useANE = ProcessInfo.processInfo.environment["WHISPERKIT_USE_ANE"] == "1"
        if useANE {
            return ModelComputeOptions()
        }
        return ModelComputeOptions(
            audioEncoderCompute: .cpuAndGPU,
            textDecoderCompute: .cpuAndGPU
    )
}

private func cacheDirectory(from args: [String]) throws -> URL {
        if let index = args.firstIndex(of: "--cache-dir"), args.indices.contains(index + 1) {
            return URL(fileURLWithPath: args[index + 1], isDirectory: true)
        }

    return defaultCacheDirectory()
}

private func defaultCacheDirectory() -> URL {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home
            .appending(path: "Library")
            .appending(path: "Application Support")
            .appending(path: "com.pavel.tauri-app")
            .appending(path: "models")
        .appending(path: "whisperkit", directoryHint: .isDirectory)
}

private func loadMetadata(cacheDir: URL) throws -> ModelMetadata {
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

private func isCacheComplete(cacheDir: URL, metadata: ModelMetadata?) -> Bool {
        guard let metadata else { return false }
        let modelURL = URL(fileURLWithPath: metadata.modelPath)
        guard modelComponentsExist(at: modelURL) else { return false }

        if let tokenizerPath = metadata.tokenizerPath,
           FileManager.default.fileExists(atPath: tokenizerPath) {
            return true
        }

    return findTokenizerJSON(in: cacheDir) != nil
}

private func assertCacheComplete(cacheDir: URL, metadata: ModelMetadata) throws {
        guard isCacheComplete(cacheDir: cacheDir, metadata: metadata) else {
            throw BridgeError.incompleteCache(
                "WhisperKit cache at \(cacheDir.path) is incomplete (missing model components or tokenizer). Run tauri-app/scripts/setup-whisperkit.sh."
            )
        }
    try assertModelComponents(at: URL(fileURLWithPath: metadata.modelPath))
}

private func modelComponentsExist(at modelURL: URL) -> Bool {
        requiredModelComponents.allSatisfy { component in
            FileManager.default.fileExists(atPath: modelURL.appendingPathComponent(component).path)
    }
}

private func assertModelComponents(at modelURL: URL) throws {
        for component in requiredModelComponents {
            let path = modelURL.appendingPathComponent(component).path
            guard FileManager.default.fileExists(atPath: path) else {
                throw BridgeError.incompleteCache(
                    "Missing \(component) at \(path). Run tauri-app/scripts/setup-whisperkit.sh."
                )
            }
    }
}

private func findTokenizerJSON(in cacheDir: URL) -> URL? {
        guard let enumerator = FileManager.default.enumerator(
            at: cacheDir,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else {
            return nil
        }

        var matches: [URL] = []
        for case let fileURL as URL in enumerator {
            guard fileURL.lastPathComponent == "tokenizer.json" else { continue }
            matches.append(fileURL)
        }

    return matches.first { $0.path.contains("whisper-large-v3") } ?? matches.first
}

private actor StreamSession {
    private let whisperKit: WhisperKit
    private let language: String
    private let inputSampleRate: Int
    private let disablePartials: Bool

    /// Mono PCM resampled to WhisperKit.sampleRate (16 kHz).
    private var accumulatedSamples: [Float] = []
    /// Sample index in `accumulatedSamples` through which text has been committed.
    private var committedSampleIndex = 0
    /// `accumulatedSamples.count` at the last streaming trigger.
    private var lastStreamingTriggerCount = 0
    private var lastTentativeFingerprint: String?
    private var streamingTask: Task<Void, Never>?
    private var pendingStreamingWork = false

    init(
        language: String,
        inputSampleRate: Int,
        stream: String,
        cacheDir: URL,
        modelPath: String,
        disablePartials: Bool
    ) async throws {
        self.language = language
        self.inputSampleRate = max(1, inputSampleRate)
        self.disablePartials = disablePartials
        let _ = stream

        self.whisperKit = try await loadWhisperKitOffline(
            cacheDir: cacheDir,
            modelFolder: modelPath
        )
    }

    func pushAudio(base64PCM16: String) async throws {
        let samples = try decodePCM16(base64PCM16, sampleRate: inputSampleRate)
        accumulatedSamples.append(contentsOf: samples)

        guard !disablePartials else { return }

        guard accumulatedSamples.count - lastStreamingTriggerCount >= streamingTriggerSamples else {
            return
        }

        lastStreamingTriggerCount = accumulatedSamples.count
        scheduleStreamingWork()
    }

    func finish() async throws {
        guard !accumulatedSamples.isEmpty else { return }

        if disablePartials {
            try await emitFullBufferCommit()
            return
        }

        if let task = streamingTask {
            await task.value
        }

        try await commitTailIfNeeded()
        lastTentativeFingerprint = nil
    }

    // MARK: - Streaming (non-blocking from pushAudio)

    private func scheduleStreamingWork() {
        if streamingTask != nil {
            pendingStreamingWork = true
            return
        }

        streamingTask = Task { [weak self] in
            guard let self else { return }
            await self.runStreamingCycle()
            await self.streamingTaskFinished()
        }
    }

    private func streamingTaskFinished() {
        streamingTask = nil
        if pendingStreamingWork {
            pendingStreamingWork = false
            scheduleStreamingWork()
        }
    }

    private func runStreamingCycle() async {
        do {
            while accumulatedSamples.count - committedSampleIndex >= commitTriggerSamples {
                try await commitNextChunk()
            }
            try await emitWindowedPartial()
        } catch {
            emit(ErrorMessage(message: "Streaming decode failed: \(error.localizedDescription)"))
        }
    }

    /// Commits up to `commitChunkSamples` of uncommitted audio (independent chunk, no full-buffer scan).
    private func commitNextChunk() async throws {
        let total = accumulatedSamples.count
        guard total > committedSampleIndex else { return }

        let chunkEnd = min(total, committedSampleIndex + commitChunkSamples)
        let window = Array(accumulatedSamples[committedSampleIndex..<chunkEnd])
        guard !window.isEmpty else { return }

        let text = collapseRepeatedBigrams(in: try await transcribeText(for: window))
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if !text.isEmpty {
            emit(CommitMessage(
                text: text,
                startMs: sampleIndexToMs(committedSampleIndex),
                endMs: sampleIndexToMs(chunkEnd)
            ))
        }

        committedSampleIndex = chunkEnd
        trimBufferIfNeeded()
    }

    /// Live UI hypothesis: decode only the tail window, never the full session buffer.
    private func emitWindowedPartial() async throws {
        let total = accumulatedSamples.count
        guard total > committedSampleIndex else {
            lastTentativeFingerprint = nil
            return
        }

        let windowStart = max(committedSampleIndex, total - partialWindowSamples)
        let window = Array(accumulatedSamples[windowStart..<total])
        guard !window.isEmpty else { return }

        let text = try await transcribeText(for: window)
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            lastTentativeFingerprint = nil
            return
        }

        let startMs = sampleIndexToMs(windowStart)
        let endMs = sampleIndexToMs(total)
        let fingerprint = "\(startMs):\(endMs):\(normalized)"
        guard fingerprint != lastTentativeFingerprint else { return }

        lastTentativeFingerprint = fingerprint
        emit(PartialMessage(text: normalized, startMs: startMs, endMs: endMs))
    }

    private func commitTailIfNeeded() async throws {
        let total = accumulatedSamples.count
        guard total > committedSampleIndex else { return }

        let window = Array(accumulatedSamples[committedSampleIndex..<total])
        let text = collapseRepeatedBigrams(in: try await transcribeText(for: window))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        emit(CommitMessage(
            text: text,
            startMs: sampleIndexToMs(committedSampleIndex),
            endMs: sampleIndexToMs(total)
        ))
        committedSampleIndex = total
    }

    private func emitFullBufferCommit() async throws {
        let text = collapseRepeatedBigrams(in: try await transcribeText(for: accumulatedSamples))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        emit(CommitMessage(
            text: text,
            startMs: 0,
            endMs: sampleIndexToMs(accumulatedSamples.count)
        ))
    }

    private func sampleIndexToMs(_ index: Int) -> Int {
        Int((Double(index) / Double(WhisperKit.sampleRate) * 1000.0).rounded())
    }

    private func trimBufferIfNeeded() {
        let keepFrom = max(0, committedSampleIndex - contextOverlapSamples)
        guard keepFrom > 0 else { return }

        accumulatedSamples.removeFirst(keepFrom)
        committedSampleIndex -= keepFrom
        lastStreamingTriggerCount = max(0, lastStreamingTriggerCount - keepFrom)
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
