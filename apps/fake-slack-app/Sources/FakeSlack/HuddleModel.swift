import FakeSlackCore

/// Who is in the huddle, who is marked speaking, and who is muted.
/// The window renders it; the scenario runner and clicks change it.
@MainActor
final class HuddleModel {
    let participants: [Participant]
    private(set) var speaking: Set<String> = []
    private(set) var muted: Set<String> = []

    var onParticipantChange: ((Participant) -> Void)?
    var onLocalMuteChange: ((Bool) -> Void)?
    var onStatusChange: ((String) -> Void)?

    var status = "" {
        didSet { onStatusChange?(status) }
    }

    var localParticipant: Participant? {
        participants.first(where: \.isLocalUser)
    }

    var isLocalMuted: Bool {
        guard let local = localParticipant else { return false }
        return muted.contains(local.name)
    }

    init(participants: [Participant], startMuted: Bool = false) {
        self.participants = participants
        if startMuted, let local = participants.first(where: \.isLocalUser) {
            muted.insert(local.name)
        }
    }

    func isSpeaking(_ participant: Participant) -> Bool {
        speaking.contains(participant.name)
    }

    func isMuted(_ participant: Participant) -> Bool {
        muted.contains(participant.name)
    }

    func setSpeaking(_ participant: Participant, _ isSpeaking: Bool) {
        let changed = isSpeaking
            ? speaking.insert(participant.name).inserted
            : speaking.remove(participant.name) != nil
        if changed { onParticipantChange?(participant) }
    }

    func toggleSpeaking(_ participant: Participant) {
        setSpeaking(participant, !isSpeaking(participant))
        Log.line("\(participant.name)  \(isSpeaking(participant) ? "START" : "END")  (clicked)")
    }

    func setLocalMuted(_ mutedNow: Bool) {
        guard let local = localParticipant else { return }
        let changed = mutedNow
            ? muted.insert(local.name).inserted
            : muted.remove(local.name) != nil
        if changed {
            if mutedNow {
                _ = speaking.remove(local.name)
            }
            onParticipantChange?(local)
            onLocalMuteChange?(mutedNow)
            Log.line("\(local.name)  \(mutedNow ? "MUTED" : "UNMUTED")")
        }
    }

    func toggleLocalMute() {
        setLocalMuted(!isLocalMuted)
    }

    func clearSpeaking() {
        for participant in participants where isSpeaking(participant) {
            setSpeaking(participant, false)
        }
    }
}
