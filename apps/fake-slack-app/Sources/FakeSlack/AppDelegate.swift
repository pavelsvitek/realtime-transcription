import AppKit
import FakeSlackCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let options: Options
    private let participants: [Participant]
    private let scenario: Scenario?
    private let installedVoices: Set<String>?
    private let sayExecutable: URL

    private var huddle: HuddleModel?
    private var windowController: HuddleWindowController?
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
        activity = ProcessInfo.processInfo.beginActivity(
            options: [.userInitiated, .idleSystemSleepDisabled],
            reason: "Fake Slack huddle keeps speaking marks on time"
        )
        NSApp.appearance = NSAppearance(named: .darkAqua)
        NSApp.mainMenu = makeMenu()

        let huddle = HuddleModel(participants: participants, startMuted: options.startMuted)
        huddle.status = scenario == nil
            ? "No scenario. Click a tile to toggle speaking, or click Mic to mute."
            : ""
        self.huddle = huddle

        let controller = HuddleWindowController(
            huddle: huddle,
            channelName: options.channelName,
            layoutMode: options.layout
        )
        windowController = controller
        controller.show()
        if !options.printAccessibilityTree && options.snapshotPath == nil {
            NSApp.activate()
        }

        if let scenario {
            let runner = ScenarioRunner(
                huddle: huddle,
                audio: options.audio,
                installedVoices: installedVoices,
                sayExecutable: sayExecutable
            )
            let player = ScenarioPlayer(scenario: scenario, options: options, huddle: huddle, runner: runner)
            self.player = player
            player.restart()
        }

        if options.printAccessibilityTree || options.snapshotPath != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [options] in
                if options.printAccessibilityTree {
                    print(AccessibilityDump.render())
                }
                if let path = options.snapshotPath {
                    do {
                        try controller.writeSnapshot(to: path)
                        print("Saved \(path)")
                    } catch {
                        FileHandle.standardError.write(Data("fake-slack: could not save \(path): \(error)\n".utf8))
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
        player?.cancel()
    }

    @objc private func restartScenario() {
        Log.line("--- scenario restarted ---")
        player?.restart()
    }

    @objc private func toggleLocalMute() {
        huddle?.toggleLocalMute()
    }

    private func makeMenu() -> NSMenu {
        let menu = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(
            withTitle: "Quit Fake Slack",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        appItem.submenu = appMenu
        menu.addItem(appItem)

        let huddleItem = NSMenuItem()
        let huddleMenu = NSMenu(title: "Huddle")

        let mute = NSMenuItem(title: "Mute / Unmute Microphone", action: #selector(toggleLocalMute), keyEquivalent: "m")
        mute.keyEquivalentModifierMask = [.command, .shift]
        mute.target = self
        huddleMenu.addItem(mute)

        let restart = NSMenuItem(title: "Restart Scenario", action: #selector(restartScenario), keyEquivalent: "r")
        restart.target = self
        restart.isEnabled = scenario != nil
        huddleMenu.addItem(restart)

        huddleItem.submenu = huddleMenu
        menu.addItem(huddleItem)

        return menu
    }
}
