import FakeZoomCore

/// Who is in the call and who is marked speaking right now. The window shows
/// it; the scenario runner and a click on a tile change it.
@MainActor
final class CallModel {
    let participants: [Participant]
    private(set) var speaking: Set<String> = []

    var onSpeakingChange: ((Participant) -> Void)?
    var onStatusChange: ((String) -> Void)?

    var status = "" {
        didSet { onStatusChange?(status) }
    }

    init(participants: [Participant]) {
        self.participants = participants
    }

    func isSpeaking(_ participant: Participant) -> Bool {
        speaking.contains(participant.name)
    }

    func setSpeaking(_ participant: Participant, _ isSpeaking: Bool) {
        let changed = isSpeaking
            ? speaking.insert(participant.name).inserted
            : speaking.remove(participant.name) != nil
        if changed { onSpeakingChange?(participant) }
    }

    func toggle(_ participant: Participant) {
        setSpeaking(participant, !isSpeaking(participant))
        Log.line("\(participant.name)  \(isSpeaking(participant) ? "START" : "END")  (clicked)")
    }

    func clearSpeaking() {
        for participant in participants where isSpeaking(participant) {
            setSpeaking(participant, false)
        }
    }
}
