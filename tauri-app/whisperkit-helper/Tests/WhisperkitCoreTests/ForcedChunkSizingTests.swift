import Testing
@testable import WhisperkitCore

@Suite("ForcedChunkSizing")
struct ForcedChunkSizingTests {
    private let sampleRate = 16_000

    @Test("target samples stay within 14–27 s window")
    func targetSamplesWithinRange() {
        let minSamples = sampleRate * 14
        let maxSamples = sampleRate * 27

        for ordinal in 0..<20 {
            let target = ForcedChunkSizing.targetSamples(
                minSamples: minSamples,
                maxSamples: maxSamples,
                chunkOrdinal: ordinal
            )
            #expect(target >= minSamples)
            #expect(target <= maxSamples)
        }
    }

    @Test("target samples vary across ordinals")
    func targetSamplesVary() {
        let minSamples = sampleRate * 14
        let maxSamples = sampleRate * 27
        let targets = (0..<12).map {
            ForcedChunkSizing.targetSamples(
                minSamples: minSamples,
                maxSamples: maxSamples,
                chunkOrdinal: $0
            )
        }

        #expect(Set(targets).count > 1)
    }
}
