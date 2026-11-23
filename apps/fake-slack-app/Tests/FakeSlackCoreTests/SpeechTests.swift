import Testing
@testable import FakeSlackCore

@Test
func voiceNamesParsesSayListing() {
    let listing = """
    Daniel              en_GB    # Hello, my name is Daniel.
    Eddy (English (UK)) en_GB    # Hello! My name is Eddy.
    Samantha            en_US    # Hello, my name is Samantha.
    """
    let names = Speech.voiceNames(from: listing)
    #expect(names == ["Daniel", "Eddy (English (UK))", "Samantha"])
}

@Test
func argumentsProtectLeadingDashes() {
    #expect(
        Speech.arguments(text: "-hello", voice: "Samantha", wordsPerMinute: 180)
            == ["-v", "Samantha", "-r", "180", "--", "-hello"]
    )
}
