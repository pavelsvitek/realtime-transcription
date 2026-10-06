import Foundation
import Testing
@testable import FakeZoomCore

private let call3 = Roster.participants(count: 3)

private func load(_ json: String, participants: [Participant] = call3) throws -> Scenario {
    try ScenarioLoader.load(Data(json.utf8), participants: participants)
}

private func failure(_ json: String, participants: [Participant] = call3) -> String? {
    do {
        _ = try load(json, participants: participants)
        return nil
    } catch {
        return "\(error)"
    }
}

@Test
func aScenarioWithAllStepKindsLoads() throws {
    let scenario = try load("""
    { "name": "mix", "steps": [
      { "speak": "Ada Lovelace", "text": "Hello there everyone", "voice": "Samantha", "rate": 200, "lead": 0.5, "hold": 1 },
      { "pause": 1.5 },
      { "overlap": [
        { "speak": "Ada Lovelace", "text": "one" },
        { "speak": "Alan Turing", "duration": 2 } ] },
      { "speak": "me", "duration": 1 }
    ] }
    """)
    #expect(scenario.name == "mix")
    #expect(scenario.steps.count == 4)

    guard case .speak(let first) = scenario.steps[0] else {
        Issue.record("expected a speak step")
        return
    }
    #expect(first.participant.name == "Ada Lovelace")
    #expect(first.effectiveVoice == "Samantha")
    #expect(first.wordsPerMinute == 200)
    #expect(first.lead == 0.5)
    #expect(first.hold == 1)

    guard case .overlap(let pair) = scenario.steps[2] else {
        Issue.record("expected an overlap step")
        return
    }
    #expect(pair.map(\.participant.name) == ["Ada Lovelace", "Alan Turing"])
    #expect(scenario.utterances.count == 4)
    #expect(scenario.utterances.last?.participant.isLocalUser == true)
}

@Test
func speakingDefaultsToTheParticipantsVoiceAndShortTimings() throws {
    let scenario = try load(#"{ "steps": [ { "speak": "Alan Turing", "text": "Hi" } ] }"#)
    let utterance = try #require(scenario.utterances.first)
    #expect(utterance.effectiveVoice == "Daniel")
    #expect(utterance.lead == Utterance.defaultLead)
    #expect(utterance.hold == Utterance.defaultHold)
    #expect(utterance.wordsPerMinute == nil)
}

@Test
func durationEstimateFollowsWordCountAndRate() throws {
    let scenario = try load("""
    { "steps": [
      { "speak": "Ada Lovelace", "text": "one two three four five six seven eight nine ten", "rate": 120 },
      { "speak": "Ada Lovelace", "text": "hi", "rate": 400 },
      { "speak": "Ada Lovelace", "duration": 4.5 }
    ] }
    """)
    let utterances = scenario.utterances
    #expect(utterances[0].estimatedSeconds == 5.0)
    // One word at 400 wpm is 0.15 s; speech never counts as shorter than 0.3 s.
    #expect(utterances[1].estimatedSeconds == 0.3)
    #expect(utterances[2].estimatedSeconds == 4.5)
}

@Test
func mistakesAreReportedWithTheirPosition() {
    let cases: [(json: String, mentions: [String])] = [
        ("not json", ["not valid JSON"]),
        ("[]", ["JSON object"]),
        (#"{ "steps": [] }"#, ["steps", "non-empty"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "text": "hi", "colour": 1 } ] }"#, ["steps[0]", "unknown key 'colour'"]),
        (#"{ "stepz": [] }"#, ["unknown key 'stepz'"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace" } ] }"#, ["steps[0]", "text", "duration"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "text": "hi", "duration": 2 } ] }"#, ["text", "duration"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "text": "   " } ] }"#, ["steps[0].text", "empty"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "duration": 0 } ] }"#, ["steps[0].duration"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "text": "hi", "rate": 20 } ] }"#, ["steps[0].rate"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "text": "hi", "hold": -1 } ] }"#, ["steps[0].hold"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "text": "hi", "lead": true } ] }"#, ["steps[0].lead", "number"]),
        (#"{ "steps": [ { "pause": 1, "speak": "Ada Lovelace", "text": "hi" } ] }"#, ["exactly one"]),
        (#"{ "steps": [ { "wait": 1 } ] }"#, ["exactly one"]),
        (#"{ "steps": [ { "pause": 0 } ] }"#, ["steps[0].pause"]),
        (#"{ "steps": [ { "pause": "1s" } ] }"#, ["steps[0].pause", "number"]),
        (#"{ "steps": [ { "overlap": [ { "speak": "Ada Lovelace", "text": "hi" } ] } ] }"#, ["overlap", "two"]),
        (#"{ "steps": [ { "overlap": [ { "speak": "Ada Lovelace", "text": "a" }, { "speak": "ada lovelace", "text": "b" } ] } ] }"#, ["cannot speak twice"]),
    ]
    for (json, mentions) in cases {
        let message = failure(json)
        #expect(message != nil, "should have been rejected: \(json)")
        for word in mentions {
            #expect(message?.contains(word) == true, "'\(word)' missing from '\(message ?? "")' for \(json)")
        }
    }
}

@Test
func anUnknownParticipantSaysHowManyPeopleItNeeds() {
    let message = failure(#"{ "steps": [ { "speak": "Grace Hopper", "text": "hi" } ] }"#)
    #expect(message?.contains("steps[0].speak") == true)
    #expect(message?.contains("3-person call") == true)
    #expect(message?.contains("--participants 4") == true)

    let stranger = failure(#"{ "steps": [ { "speak": "Nobody Atall", "text": "hi" } ] }"#)
    #expect(stranger?.contains("--participants") == false)
}

@Test
func shippedScenariosLoadAndTheirDescriptionsStateHowManyPeopleTheyNeed() throws {
    let directory = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("scenarios")
    let files = try FileManager.default
        .contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        .filter { $0.pathExtension == "json" }
    #expect(files.count >= 5)

    for file in files {
        let everyone = Roster.participants(count: Roster.maximumParticipants)
        let scenario = try ScenarioLoader.load(contentsOf: file, participants: everyone)
        #expect(!scenario.steps.isEmpty, "\(file.lastPathComponent)")

        // Each description says "--participants N": N must really be the minimum.
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any]
        let description = json?["description"] as? String ?? ""
        let digits = try #require(
            description.range(of: #"--participants (\d)"#, options: .regularExpression),
            "\(file.lastPathComponent) must say how many participants it needs"
        )
        let needed = try #require(Int(description[digits].suffix(1)))
        let enough = Roster.participants(count: needed)
        #expect(throws: Never.self) { try ScenarioLoader.load(contentsOf: file, participants: enough) }
        if needed > Roster.minimumParticipants {
            let tooFew = Roster.participants(count: needed - 1)
            #expect(throws: ScenarioError.self, "\(file.lastPathComponent) with \(needed - 1) people") {
                try ScenarioLoader.load(contentsOf: file, participants: tooFew)
            }
        }
    }
}
