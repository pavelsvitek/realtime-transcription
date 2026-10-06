import Testing
@testable import FakeZoomCore

@Test
func aPathThatExistsWinsOverAShippedName() {
    let existing: Set<String> = ["conversation", "/shipped/conversation.json"]
    let found = ScenarioLocator.resolve("conversation", shippedDirectory: "/shipped") { existing.contains($0) }
    #expect(found == "conversation")
}

@Test
func aBareNameFindsTheShippedScenarioWithOrWithoutTheExtension() {
    let existing: Set<String> = ["/shipped/conversation.json"]
    #expect(ScenarioLocator.resolve("conversation", shippedDirectory: "/shipped") { existing.contains($0) }
        == "/shipped/conversation.json")
    #expect(ScenarioLocator.resolve("conversation.json", shippedDirectory: "/shipped") { existing.contains($0) }
        == "/shipped/conversation.json")
}

@Test
func absolutePathsAreNeverSearchedInTheShippedDirectory() {
    let candidates = ScenarioLocator.candidates(for: "/tmp/mine.json", shippedDirectory: "/shipped")
    #expect(candidates == ["/tmp/mine.json"])
}

@Test
func nothingFoundMeansNil() {
    #expect(ScenarioLocator.resolve("missing", shippedDirectory: "/shipped") { _ in false } == nil)
    #expect(ScenarioLocator.resolve("missing", shippedDirectory: nil) { _ in false } == nil)
}
