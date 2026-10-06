import AppKit
import FakeZoomCore
import Foundation

/// Plays a scenario against the call: marks people speaking and, unless audio
/// is off, speaks their lines. Cancelling the task stops it at once and
/// clears every mark it set.
@MainActor
final class ScenarioRunner {
    private let call: CallModel
    private let audio: Bool
    private let installedVoices: Set<String>?
    private let sayExecutable: URL

    init(call: CallModel, audio: Bool, installedVoices: Set<String>?, sayExecutable: URL) {
        self.call = call
        self.audio = audio
        self.installedVoices = installedVoices
        self.sayExecutable = sayExecutable
    }

    func run(_ scenario: Scenario) async throws {
        let label = scenario.name.map { "“\($0)”" } ?? "scenario"
        for (index, step) in scenario.steps.enumerated() {
            call.status = "Playing \(label), step \(index + 1) of \(scenario.steps.count)"
            try await perform(step)
        }
    }

    private func perform(_ step: Step) async throws {
        switch step {
        case .pause(let seconds):
            Log.line("(silence \(format(seconds)))")
            try await sleep(seconds)
        case .speak(let utterance):
            try await speak(utterance)
        case .overlap(let utterances):
            Log.line("(overlap: \(utterances.map(\.participant.name).joined(separator: " + ")))")
            try await withThrowingTaskGroup(of: Void.self) { group in
                for utterance in utterances {
                    group.addTask { try await self.speak(utterance) }
                }
                try await group.waitForAll()
            }
        }
    }

    private func speak(_ utterance: Utterance) async throws {
        let person = utterance.participant
        call.setSpeaking(person, true)
        Log.line("\(person.name)  START  \(describe(utterance))")
        defer {
            call.setSpeaking(person, false)
            Log.line("\(person.name)  END")
        }

        try await sleep(utterance.lead)
        if let text = utterance.text {
            if audio {
                try await Speech.say(
                    text,
                    voice: voice(for: utterance),
                    wordsPerMinute: utterance.wordsPerMinute,
                    executable: sayExecutable
                )
            } else {
                try await sleep(utterance.estimatedSeconds)
            }
        } else {
            try await sleep(utterance.estimatedSeconds)
        }
        try await sleep(utterance.hold)
    }

    /// An installed voice, or nil for the system voice. Voices named in a
    /// scenario were checked at startup; only a missing default can land here.
    private func voice(for utterance: Utterance) -> String? {
        let wanted = utterance.effectiveVoice
        guard let installedVoices else { return wanted }
        return installedVoices.contains(wanted) ? wanted : nil
    }

    private func sleep(_ seconds: TimeInterval) async throws {
        guard seconds > 0 else { return }
        try await Task.sleep(for: .seconds(seconds))
    }

    private func describe(_ utterance: Utterance) -> String {
        guard let text = utterance.text else { return "(silent mark, \(format(utterance.estimatedSeconds)))" }
        let shortened = text.count > 70 ? text.prefix(70) + "…" : text[...]
        return "“\(shortened)”"
    }

    private func format(_ seconds: TimeInterval) -> String {
        String(format: "%.1fs", seconds)
    }
}

/// Starts a scenario after the start delay, repeats it with `--loop`, and can
/// be restarted.
@MainActor
final class ScenarioPlayer {
    private let scenario: Scenario
    private let options: Options
    private let call: CallModel
    private let runner: ScenarioRunner
    private var task: Task<Void, Never>?

    private static let loopGap: TimeInterval = 3

    init(scenario: Scenario, options: Options, call: CallModel, runner: ScenarioRunner) {
        self.scenario = scenario
        self.options = options
        self.call = call
        self.runner = runner
    }

    func restart() {
        task?.cancel()
        call.clearSpeaking()
        task = Task { await play() }
    }

    func cancel() {
        task?.cancel()
        task = nil
    }

    private func play() async {
        let label = scenario.name.map { "“\($0)”" } ?? "The scenario"
        do {
            try await countdown(seconds: options.startDelay) { left in
                "\(label) starts in \(left)s. Start transcription in Amie now."
            }
            repeat {
                Log.line("=== scenario start: \(scenario.name ?? "unnamed") ===")
                try await runner.run(scenario)
                Log.line("=== scenario end ===")
                if options.loop {
                    try await countdown(seconds: Self.loopGap) { left in
                        "\(label) repeats in \(left)s."
                    }
                }
            } while options.loop
            call.status = "\(label) finished. Nobody is speaking."
            if options.quitWhenDone { NSApp.terminate(nil) }
        } catch is CancellationError {
            // Restarted or quitting; whoever cancelled owns the status.
        } catch {
            Log.line("stopped: \(error)")
            call.status = "Stopped: \(error)"
        }
    }

    private func countdown(seconds: TimeInterval, message: (Int) -> String) async throws {
        let end = ContinuousClock.now + .seconds(seconds)
        while ContinuousClock.now < end {
            let left = Int((end - ContinuousClock.now).components.seconds) + 1
            call.status = message(left)
            try await Task.sleep(for: .milliseconds(200))
        }
    }
}
