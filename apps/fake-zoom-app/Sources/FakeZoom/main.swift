import AppKit
import FakeZoomCore

/// Zoom's real bundle id. Amie's reader looks the meeting app up by it.
let zoomBundleIdentifier = "us.zoom.xos"

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("fake-zoom: \(message)\n".utf8))
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

// MARK: Preflight (all of it before a window opens, so mistakes are loud)

// Two apps named us.zoom.xos: Amie would read whichever macOS lists first.
let realZoom = NSRunningApplication
    .runningApplications(withBundleIdentifier: zoomBundleIdentifier)
    .first { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }
if let realZoom {
    fail("""
        something is already running as us.zoom.xos (pid \(realZoom.processIdentifier), \
        \(realZoom.localizedName ?? "unknown")): real Zoom or another Fake Zoom. Quit it first; \
        two apps with one bundle id would confuse Amie.
        """)
}
if Bundle.main.bundleIdentifier != zoomBundleIdentifier {
    FileHandle.standardError.write(Data(
        "fake-zoom: warning: not running from the app bundle, so Amie will not see this as Zoom. Use `pnpm fake-zoom`.\n".utf8
    ))
}

let participants = Roster.participants(count: options.participants)
// FAKE_ZOOM_SAY swaps the speech command (the tests run a silent stand-in).
let sayExecutable = ProcessInfo.processInfo.environment["FAKE_ZOOM_SAY"]
    .map { URL(fileURLWithPath: $0) } ?? Speech.sayExecutable
let installedVoices = options.audio ? Speech.installedVoices(executable: sayExecutable) : nil

var scenario: Scenario?
var scenarioPath: String?
if let argument = options.scenarioPath {
    let shipped = ProcessInfo.processInfo.environment["FAKE_ZOOM_SCENARIOS_DIR"]
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

// Voices a scenario names itself must exist. Missing defaults only fall back
// to the system voice, with a note.
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

if !options.printAccessibilityTree && options.snapshotPath == nil {
    print("Fake Zoom  pid \(ProcessInfo.processInfo.processIdentifier)  bundle \(Bundle.main.bundleIdentifier ?? "none")")
    print("Call of \(participants.count): \(participants.map(\.name).joined(separator: ", "))")
    if let scenario, let scenarioPath {
        let audio = options.audio ? "audio on" : "audio off"
        print("Scenario \(scenario.name ?? scenarioPath): \(scenario.steps.count) steps, starts in \(Int(options.startDelay))s (\(audio))")
    }
    fflush(stdout)
}

let application = NSApplication.shared
application.setActivationPolicy(.regular)
let delegate = AppDelegate(
    options: options,
    participants: participants,
    scenario: scenario,
    installedVoices: installedVoices,
    sayExecutable: sayExecutable
)
application.delegate = delegate

// Ctrl-C and `kill` quit like Cmd-Q, so a sentence still being spoken is
// stopped instead of outliving the app.
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
