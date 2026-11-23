import Testing
@testable import FakeSlackCore

@Test
func scenarioLocatorResolvesBareNamesAndExplicitPaths() {
    let existing: Set<String> = [
        "/shipped/conversation.json",
        "custom.json",
    ]
    #expect(
        ScenarioLocator.resolve("conversation", shippedDirectory: "/shipped", fileExists: existing.contains)
            == "/shipped/conversation.json"
    )
    #expect(
        ScenarioLocator.resolve("conversation.json", shippedDirectory: "/shipped", fileExists: existing.contains)
            == "/shipped/conversation.json"
    )
    #expect(
        ScenarioLocator.resolve("custom.json", shippedDirectory: "/shipped", fileExists: existing.contains)
            == "custom.json"
    )
    #expect(
        ScenarioLocator.resolve("missing", shippedDirectory: "/shipped", fileExists: existing.contains) == nil
    )
}
