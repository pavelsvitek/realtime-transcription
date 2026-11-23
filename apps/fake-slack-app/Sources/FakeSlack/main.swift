import AppKit
import FakeSlackCore

/// Slack's real macOS bundle id. Amie looks Slack up by this identifier.
let slackBundleIdentifier = "com.tinyspeck.slackmacgap"

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("fake-slack: \(message)\n".utf8))
    exit(2)
}

// MARK: Command line

let options: Options
do {
    switch try OptionsParser.parse(Array(CommandLine.arguments.dropFirst())) {
    case .help:
        print(OptionsParser.usage)
        exit(0)
    case .run(let parsed):
        options = parsed
    }
} catch {
    fail("\(error)")
}

// MARK: Preflight

let isInspectionOnly = options.printAccessibilityTree || options.snapshotPath != nil
let allowParallel = ProcessInfo.processInfo.environment["FAKE_SLACK_ALLOW_PARALLEL"] == "1"

// Two apps named com.tinyspeck.slackmacgap: Amie would read whichever macOS lists first
// unless the other Slack is idle. Refusing by default keeps manual testing unambiguous;
// automated harnesses can set FAKE_SLACK_ALLOW_PARALLEL=1 when real Slack is idle.
if !isInspectionOnly && !allowParallel {
    let realSlack = NSRunningApplication
        .runningApplications(withBundleIdentifier: slackBundleIdentifier)
        .first { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }
    if let realSlack {
        fail("""
            something is already running as \(slackBundleIdentifier) (pid \(realSlack.processIdentifier), \
            \(realSlack.localizedName ?? "unknown")): real Slack or another Fake Slack. Quit it first; \
            two apps with one bundle id would confuse Amie.
            """)
    }
}

if Bundle.main.bundleIdentifier != slackBundleIdentifier && !isInspectionOnly {
    FileHandle.standardError.write(Data(
        "fake-slack: warning: not running from the app bundle, so Amie will not see this as Slack. Use `pnpm fake-slack`.\n".utf8
    ))
}

let participants = Roster.participants(count: options.participants)
let sayExecutable = ProcessInfo.processInfo.environment["FAKE_SLACK_SAY"]
    .map { URL(fileURLWithPath: $0) } ?? Speech.sayExecutable
let installedVoices = options.audio ? Speech.installedVoices(executable: sayExecutable) : nil

var scenario: Scenario?
var scenarioPath: String?
if let argument = options.scenarioPath {
    let shipped = ProcessInfo.processInfo.environment["FAKE_SLACK_SCENARIOS_DIR"]
    guard let path = ScenarioLocator.resolve(argument, shippedDirectory: shipped) else {
        var message = "scenario '\(argument)' not found."
        if let shipped {
            let names = ScenarioLocator.shippedNames(in: shipped)
            if !names.isEmpty { message += " Shipped scenarios: \(names.joined(separator: ", "))." }
        }
        fail(message)
    }
    scenarioPath = path
    do {
        scenario = try ScenarioLoader.load(contentsOf: URL(fileURLWithPath: path), participants: participants)
    } catch {
        fail("\(path): \(error)")
    }
}

if let scenario, let installedVoices {
    for utterance in scenario.utterances where utterance.text != nil {
        if let voice = utterance.voice, !installedVoices.contains(voice) {
            fail("\(scenarioPath ?? "scenario"): voice '\(voice)' is not installed. See `say -v '?'`.")
        }
    }
    let missing = Set(scenario.utterances.filter { $0.text != nil && $0.voice == nil }
        .map(\.participant.voice)).subtracting(installedVoices)
    if !missing.isEmpty {
        print("note: default voice(s) \(missing.sorted().joined(separator: ", ")) not installed; using the system voice.")
    }
}

// MARK: Run

if !isInspectionOnly {
    print("Fake Slack  pid \(ProcessInfo.processInfo.processIdentifier)  bundle \(Bundle.main.bundleIdentifier ?? "none")")
    print("Huddle (\(options.channelName)) of \(participants.count): \(participants.map(\.name).joined(separator: ", "))\(options.startMuted ? " [local muted]" : "")")
    if let scenario, let scenarioPath {
        let audio = options.audio ? "audio on" : "audio off"
        print("Scenario \(scenario.name ?? scenarioPath): \(scenario.steps.count) steps, starts in \(Int(options.startDelay))s (\(audio))")
    }
    fflush(stdout)
}

let application = NSApplication.shared
application.setActivationPolicy(isInspectionOnly ? .accessory : .regular)
let delegate = AppDelegate(
    options: options,
    participants: participants,
    scenario: scenario,
    installedVoices: installedVoices,
    sayExecutable: sayExecutable
)
application.delegate = delegate

var signalSources: [DispatchSourceSignal] = []
for number in [SIGINT, SIGTERM] {
    signal(number, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
    source.setEventHandler {
        MainActor.assumeIsolated { NSApp.terminate(nil) }
    }
    source.resume()
    signalSources.append(source)
}

application.run()
