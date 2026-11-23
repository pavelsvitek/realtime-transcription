import Testing
@testable import NemotronCore

@Test
func sessionClockTracksAbsoluteSamples() {
    var clock = SessionSampleClock(sampleRate: 16_000)
    clock.advance(by: 8_000)
    #expect(clock.elapsedMilliseconds == 500)
    clock.advance(by: 16_000)
    #expect(clock.elapsedMilliseconds == 1_500)
}

@Test
func boundaryDetectorRequiresSpeechThenTrailingSilence() {
    var detector = SpeechBoundaryDetector(
        sampleRate: 1_000,
        rmsThreshold: 0.01,
        trailingSilenceMilliseconds: 800,
        minimumSpeechMilliseconds: 300
    )

    let afterSpeech = detector.observe(
        [Float](repeating: 0.1, count: 300),
        absoluteStartSample: 100
    )
    #expect(!afterSpeech)
    #expect(detector.speechStartSample == 100)
    let beforeBoundary = detector.observe(
        [Float](repeating: 0, count: 799),
        absoluteStartSample: 400
    )
    #expect(!beforeBoundary)
    let atBoundary = detector.observe([0], absoluteStartSample: 1_199)
    #expect(atBoundary)
}

@Test
func linearResamplerPreservesDuration() {
    let input = [Float](repeating: 0.25, count: 48_000)
    let output = resampleLinear(input, from: 48_000, to: 16_000)
    #expect(output.count == 16_000)
    #expect(output.allSatisfy { abs($0 - 0.25) < 0.0001 })
}

@Test
func unifiedOptionsDefaultsAndOverrides() {
    let defaults = UnifiedRuntimeOptions.fromEnvironment([:])
    #expect(defaults.latencyTier == .ms1120)
    #expect(defaults.precision == .int8)
    #expect(defaults.language == "auto")
    #expect(defaults.encoderFilename == "nemotron_unified_encoder_streaming_70_7_7_int8.mlmodelc")
    #expect(defaults.requiredBundleComponents.count == 4)

    let fromInit = defaults.withLanguage(from: "cs", environment: [:])
    #expect(fromInit.language == "cs")

    let custom = UnifiedRuntimeOptions.fromEnvironment([
        "NEMOTRON_UNIFIED_LATENCY_MS": "2080",
        "NEMOTRON_UNIFIED_PRECISION": "FP16",
        "NEMOTRON_UNIFIED_LANGUAGE": "de",
    ])
    #expect(custom.latencyTier == .ms2080)
    #expect(custom.precision == .fp16)
    #expect(custom.language == "de")
    #expect(custom.encoderFilename == "nemotron_unified_encoder_streaming_70_13_13.mlmodelc")
    // Environment variable takes precedence over init message language.
    #expect(
        custom.withLanguage(
            from: "cs",
            environment: ["NEMOTRON_UNIFIED_LANGUAGE": "de"]
        ).language == "de"
    )

    let invalid = UnifiedRuntimeOptions.fromEnvironment([
        "NEMOTRON_UNIFIED_LATENCY_MS": "999",
        "NEMOTRON_UNIFIED_PRECISION": "fp32",
        "NEMOTRON_UNIFIED_LANGUAGE": "xx",
    ])
    #expect(invalid == defaults)
}

@Test
func utteranceCursorSlicesCommitsWithoutResettingContext() {
    var cursor = UtteranceCursor()
    #expect(cursor.pendingText(from: "Hello world.") == "Hello world.")

    let firstCommit = cursor.commit(from: "Hello world.")
    #expect(firstCommit == "Hello world.")
    #expect(cursor.pendingText(from: "Hello world.") == "")

    #expect(cursor.pendingText(from: "Hello world. How are you?") == "How are you?")
    let secondCommit = cursor.commit(from: "Hello world. How are you?")
    #expect(secondCommit == "How are you?")

    cursor.reset()
    #expect(cursor.committedScalarCount == 0)
    #expect(cursor.pendingText(from: "New speaker.") == "New speaker.")
}
