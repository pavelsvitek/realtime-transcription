import Testing
@testable import FakeSlackCore

@Test
func theSameCountAlwaysGivesTheSameNames() {
    for count in Roster.minimumParticipants...Roster.maximumParticipants {
        let first = Roster.participants(count: count).map(\.name)
        let second = Roster.participants(count: count).map(\.name)
        #expect(first == second)
        #expect(first.count == count)
    }
}

@Test
func biggerHuddlesExtendSmallerOnes() {
    let three = Roster.participants(count: 3).map(\.name)
    let five = Roster.participants(count: 5).map(\.name)
    #expect(Array(five.prefix(3)) == three)
}

@Test
func theLocalUserIsFirstAndAloneInBeingLocal() {
    let all = Roster.all
    #expect(all.first?.isLocalUser == true)
    #expect(all.filter(\.isLocalUser).count == 1)
    #expect(all.count == Roster.maximumParticipants)
    #expect(Set(all.map(\.name)).count == all.count)
    #expect(Set(all.map(\.slackUserId)).count == all.count)
    #expect(Set(all.map(\.voice)).count == all.count)
}

@Test
func namesInScenariosMatchLoosely() {
    let huddle = Roster.participants(count: 3)
    #expect(Roster.participant(named: "Ada Lovelace", in: huddle)?.name == "Ada Lovelace")
    #expect(Roster.participant(named: "  ada lovelace ", in: huddle)?.name == "Ada Lovelace")
    #expect(Roster.participant(named: "me", in: huddle)?.isLocalUser == true)
    #expect(Roster.participant(named: "Pavel", in: huddle)?.isLocalUser == true)
    #expect(Roster.participant(named: "Pavel (Me)", in: huddle)?.isLocalUser == true)
    #expect(Roster.participant(named: "Pavel Svitek", in: huddle)?.isLocalUser == true)
    #expect(Roster.participant(named: "Grace Hopper", in: huddle) == nil)
}

@Test
func smallestCallTellsHowManyPeopleANameNeeds() {
    #expect(Roster.smallestCall(including: "me") == 1)
    #expect(Roster.smallestCall(including: "Ada Lovelace") == 2)
    #expect(Roster.smallestCall(including: "Grace Hopper") == 4)
    #expect(Roster.smallestCall(including: "Dennis Ritchie") == 6)
    #expect(Roster.smallestCall(including: "Margaret Hamilton") == 7)
    #expect(Roster.smallestCall(including: "Linus Torvalds") == 8)
    #expect(Roster.smallestCall(including: "Nobody") == nil)
}

@Test
func slackAxIdentifiersAndDescriptionsMatchMeasuredFormat() {
    let local = Roster.all[0]
    let remote = Roster.all[1]

    #expect(local.gridCellDomId == "huddle-grid-gridcell-self_UHX8XC00G")
    #expect(local.descriptionDomId == "huddle-grid-gridcell-self_UHX8XC00G-a11y_huddle_peer_tile_description")
    #expect(local.profileDescription == "View Pavel Svitek's profile")

    #expect(remote.gridCellDomId == "huddle-grid-gridcell-U01ADALOV")
    #expect(remote.descriptionDomId == "huddle-grid-gridcell-U01ADALOV-a11y_huddle_peer_tile_description")
    #expect(remote.profileDescription == "View Ada Lovelace's profile")

    #expect(local.tileDescriptionText(isMuted: true) == "Audio, Muted")
    #expect(local.tileDescriptionText(isMuted: false) == "Audio")

    #expect(remote.tileClasses == ["p-huddle_peer_tile"])
    #expect(Participant.micOverlayClasses(isMuted: false, isSpeaking: false) == nil)
    #expect(
        Participant.micOverlayClasses(isMuted: true, isSpeaking: false)
            == ["p-huddle_peer_tile__mic_overlay", "p-huddle_peer_tile__overlay--compact"]
    )
    #expect(
        Participant.micOverlayClasses(isMuted: false, isSpeaking: true)
            == [
                "p-huddle_peer_tile__mic_overlay",
                "p-huddle_peer_tile__overlay--active_speaker",
                "p-huddle_peer_tile__overlay--compact",
            ]
    )
}

@Test
func initialsUseTheFirstTwoWords() {
    #expect(Roster.all[0].initials == "PS")
    #expect(Roster.all[1].initials == "AL")
    #expect(Roster.all[4].initials == "KJ")
}
