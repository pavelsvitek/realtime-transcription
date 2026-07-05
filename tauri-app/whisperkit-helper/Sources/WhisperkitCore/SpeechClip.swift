import Foundation

public struct SpeechClip: Equatable {
    public let text: String
    public let startSample: Int
    public let endSample: Int

    public init(text: String, startSample: Int, endSample: Int) {
        self.text = text
        self.startSample = startSample
        self.endSample = endSample
    }

    public func sessionBounds(
        bufferBaseIndex: Int,
        clock: SessionSampleClock
    ) -> (startMs: Int, endMs: Int) {
        (
            clock.sessionMs(bufferIndex: bufferBaseIndex + startSample),
            clock.sessionMs(bufferIndex: bufferBaseIndex + endSample)
        )
    }
}

public enum SpeechClipBuilder {
    public struct WhisperSegmentTiming: Equatable {
        public let text: String
        public let startSeconds: Float
        public let endSeconds: Float
        public let noSpeechProb: Float

        public init(text: String, startSeconds: Float, endSeconds: Float, noSpeechProb: Float) {
            self.text = text
            self.startSeconds = startSeconds
            self.endSeconds = endSeconds
            self.noSpeechProb = noSpeechProb
        }
    }

    public static func clipsFromWhisperSegments(
        segments: [WhisperSegmentTiming],
        leadSamples: Int,
        windowSampleCount: Int,
        sampleRate: Int,
        noSpeechThreshold: Float,
        fallbackText: String?
    ) -> [SpeechClip] {
        let speechSegments = segments.filter { $0.noSpeechProb <= noSpeechThreshold && !$0.text.isEmpty }

        if speechSegments.isEmpty {
            guard let fallbackText, !fallbackText.isEmpty else { return [] }
            return [
                SpeechClip(
                    text: fallbackText,
                    startSample: leadSamples,
                    endSample: windowSampleCount
                ),
            ]
        }

        return speechSegments.map { segment in
            SpeechClip(
                text: segment.text,
                startSample: leadSamples + max(0, Int((segment.startSeconds * Float(sampleRate)).rounded())),
                endSample: min(
                    windowSampleCount,
                    leadSamples + max(1, Int((segment.endSeconds * Float(sampleRate)).rounded()))
                )
            )
        }
    }

    /// One timeline commit per decode window — merges Whisper sub-segments.
    public static func mergeClips(_ clips: [SpeechClip]) -> SpeechClip? {
        guard !clips.isEmpty else { return nil }
        let text = clips
            .map(\.text)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        guard !text.isEmpty else { return nil }
        return SpeechClip(
            text: text,
            startSample: clips[0].startSample,
            endSample: clips[clips.count - 1].endSample
        )
    }
}
