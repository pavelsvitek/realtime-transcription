import Testing
import WhisperkitCore

@Suite("SessionSampleClock")
struct SessionSampleClockTests {
    private let sampleRate = 16_000

    @Test("buffer start maps to zero session time")
    func bufferStartIsZeroMs() {
        let clock = SessionSampleClock(sampleRate: sampleRate)
        #expect(clock.sessionMs(bufferIndex: 0) == 0)
    }

    @Test("session ms scales with sample rate")
    func sessionMsScalesWithSampleRate() {
        let clock = SessionSampleClock(sampleRate: sampleRate)
        #expect(clock.sessionMs(bufferIndex: sampleRate) == 1000)
        #expect(clock.sessionMs(bufferIndex: sampleRate * 30) == 30_000)
    }

    @Test("trim prefix preserves absolute session time after buffer rebase")
    func trimPrefixPreservesAbsoluteTime() {
        var clock = SessionSampleClock(sampleRate: sampleRate)

        let committedSampleIndex = sampleRate * 30
        let contextOverlap = sampleRate * 2
        let keepFrom = clock.trimKeepFrom(
            committedSampleIndex: committedSampleIndex,
            contextOverlapSamples: contextOverlap
        )

        #expect(keepFrom == sampleRate * 28)

        let absoluteEndMs = clock.sessionMs(bufferIndex: committedSampleIndex)
        #expect(absoluteEndMs == 30_000)

        clock.advanceTrim(by: keepFrom)
        let rebasedCommittedIndex = committedSampleIndex - keepFrom

        #expect(rebasedCommittedIndex == contextOverlap)
        #expect(clock.sessionMs(bufferIndex: rebasedCommittedIndex) == absoluteEndMs)
    }

    @Test("timestamps stay monotonic across repeated trims")
    func monotonicAcrossRepeatedTrims() {
        var clock = SessionSampleClock(sampleRate: sampleRate)
        var committedSampleIndex = 0
        var lastEndMs = -1
        let chunkSamples = sampleRate * 30
        let contextOverlap = sampleRate * 2

        for _ in 0..<5 {
            let chunkEnd = committedSampleIndex + chunkSamples
            let startMs = clock.sessionMs(bufferIndex: committedSampleIndex)
            let endMs = clock.sessionMs(bufferIndex: chunkEnd)

            #expect(startMs >= lastEndMs)
            #expect(endMs > startMs)

            lastEndMs = endMs
            committedSampleIndex = chunkEnd

            let keepFrom = clock.trimKeepFrom(
                committedSampleIndex: committedSampleIndex,
                contextOverlapSamples: contextOverlap
            )
            clock.advanceTrim(by: keepFrom)
            committedSampleIndex -= keepFrom
        }

        #expect(lastEndMs == 150_000)
    }

    @Test("advanceTrim ignores non-positive keepFrom")
    func advanceTrimIgnoresNonPositive() {
        var clock = SessionSampleClock(sampleRate: sampleRate)
        clock.advanceTrim(by: 0)
        clock.advanceTrim(by: -100)
        #expect(clock.trimmedPrefixSamples == 0)
        #expect(clock.sessionMs(bufferIndex: sampleRate) == 1000)
    }
}
