import Foundation

public enum EdgeSilenceTrim {
    /// Drops leading/trailing low-energy frames. Returns samples removed from the front.
    public static func trimWithLeadOffset(
        _ samples: [Float],
        threshold: Float,
        frameSamples: Int
    ) -> (leadSamples: Int, trimmed: [Float]) {
        guard !samples.isEmpty, frameSamples > 0 else { return (0, []) }

        func frameIsSilent(at start: Int) -> Bool {
            let end = min(start + frameSamples, samples.count)
            return SilenceSegmentation.frameRms(Array(samples[start..<end])) < threshold
        }

        var start = 0
        while start < samples.count {
            if !frameIsSilent(at: start) { break }
            start += frameSamples
        }

        var end = samples.count
        while end > start {
            let frameStart = max(start, end - frameSamples)
            if !frameIsSilent(at: frameStart) { break }
            end = frameStart
        }

        guard end > start else { return (0, []) }
        return (start, Array(samples[start..<end]))
    }
}
