import Foundation

/// One person speaking.
///
/// Timeline: the tile is marked speaking at once, `lead` seconds later the
/// speech starts, and the mark stays `hold` seconds after it ends. Zoom's own
/// indicator is not frame-exact either, which is what `lead` and `hold` model.
public struct Utterance: Equatable, Sendable {
    public let participant: Participant
    /// Spoken aloud. Nil for a silent mark, which uses `silentSeconds`.
    public let text: String?
    public let silentSeconds: TimeInterval?
    /// A `say` voice. Nil means the participant's own voice.
    public let voice: String?
    public let wordsPerMinute: Int?
    public let lead: TimeInterval
    public let hold: TimeInterval

    public static let defaultWordsPerMinute = 175
    public static let defaultLead: TimeInterval = 0
    public static let defaultHold: TimeInterval = 0.3

    public var effectiveVoice: String { voice ?? participant.voice }

    /// How long the speech (or the silent mark) lasts, used when audio is off.
    public var estimatedSeconds: TimeInterval {
        guard let text else { return silentSeconds ?? 0 }
        let words = Double(text.split(whereSeparator: \.isWhitespace).count)
        let wpm = Double(wordsPerMinute ?? Self.defaultWordsPerMinute)
        return max(0.3, words * 60 / wpm)
    }
}

public enum Step: Equatable, Sendable {
    case speak(Utterance)
    /// Nobody speaks.
    case pause(TimeInterval)
    /// Several people at once; ends when the last one ends.
    case overlap([Utterance])
}

public struct Scenario: Equatable, Sendable {
    public let name: String?
    public let steps: [Step]

    public var utterances: [Utterance] {
        steps.flatMap { step -> [Utterance] in
            switch step {
            case .speak(let utterance): [utterance]
            case .overlap(let utterances): utterances
            case .pause: []
            }
        }
    }
}

public struct ScenarioError: Error, Equatable, CustomStringConvertible, Sendable {
    /// Where in the file, like `steps[2].speak`. Empty for the file as a whole.
    public let path: String
    public let message: String

    public init(path: String, message: String) {
        self.path = path
        self.message = message
    }

    public var description: String {
        path.isEmpty ? message : "\(path): \(message)"
    }
}

/// Scenario files are JSON:
///
///     {
///       "name": "Ada and Alan trade lines",
///       "steps": [
///         { "speak": "Ada Lovelace", "text": "Hello everyone." },
///         { "pause": 1.0 },
///         { "overlap": [
///             { "speak": "Ada Lovelace", "text": "As I was saying" },
///             { "speak": "Alan Turing", "text": "Sorry to interrupt" } ] },
///         { "speak": "Grace Hopper", "duration": 2.5 }
///       ]
///     }
///
/// A `speak` step takes `text` (spoken) or `duration` (a silent mark), plus
/// optional `voice`, `rate` (words per minute), `lead` and `hold` (seconds).
public enum ScenarioLoader {
    public static func load(_ data: Data, participants: [Participant]) throws -> Scenario {
        let json: Any
        do {
            json = try JSONSerialization.jsonObject(with: data)
        } catch {
            throw ScenarioError(path: "", message: "not valid JSON (\(error.localizedDescription))")
        }
        guard let root = json as? [String: Any] else {
            throw ScenarioError(path: "", message: "expected a JSON object with a \"steps\" array")
        }
        try rejectUnknownKeys(in: root, allowed: ["name", "description", "steps"], path: "")

        let name = try optionalString(root["name"], path: "name")
        _ = try optionalString(root["description"], path: "description")

        guard let rawSteps = root["steps"] as? [Any], !rawSteps.isEmpty else {
            throw ScenarioError(path: "steps", message: "expected a non-empty array")
        }
        let context = Context(participants: participants)
        let steps = try rawSteps.enumerated().map { index, raw in
            try parseStep(raw, path: "steps[\(index)]", context: context)
        }
        return Scenario(name: name, steps: steps)
    }

