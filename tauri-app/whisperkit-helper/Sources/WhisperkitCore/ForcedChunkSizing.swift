import Foundation

public enum ForcedChunkSizing {
    /// Picks a commit length in `[minSamples, maxSamples]` that varies by chunk ordinal.
    public static func targetSamples(minSamples: Int, maxSamples: Int, chunkOrdinal: Int) -> Int {
        guard minSamples <= maxSamples else { return minSamples }
        let span = maxSamples - minSamples
        guard span > 0 else { return minSamples }
        let offset = (chunkOrdinal * 7 + chunkOrdinal * chunkOrdinal * 3) % (span + 1)
        return minSamples + offset
    }
}
