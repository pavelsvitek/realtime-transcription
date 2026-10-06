import Foundation

public struct SpeechError: Error, CustomStringConvertible, Sendable {
    public let message: String
    public var description: String { message }
}

/// A running speech command, which can be stopped from any thread.
private final class SpeechRun: @unchecked Sendable {
    private let process = Process()
    private let errors = Pipe()
    private let lock = NSLock()
    private var cancelled = false

    init(executable: URL, arguments: [String]) {
        process.executableURL = executable
        process.arguments = arguments
        process.standardError = errors
        process.standardOutput = FileHandle.nullDevice
    }

    func cancel() {
        lock.lock()
        cancelled = true
        let running = process.isRunning
        lock.unlock()
        if running { process.terminate() }
    }

    func run() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            process.terminationHandler = { [self] finished in
                lock.lock()
                let wasCancelled = cancelled
                lock.unlock()
                if wasCancelled {
                    continuation.resume(throwing: CancellationError())
                } else if finished.terminationStatus == 0 {
                    continuation.resume()
                } else {
                    let output = errors.fileHandleForReading.readDataToEndOfFile()
                    let reason = String(decoding: output, as: UTF8.self)
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    continuation.resume(throwing: SpeechError(
                        message: "say exited with \(finished.terminationStatus): \(reason)"
                    ))
                }
            }
            lock.lock()
            let alreadyCancelled = cancelled
            lock.unlock()
            if alreadyCancelled {
                continuation.resume(throwing: CancellationError())
                return
            }
            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }
}

/// Speech through macOS `say`. The command is a parameter so tests can run a
/// silent stand-in.
public enum Speech {
    public static let sayExecutable = URL(fileURLWithPath: "/usr/bin/say")

    /// Names of the installed voices, or nil when they cannot be listed.
    public static func installedVoices(executable: URL = sayExecutable) -> Set<String>? {
        let process = Process()
        process.executableURL = executable
        process.arguments = ["-v", "?"]
        let output = Pipe()
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            return nil
        }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { return nil }
        return voiceNames(from: String(decoding: data, as: UTF8.self))
    }

    /// Lines look like `Samantha            en_US    # Hello! ...`. The name
    /// can contain spaces and parentheses, and a long one is followed by a
    /// single space (`Eddy (English (UK)) en_GB    # ...`), so the name ends at
    /// the locale that precedes the `#` comment.
    public static func voiceNames(from listing: String) -> Set<String> {
        var names = Set<String>()
        for line in listing.split(separator: "\n") {
            if let locale = line.range(of: #"\s+[a-z]{2,3}_[A-Za-z0-9]+\s+#"#, options: .regularExpression) {
                names.insert(String(line[..<locale.lowerBound]))
            }
        }
        return names
    }

    public static func arguments(text: String, voice: String?, wordsPerMinute: Int?) -> [String] {
        var arguments: [String] = []
        if let voice { arguments += ["-v", voice] }
        if let wordsPerMinute { arguments += ["-r", String(wordsPerMinute)] }
        // "--" so a line that starts with a dash is still text.
        return arguments + ["--", text]
    }

    /// Speaks and returns when the speech has finished. Cancelling the task
    /// stops the speech at once and throws `CancellationError`.
    public static func say(
        _ text: String,
        voice: String?,
        wordsPerMinute: Int?,
        executable: URL = sayExecutable
    ) async throws {
        let run = SpeechRun(
            executable: executable,
            arguments: arguments(text: text, voice: voice, wordsPerMinute: wordsPerMinute)
        )
        try await withTaskCancellationHandler {
            try await run.run()
        } onCancel: {
            run.cancel()
        }
    }
}