    public static func load(contentsOf url: URL, participants: [Participant]) throws -> Scenario {
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            throw ScenarioError(path: "", message: "cannot read \(url.path): \(error.localizedDescription)")
        }
        return try load(data, participants: participants)
    }

    // MARK: - Steps

    private struct Context {
        let participants: [Participant]
    }

    private static func parseStep(_ raw: Any, path: String, context: Context) throws -> Step {
        guard let object = raw as? [String: Any] else {
            throw ScenarioError(path: path, message: "expected an object")
        }
        let kinds = ["speak", "pause", "overlap"].filter { object[$0] != nil }
        guard kinds.count == 1, let kind = kinds.first else {
            throw ScenarioError(
                path: path,
                message: "a step needs exactly one of \"speak\", \"pause\" or \"overlap\""
            )
        }
        switch kind {
        case "pause":
            try rejectUnknownKeys(in: object, allowed: ["pause"], path: path)
            let seconds = try number(object["pause"], path: "\(path).pause")
            guard seconds > 0 else {
                throw ScenarioError(path: "\(path).pause", message: "must be greater than 0")
            }
            return .pause(seconds)
        case "overlap":
            try rejectUnknownKeys(in: object, allowed: ["overlap"], path: path)
            guard let items = object["overlap"] as? [Any], items.count >= 2 else {
                throw ScenarioError(
                    path: "\(path).overlap",
                    message: "expected an array of at least two speak steps"
                )
            }
            let utterances = try items.enumerated().map { index, item in
                try parseUtterance(item, path: "\(path).overlap[\(index)]", context: context)
            }
            let names = utterances.map(\.participant.name)
            if let repeated = names.first(where: { name in names.filter { $0 == name }.count > 1 }) {
                throw ScenarioError(
                    path: "\(path).overlap",
                    message: "\(repeated) cannot speak twice at the same time"
                )
            }
            return .overlap(utterances)
        default:
            return .speak(try parseUtterance(object, path: path, context: context))
        }
    }

    private static func parseUtterance(_ raw: Any, path: String, context: Context) throws -> Utterance {
        guard let object = raw as? [String: Any] else {
            throw ScenarioError(path: path, message: "expected an object")
        }
        try rejectUnknownKeys(
            in: object,
            allowed: ["speak", "text", "duration", "voice", "rate", "lead", "hold"],
            path: path
        )
        guard let speaker = object["speak"] as? String else {
            throw ScenarioError(path: "\(path).speak", message: "expected a participant name")
        }
        let participant = try resolve(speaker, path: "\(path).speak", context: context)

        let text = try optionalString(object["text"], path: "\(path).text")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let duration = try object["duration"].map { try number($0, path: "\(path).duration") }
        switch (text, duration) {
        case (nil, nil), (.some, .some):
            throw ScenarioError(
                path: path,
                message: "give either \"text\" (spoken) or \"duration\" (a silent speaking mark), not both or neither"
            )
        default:
            break
        }
        if let text, text.isEmpty {
            throw ScenarioError(path: "\(path).text", message: "must not be empty")
        }
        if let duration, duration <= 0 {
            throw ScenarioError(path: "\(path).duration", message: "must be greater than 0")
        }

        let rate = try object["rate"].map { try number($0, path: "\(path).rate") }
        if let rate, !(80...400).contains(rate) || rate != rate.rounded() {
            throw ScenarioError(path: "\(path).rate", message: "words per minute, a whole number from 80 to 400")
        }
        let lead = try object["lead"].map { try number($0, path: "\(path).lead") } ?? Utterance.defaultLead
        let hold = try object["hold"].map { try number($0, path: "\(path).hold") } ?? Utterance.defaultHold
        for (key, value) in [("lead", lead), ("hold", hold)] where value < 0 {
            throw ScenarioError(path: "\(path).\(key)", message: "must be 0 or more seconds")
        }

        return Utterance(
            participant: participant,
            text: text,
            silentSeconds: duration,
            voice: try optionalString(object["voice"], path: "\(path).voice"),
            wordsPerMinute: rate.map(Int.init),
            lead: lead,
            hold: hold
        )
    }

    private static func resolve(_ written: String, path: String, context: Context) throws -> Participant {
        if let participant = Roster.participant(named: written, in: context.participants) {
            return participant
        }
        let present = context.participants.map(\.name).joined(separator: ", ")
        var message = "no participant '\(written)' in a \(context.participants.count)-person call (\(present))"
        if let needed = Roster.smallestCall(including: written) {
            message += "; run with --participants \(needed) or more"
        }
        throw ScenarioError(path: path, message: message)
    }

    // MARK: - Values

    private static func rejectUnknownKeys(in object: [String: Any], allowed: Set<String>, path: String) throws {
        let unknown = Set(object.keys).subtracting(allowed).sorted()
        guard let first = unknown.first else { return }
        let expected = allowed.sorted().joined(separator: ", ")
        throw ScenarioError(
            path: path,
            message: "unknown key '\(first)' (expected: \(expected))"
        )
    }

    private static func optionalString(_ value: Any?, path: String) throws -> String? {
        guard let value else { return nil }
        guard let string = value as? String else {
            throw ScenarioError(path: path, message: "expected a string")
        }
        return string
    }

    private static func number(_ value: Any?, path: String) throws -> Double {
        // JSON booleans arrive as NSNumber too, and are not numbers here.
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite
        else {
            throw ScenarioError(path: path, message: "expected a number")
        }
        return number.doubleValue
    }
}
