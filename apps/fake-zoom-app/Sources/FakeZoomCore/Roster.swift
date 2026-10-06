/// Who is in the call. Names and order are fixed so that a given
/// `--participants N` always produces the same call, and scenarios can name
/// people without caring how the call was started.
public struct Participant: Equatable, Sendable {
    /// The name on the tile, as Zoom would show it. The local user carries "(Me)".
    public let name: String
    public let isLocalUser: Bool
    /// A macOS `say` voice, so participants sound different.
    public let voice: String

    public init(name: String, isLocalUser: Bool, voice: String) {
        self.name = name
        self.isLocalUser = isLocalUser
        self.voice = voice
    }

    /// The name without the "(Me)" marker.
    public var shortName: String {
        name.replacingOccurrences(of: " (Me)", with: "")
    }

    public var initials: String {
        shortName
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map { String($0).uppercased() }
            .joined()
    }
}

public enum Roster {
    public static let minimumParticipants = 2
    public static let maximumParticipants = 6

    /// The local user is always first, so even the smallest call has one
    /// remote participant.
    public static let all: [Participant] = [
        Participant(name: "Pavel (Me)", isLocalUser: true, voice: "Fred"),
        Participant(name: "Ada Lovelace", isLocalUser: false, voice: "Samantha"),
        Participant(name: "Alan Turing", isLocalUser: false, voice: "Daniel"),
        Participant(name: "Grace Hopper", isLocalUser: false, voice: "Karen"),
        Participant(name: "Katherine Johnson", isLocalUser: false, voice: "Tessa"),
        Participant(name: "Dennis Ritchie", isLocalUser: false, voice: "Rishi"),
    ]

    /// The first `count` people of the roster, local user included.
    public static func participants(count: Int) -> [Participant] {
        precondition(
            (minimumParticipants...maximumParticipants).contains(count),
            "participant count must be \(minimumParticipants)...\(maximumParticipants)"
        )
        return Array(all.prefix(count))
    }

    /// Matches a name written in a scenario: the tile name, the name without
    /// "(Me)", or just "me" for the local user. Case does not matter.
    public static func participant(named written: String, in participants: [Participant]) -> Participant? {
        let wanted = written.trimmingCharacters(in: .whitespaces).lowercased()
        return participants.first { person in
            person.name.lowercased() == wanted
                || person.shortName.lowercased() == wanted
                || (person.isLocalUser && wanted == "me")
        }
    }

    /// The smallest call that includes `written`, for a helpful error.
    public static func smallestCall(including written: String) -> Int? {
        guard let person = participant(named: written, in: all),
              let index = all.firstIndex(of: person)
        else { return nil }
        return max(index + 1, minimumParticipants)
    }
}
