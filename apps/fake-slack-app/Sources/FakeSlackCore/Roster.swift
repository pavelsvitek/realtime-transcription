/// Layout mode matching Slack Huddle's compact vs expanded/full-screen window.
public enum LayoutMode: String, Equatable, Sendable {
    case compact
    case full
}

/// Who is in the huddle. Names, Slack user IDs, and order are fixed so that a
/// given `--participants N` always produces the same huddle, and scenarios can
/// name people without caring how the huddle was started.
public struct Participant: Equatable, Sendable {
    /// Display name as Slack exposes it inside "View <name>'s profile".
    public let name: String
    /// Synthetic Slack user ID used in `AXDOMIdentifier`.
    public let slackUserId: String
    public let isLocalUser: Bool
    /// A macOS `say` voice, so participants sound different.
    public let voice: String

    public init(name: String, slackUserId: String, isLocalUser: Bool, voice: String) {
        self.name = name
        self.slackUserId = slackUserId
        self.isLocalUser = isLocalUser
        self.voice = voice
    }

    public var initials: String {
        name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map { String($0).uppercased() }
            .joined()
    }

    /// The `AXDOMIdentifier` on Slack's `AXCell` (`p-huddle_peer_tile`).
    /// Measured in Slack 4.50.128 & 4.53.292: the local user carries `self_`.
    public var gridCellDomId: String {
        isLocalUser
            ? "huddle-grid-gridcell-self_\(slackUserId)"
            : "huddle-grid-gridcell-\(slackUserId)"
    }

    /// The `AXDOMIdentifier` on the offscreen sibling description node.
    public var descriptionDomId: String {
        "\(gridCellDomId)-a11y_huddle_peer_tile_description"
    }

    /// `AXDescription` / `AXTitle` on the tile cell and `AXTitle` on its parent `AXRow`.
    public var profileDescription: String {
        "View \(name)'s profile"
    }

    /// Offscreen `AXStaticText` value for the tile's audio/mute state.
    /// Measured in Slack 4.50.128 and 4.53.292: `"Audio, Muted"` when muted and
    /// `"Audio"` when unmuted (whether silent or speaking).
    public func tileDescriptionText(isMuted: Bool) -> String {
        isMuted ? "Audio, Muted" : "Audio"
    }

    /// `AXDOMClassList` on the `AXCell` (`p-huddle_peer_tile`).
    public var tileClasses: [String] {
        ["p-huddle_peer_tile"]
    }

    /// `AXDOMClassList` on the tile's `p-huddle_peer_tile__mic_overlay` child,
    /// or `nil` when unmuted and silent (measured in Slack 4.53.292).
    public static func micOverlayClasses(
        isMuted: Bool,
        isSpeaking: Bool,
        layout: LayoutMode = .compact
    ) -> [String]? {
        if isMuted {
            return layout == .compact
                ? ["p-huddle_peer_tile__mic_overlay", "p-huddle_peer_tile__overlay--compact"]
                : ["p-huddle_peer_tile__mic_overlay"]
        }
        if isSpeaking {
            return layout == .compact
                ? [
                    "p-huddle_peer_tile__mic_overlay",
                    "p-huddle_peer_tile__overlay--active_speaker",
                    "p-huddle_peer_tile__overlay--compact",
                ]
                : [
                    "p-huddle_peer_tile__mic_overlay",
                    "p-huddle_peer_tile__overlay--active_speaker",
                ]
        }
        return nil
    }

    /// `AXDOMClassList` on the full-screen `p-huddle_peer_tile__name_overlay` button.
    public static func nameOverlayClasses(isMuted: Bool, isSpeaking: Bool) -> [String] {
        var classes = [
            "c-button--focus-visible",
            "c-button-unstyled",
            "p-huddle_peer_tile__name_overlay",
            isMuted ? "p-huddle_peer_tile__name_overlay--muted" : "p-huddle_peer_tile__name_overlay--unmuted",
        ]
        if isSpeaking && !isMuted {
            classes.append("p-huddle_peer_tile__overlay--active_speaker")
        }
        return classes
    }
}

public enum Roster {
    public static let minimumParticipants = 1
    public static let maximumParticipants = 8

    /// The local user is always first. `--participants 1` mirrors a solo huddle;
    /// up to 8 covers typical standups and team huddles.
    public static let all: [Participant] = [
        Participant(name: "Pavel Svitek", slackUserId: "UHX8XC00G", isLocalUser: true, voice: "Fred"),
        Participant(name: "Ada Lovelace", slackUserId: "U01ADALOV", isLocalUser: false, voice: "Samantha"),
        Participant(name: "Alan Turing", slackUserId: "U02ALANTU", isLocalUser: false, voice: "Daniel"),
        Participant(name: "Grace Hopper", slackUserId: "U03GRACEH", isLocalUser: false, voice: "Karen"),
        Participant(name: "Katherine Johnson", slackUserId: "U04KATHJN", isLocalUser: false, voice: "Tessa"),
        Participant(name: "Dennis Ritchie", slackUserId: "U05DENNIS", isLocalUser: false, voice: "Rishi"),
        Participant(name: "Margaret Hamilton", slackUserId: "U06MARGHA", isLocalUser: false, voice: "Moira"),
        Participant(name: "Linus Torvalds", slackUserId: "U07LINUST", isLocalUser: false, voice: "Ralph"),
    ]

    /// The first `count` people of the roster, local user included.
    public static func participants(count: Int) -> [Participant] {
        precondition(
            (minimumParticipants...maximumParticipants).contains(count),
            "participant count must be \(minimumParticipants)...\(maximumParticipants)"
        )
        return Array(all.prefix(count))
    }

    /// Matches a name written in a scenario: full name, first name (for Pavel),
    /// "(Me)" suffix for compatibility with fake-zoom scenarios, or "me".
    public static func participant(named written: String, in participants: [Participant]) -> Participant? {
        let wanted = written
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: " (Me)", with: "", options: .caseInsensitive)
            .lowercased()
        return participants.first { person in
            let lower = person.name.lowercased()
            let first = lower.split(separator: " ").first.map(String.init)
            return lower == wanted
                || (person.isLocalUser && (wanted == "me" || wanted == first))
        }
    }

    /// The smallest huddle that includes `written`, for a helpful error.
    public static func smallestCall(including written: String) -> Int? {
        guard let person = participant(named: written, in: all),
              let index = all.firstIndex(of: person)
        else { return nil }
        return max(index + 1, minimumParticipants)
    }
}
