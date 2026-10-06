import Foundation
import Testing
@testable import FakeZoomCore

/// A stand-in for `say`: a script that records its arguments, then behaves as
/// the test needs. Nothing is ever spoken.
private func stub(_ body: String) throws -> URL {
    let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent("fake-zoom-tests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let script = directory.appendingPathComponent("say")
    try "#!/bin/sh\n\(body)\n".write(to: script, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: script.path)
    return script
}

@Test
func argumentsCarryVoiceRateAndAnUnambiguousText() {
    #expect(Speech.arguments(text: "Hello", voice: "Samantha", wordsPerMinute: 200)
        == ["-v", "Samantha", "-r", "200", "--", "Hello"])
    #expect(Speech.arguments(text: "-1 is negative", voice: nil, wordsPerMinute: nil)
        == ["--", "-1 is negative"])
}

@Test
func voiceNamesAreReadFromSaysListing() {
    let listing = """
    Albert              en_US    # Hello! My name is Albert.
    Eddy (English (UK)) en_GB    # Hello! My name is Eddy.
    Samantha            en_US    # Hello! My name is Samantha.
    Zuzana              cs_CZ    # Ahoj! Jmenuji se Zuzana.
    Grandma (German (Germany)) de_DE    # Hallo! Ich heiße Grandma.
    """
    #expect(Speech.voiceNames(from: listing) == [
        "Albert", "Eddy (English (UK))", "Samantha", "Zuzana", "Grandma (German (Germany))",
    ])
    #expect(Speech.voiceNames(from: "").isEmpty)
}

@Test
func speechReturnsWhenTheCommandFinishesAndPassesTheArguments() async throws {
    let record = FileManager.default.temporaryDirectory.appendingPathComponent("args-\(UUID().uuidString)")
    let say = try stub("printf '%s|' \"$@\" > '\(record.path)'; sleep 0.2")
    let started = ContinuousClock.now
    try await Speech.say("Good morning", voice: "Daniel", wordsPerMinute: 150, executable: say)
    #expect(ContinuousClock.now - started >= .milliseconds(150), "returns only after the command ends")
    #expect(try String(contentsOf: record, encoding: .utf8) == "-v|Daniel|-r|150|--|Good morning|")
}

@Test
func aFailingCommandReportsItsMessage() async throws {
    let say = try stub("echo \"Voice \\`Nope' not found\" >&2; exit 1")
    do {
        try await Speech.say("Hi", voice: "Nope", wordsPerMinute: nil, executable: say)
        Issue.record("expected a failure")
    } catch let error as SpeechError {
        #expect(error.message.contains("not found"))
        #expect(error.message.contains("exited with 1"))
    }
}

@Test
func aMissingCommandIsAnErrorNotACrash() async {
    let nowhere = URL(fileURLWithPath: "/nonexistent/say")
    await #expect(throws: (any Error).self) {
        try await Speech.say("Hi", voice: nil, wordsPerMinute: nil, executable: nowhere)
    }
    #expect(Speech.installedVoices(executable: nowhere) == nil)
}

@Test
func cancellingStopsTheSpeechAtOnce() async throws {
    let say = try stub("exec sleep 30")
    let started = ContinuousClock.now
    let task = Task { try await Speech.say("A very long sentence", voice: nil, wordsPerMinute: nil, executable: say) }
    try await Task.sleep(for: .milliseconds(300))
    task.cancel()
    await #expect(throws: CancellationError.self) { try await task.value }
    #expect(ContinuousClock.now - started < .seconds(5), "must not wait for the 30 s command")
}

@Test
func aTaskCancelledBeforeItStartsNeverSpeaks() async throws {
    let record = FileManager.default.temporaryDirectory.appendingPathComponent("ran-\(UUID().uuidString)")
    let say = try stub("touch '\(record.path)'")
    let task = Task {
        try await Task.sleep(for: .seconds(60))
        try await Speech.say("never", voice: nil, wordsPerMinute: nil, executable: say)
    }
    task.cancel()
    await #expect(throws: CancellationError.self) { try await task.value }
    #expect(!FileManager.default.fileExists(atPath: record.path))
}

@Test(.enabled(if: FileManager.default.isExecutableFile(atPath: "/usr/bin/say")))
func everyVoiceThisMacListsIsParsed() throws {
    let listing = Process()
    listing.executableURL = Speech.sayExecutable
    listing.arguments = ["-v", "?"]
    let pipe = Pipe()
    listing.standardOutput = pipe
    try listing.run()
    let output = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
    listing.waitUntilExit()

    let lines = output.split(separator: "\n").count
    let parsed = Speech.voiceNames(from: output)
    #expect(lines > 0)
    #expect(parsed.count == lines, "parsed \(parsed.count) of \(lines) lines")
    // Every default voice a participant gets should exist here, or the
    // scenario would fall back to the system voice.
    let installed = try #require(Speech.installedVoices())
    for person in Roster.all {
        #expect(installed.contains(person.voice), "\(person.voice) for \(person.name) is not installed")
    }
}
