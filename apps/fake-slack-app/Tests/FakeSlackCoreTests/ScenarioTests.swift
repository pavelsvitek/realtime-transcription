import Foundation
import Testing
@testable import FakeSlackCore

private let huddle3 = Roster.participants(count: 3)

private func load(_ json: String, participants: [Participant] = huddle3) throws -> Scenario {
    try ScenarioLoader.load(Data(json.utf8), participants: participants)
}

private func failure(_ json: String, participants: [Participant] = huddle3) -> String? {
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
      { "mute": true },
      { "overlap": [
        { "speak": "Ada Lovelace", "text": "one" },
        { "speak": "Alan Turing", "duration": 2 } ] },
      { "mute": false },
      { "speak": "me", "duration": 1 }
    ] }
    """)
    #expect(scenario.name == "mix")
    #expect(scenario.steps.count == 6)
    #expect(scenario.steps[2] == .mute(true))
    #expect(scenario.steps[4] == .mute(false))
    #expect(scenario.utterances.count == 4)
    #expect(scenario.utterances.last?.participant.isLocalUser == true)
}

@Test
func mistakesAreReportedWithTheirPosition() {
    let cases: [(json: String, mentions: [String])] = [
        ("not json", ["not valid JSON"]),
        ("[]", ["JSON object"]),
        (#"{ "steps": [] }"#, ["steps", "non-empty"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "text": "hi", "colour": 1 } ] }"#, ["steps[0]", "unknown key 'colour'"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace" } ] }"#, ["steps[0]", "text", "duration"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "text": "hi", "duration": 2 } ] }"#, ["text", "duration"]),
        (#"{ "steps": [ { "speak": "Ada Lovelace", "duration": 0 } ] }"#, ["steps[0].duration"]),
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
    #expect(message?.contains("3-person huddle") == true)
    #expect(message?.contains("--participants 4") == true)
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
