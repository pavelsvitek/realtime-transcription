import Testing
@testable import FakeZoomCore

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
func biggerCallsExtendSmallerOnes() {
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
    #expect(Set(all.map(\.voice)).count == all.count)
}

@Test
func namesInScenariosMatchLoosely() {
    let call = Roster.participants(count: 3)
    #expect(Roster.participant(named: "Ada Lovelace", in: call)?.name == "Ada Lovelace")
    #expect(Roster.participant(named: "  ada lovelace ", in: call)?.name == "Ada Lovelace")
    #expect(Roster.participant(named: "me", in: call)?.isLocalUser == true)
    #expect(Roster.participant(named: "Pavel", in: call)?.isLocalUser == true)
    #expect(Roster.participant(named: "Pavel (Me)", in: call)?.isLocalUser == true)
    #expect(Roster.participant(named: "Grace Hopper", in: call) == nil)
}

@Test
func smallestCallTellsHowManyPeopleANameNeeds() {
    #expect(Roster.smallestCall(including: "Ada Lovelace") == 2)
    #expect(Roster.smallestCall(including: "Grace Hopper") == 4)
    #expect(Roster.smallestCall(including: "Dennis Ritchie") == 6)
    #expect(Roster.smallestCall(including: "me") == 2)
    #expect(Roster.smallestCall(including: "Nobody") == nil)
}

@Test
func initialsUseTheFirstTwoWordsWithoutTheMeMarker() {
    #expect(Roster.all[0].initials == "P")
    #expect(Roster.all[1].initials == "AL")
    #expect(Roster.all[4].initials == "KJ")
}
