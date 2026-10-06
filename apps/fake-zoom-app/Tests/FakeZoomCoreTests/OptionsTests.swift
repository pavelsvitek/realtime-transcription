import Testing
@testable import FakeZoomCore

private func options(_ arguments: [String]) throws -> Options {
    guard case .run(let options) = try OptionsParser.parse(arguments) else {
        Issue.record("expected a run command")
        return Options()
    }
    return options
}

@Test
func defaultsAreThreePeopleAndAFiveSecondDelay() throws {
    let defaults = try options([])
    #expect(defaults.participants == 3)
    #expect(defaults.scenarioPath == nil)
    #expect(defaults.startDelay == 5)
    #expect(defaults.audio)
    #expect(!defaults.loop)
}

@Test
func participantsAcceptsTheWholeRangeAndNothingElse() throws {
    for count in 2...6 {
        #expect(try options(["--participants", "\(count)"]).participants == count)
    }
    for bad in ["1", "7", "0", "-3", "three", "2.5", ""] {
        #expect(throws: UsageError.self) { try options(["--participants", bad]) }
    }
}

@Test
func valuesCanBeGivenWithEqualsSigns() throws {
    let parsed = try options(["--participants=4", "--scenario=a/b.json", "--delay=0.5"])
    #expect(parsed.participants == 4)
    #expect(parsed.scenarioPath == "a/b.json")
    #expect(parsed.startDelay == 0.5)
}

@Test
func flagsSwitchBehaviourOn() throws {
    let parsed = try options(["--scenario", "s.json", "--loop", "--no-audio", "--quit-when-done", "--print-ax", "--show-roster", "--snapshot", "w.png"])
    #expect(parsed.showRoster)
    #expect(parsed.snapshotPath == "w.png")
    #expect(parsed.loop)
    #expect(!parsed.audio)
    #expect(parsed.quitWhenDone)
    #expect(parsed.printAccessibilityTree)
}

@Test
func loopAndQuitWhenDoneNeedAScenario() {
    #expect(throws: UsageError.self) { try options(["--loop"]) }
    #expect(throws: UsageError.self) { try options(["--quit-when-done"]) }
}

@Test
func badInputIsReportedNotIgnored() {
    #expect(throws: UsageError.self) { try options(["--bogus"]) }
    #expect(throws: UsageError.self) { try options(["--participants"]) }
    #expect(throws: UsageError.self) { try options(["--delay", "-1"]) }
    #expect(throws: UsageError.self) { try options(["--delay", "soon"]) }
    #expect(throws: UsageError.self) { try options(["--loop=yes", "--scenario", "s.json"]) }
}

@Test
func helpWinsAndLaunchServicesArgumentsAreIgnored() throws {
    #expect(try OptionsParser.parse(["--help"]) == .help)
    #expect(try OptionsParser.parse(["-h"]) == .help)
    #expect(try options(["-psn_0_12345", "--participants", "2"]).participants == 2)
}
