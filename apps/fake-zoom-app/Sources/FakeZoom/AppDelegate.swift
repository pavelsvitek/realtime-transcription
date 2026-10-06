import AppKit
import FakeZoomCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let options: Options
    private let participants: [Participant]
    private let scenario: Scenario?
    private let installedVoices: Set<String>?
    private let sayExecutable: URL

    private var call: CallModel?
    private var windowController: CallWindowController?
    private var player: ScenarioPlayer?
    private var activity: NSObjectProtocol?

    init(
        options: Options,
        participants: [Participant],
        scenario: Scenario?,
        installedVoices: Set<String>?,
        sayExecutable: URL
    ) {
        self.options = options
        self.participants = participants
        self.scenario = scenario
        self.installedVoices = installedVoices
        self.sayExecutable = sayExecutable
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // A call in the background must keep its timing: no App Nap.
        activity = ProcessInfo.processInfo.beginActivity(
            options: [.userInitiated, .idleSystemSleepDisabled],
            reason: "Fake Zoom call keeps speaking marks on time"
        )
        NSApp.appearance = NSAppearance(named: .darkAqua)
        NSApp.mainMenu = makeMenu()

        let call = CallModel(participants: participants)
        call.status = scenario == nil
            ? "No scenario. Click a tile to toggle its speaking mark."
            : ""
        self.call = call

        let controller = CallWindowController(call: call, showRoster: options.showRoster)
        windowController = controller
        controller.show()
        NSApp.activate()

        if let scenario {
            let runner = ScenarioRunner(
                call: call,
                audio: options.audio,
                installedVoices: installedVoices,
                sayExecutable: sayExecutable
            )
            let player = ScenarioPlayer(scenario: scenario, options: options, call: call, runner: runner)
            self.player = player
            player.restart()
        }

        if options.printAccessibilityTree || options.snapshotPath != nil {
            // Half a second: time for AppKit to lay the window out, and for a
            // scenario started with --delay 0 to have its first speaker marked.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [options] in
                if options.printAccessibilityTree {
                    print(AccessibilityDump.render())
                }
                if let path = options.snapshotPath {
                    do {
                        try controller.writeSnapshot(to: path)
                        print("Saved \(path)")
                    } catch {
                        FileHandle.standardError.write(Data("fake-zoom: could not save \(path): \(error)\n".utf8))
                    }
                }
                NSApp.terminate(nil)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Stops a sentence that is still being spoken.
        player?.cancel()
    }

    @objc private func restartScenario() {
        Log.line("--- scenario restarted ---")
        player?.restart()
    }

    private func makeMenu() -> NSMenu {
        let menu = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(
            withTitle: "Quit Fake Zoom",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        appItem.submenu = appMenu
        menu.addItem(appItem)

        let scenarioItem = NSMenuItem()
        let scenarioMenu = NSMenu(title: "Scenario")
        let restart = NSMenuItem(title: "Restart Scenario", action: #selector(restartScenario), keyEquivalent: "r")
        restart.target = self
        restart.isEnabled = scenario != nil
        scenarioMenu.addItem(restart)
        scenarioItem.submenu = scenarioMenu
        menu.addItem(scenarioItem)

        return menu
    }
}
