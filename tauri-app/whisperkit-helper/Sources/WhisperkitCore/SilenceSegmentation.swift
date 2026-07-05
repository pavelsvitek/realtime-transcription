import Foundation

public enum SilenceSegmentation {
    /// Returns the sample index **after** the last speech frame when a trailing silence gap
    /// of at least `silenceGapMs` follows speech. Index is relative to `samples` start.
    public static func findPauseEndSampleIndex(
        samples: [Float],
        sampleRate: Int,
        silenceGapMs: Int = 1500,
        frameMs: Int = 100,
        rmsThreshold: Float = 0.01,
        minSpeechMs: Int = 800
    ) -> Int? {
        guard sampleRate > 0, !samples.isEmpty else { return nil }

        let frameSamples = max(1, sampleRate * frameMs / 1000)
        let silenceGapSamples = max(frameSamples, sampleRate * silenceGapMs / 1000)
        let minSpeechSamples = max(frameSamples, sampleRate * minSpeechMs / 1000)

        var speechSamples = 0
        var trailingSilenceSamples = 0
        var lastSpeechEnd = 0
        var index = 0

        while index < samples.count {
            let end = min(index + frameSamples, samples.count)
            let frame = Array(samples[index..<end])
            let silent = frameRms(frame) < rmsThreshold

            if silent {
                trailingSilenceSamples += end - index
            } else {
                speechSamples += end - index
                trailingSilenceSamples = 0
                lastSpeechEnd = end
            }

            if speechSamples >= minSpeechSamples, trailingSilenceSamples >= silenceGapSamples {
                return lastSpeechEnd
            }

            index = end
        }

        return nil
    }

    public static func frameRms(_ samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0 }
        let sumSq = samples.reduce(0) { $0 + $1 * $1 }
        return (sumSq / Float(samples.count)).squareRoot()
    }
}
