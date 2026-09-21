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
