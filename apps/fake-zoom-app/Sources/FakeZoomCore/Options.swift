import Foundation

public struct Options: Equatable, Sendable {
    /// People in the call, the local user included.
    public var participants = 3
    public var scenarioPath: String?
    /// Seconds to wait before the scenario starts: time to press Start in Amie.
    public var startDelay: TimeInterval = 5
    public var loop = false
    /// Play the scenario's speech. Off: the speaking marks still follow the
    /// timing the speech would have had, in silence.
    public var audio = true
    public var quitWhenDone = false
    public var printAccessibilityTree = false
    public var snapshotPath: String?
    /// Open the participants panel at start. It lists names only, and is not a
    /// speaking signal, so it is a decoy the reader must ignore.
    public var showRoster = false

    public init() {}
}

public enum Command: Equatable, Sendable {
    case run(Options)
    case help
}

public struct UsageError: Error, Equatable, CustomStringConvertible, Sendable {
    public let message: String

    public init(_ message: String) {
        self.message = message
    }

    public var description: String { message }
}

public enum OptionsParser {
    public static let usage = """
    Fake Zoom: a stand-in for a running Zoom call, for testing speaker names.

    It claims Zoom's bundle id (us.zoom.xos) and shows participant tiles the way
    Zoom exposes them to Accessibility: "Ada Lovelace, speaking".

    Usage: fake-zoom [options]

      --participants N    People in the call including you, \(Roster.minimumParticipants) to \(Roster.maximumParticipants). Default 3.
                          The same N always gives the same names:
    \(rosterLines)
      --scenario FILE     JSON script of who speaks when. Without one, nobody speaks;
                          click a tile to toggle its speaking mark by hand.
      --delay SECONDS     Wait before the scenario starts. Default 5.
      --loop              Repeat the scenario until you quit.
      --no-audio          Do not play speech. Speaking marks keep their timing.
      --quit-when-done    Exit when the scenario ends.
      --print-ax          Print the accessibility tree this app exposes half a second
                          after start, then exit. With --scenario and --delay 0 it
                          shows the first speaker as marked.
      --show-roster       Open the participants panel at start (a names-only list that
                          Amie must not mistake for a speaking signal).
      --snapshot FILE     Save a PNG of the window half a second after start, then exit.
      -h, --help          Show this help.
    """

    private static var rosterLines: String {
        Roster.all.enumerated().map { index, person in
            "                          \(index + 1)  \(person.name)"
        }.joined(separator: "\n")
    }

    /// `arguments` excludes the program name.
    public static func parse(_ arguments: [String]) throws -> Command {
        var options = Options()
        var remaining = arguments[...]

        while let argument = remaining.popFirst() {
            // LaunchServices adds a process serial number to a double-clicked app.
            if argument.hasPrefix("-psn_") { continue }

            let (flag, inlineValue) = split(argument)
            func value() throws -> String {
                if let inlineValue { return inlineValue }
                guard let next = remaining.popFirst() else {
                    throw UsageError("\(flag) needs a value.")
                }
                return next
            }
            func noValue() throws {
                if inlineValue != nil { throw UsageError("\(flag) does not take a value.") }
            }

            switch flag {
            case "-h", "--help":
                return .help
            case "--participants":
                options.participants = try participants(value())
            case "--scenario":
                let path = try value()
                if path.isEmpty { throw UsageError("--scenario needs a file path.") }
                options.scenarioPath = path
            case "--delay":
                options.startDelay = try delay(value())
            case "--loop":
                try noValue()
                options.loop = true
            case "--no-audio":
                try noValue()
                options.audio = false
            case "--quit-when-done":
                try noValue()
                options.quitWhenDone = true
            case "--print-ax":
                try noValue()
                options.printAccessibilityTree = true
            case "--show-roster":
                try noValue()
                options.showRoster = true
            case "--snapshot":
                let path = try value()
                if path.isEmpty { throw UsageError("--snapshot needs a file path.") }
                options.snapshotPath = path
            default:
                throw UsageError("Unknown option \(argument). Try --help.")
            }
        }

        if options.scenarioPath == nil {
            if options.loop { throw UsageError("--loop needs --scenario.") }
            if options.quitWhenDone { throw UsageError("--quit-when-done needs --scenario.") }
        }
        return .run(options)
    }

    private static func split(_ argument: String) -> (flag: String, value: String?) {
        guard argument.hasPrefix("--"), let equals = argument.firstIndex(of: "=") else {
            return (argument, nil)
        }
        return (String(argument[..<equals]), String(argument[argument.index(after: equals)...]))
    }

    private static func participants(_ text: String) throws -> Int {
        guard let count = Int(text),
              (Roster.minimumParticipants...Roster.maximumParticipants).contains(count)
        else {
            throw UsageError(
                "--participants must be a whole number from \(Roster.minimumParticipants) to \(Roster.maximumParticipants) (got '\(text)')."
            )
        }
        return count
    }

    private static func delay(_ text: String) throws -> TimeInterval {
        guard let seconds = Double(text), seconds.isFinite, seconds >= 0 else {
            throw UsageError("--delay must be a number of seconds, 0 or more (got '\(text)').")
        }
        return seconds
    }
}
