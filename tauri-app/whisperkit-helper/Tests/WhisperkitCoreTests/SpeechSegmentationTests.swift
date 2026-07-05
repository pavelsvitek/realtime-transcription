import Testing
import WhisperkitCore

@Suite("SilenceSegmentation")
struct SilenceSegmentationTests {
    private let sampleRate = 16_000

    @Test("returns nil when audio is all silence")
    func allSilence() {
        let samples = [Float](repeating: 0, count: sampleRate * 5)
        let end = SilenceSegmentation.findPauseEndSampleIndex(
            samples: samples,
            sampleRate: sampleRate
        )
        #expect(end == nil)
    }

    @Test("detects commit point after speech followed by pause")
    func speechThenPause() {
        var samples = [Float](repeating: 0, count: sampleRate * 4)
        for index in 0..<(sampleRate * 2) {
            samples[index] = 0.2
        }

        let end = SilenceSegmentation.findPauseEndSampleIndex(
            samples: samples,
            sampleRate: sampleRate,
            silenceGapMs: 1500,
            minSpeechMs: 500
        )

        #expect(end == sampleRate * 2)
    }

    @Test("does not commit before minimum speech duration")
    func waitsForMinimumSpeech() {
        var samples = [Float](repeating: 0, count: sampleRate)
        for index in 0..<(sampleRate / 4) {
            samples[index] = 0.2
        }

        let end = SilenceSegmentation.findPauseEndSampleIndex(
            samples: samples,
            sampleRate: sampleRate,
            silenceGapMs: 500,
            minSpeechMs: 800
        )

        #expect(end == nil)
    }
}

@Suite("SpeechClipBuilder")
struct SpeechClipBuilderTests {
    private let sampleRate = 16_000

    @Test("maps whisper segment times through lead trim offset")
    func mapsSegmentTimes() {
        let clips = SpeechClipBuilder.clipsFromWhisperSegments(
            segments: [
                .init(text: "hello", startSeconds: 0.5, endSeconds: 1.5, noSpeechProb: 0.1),
                .init(text: "world", startSeconds: 2.0, endSeconds: 3.0, noSpeechProb: 0.1),
            ],
            leadSamples: 8000,
            windowSampleCount: 48_000,
            sampleRate: sampleRate,
            noSpeechThreshold: 0.6,
            fallbackText: nil
        )

        #expect(clips.count == 2)
        #expect(clips[0].text == "hello")
        #expect(clips[0].startSample == 8000 + 8000)
        #expect(clips[0].endSample == 8000 + 24_000)
        #expect(clips[1].text == "world")
    }

    @Test("falls back to whole window when no speech segments")
    func fallbackWholeWindow() {
        let clips = SpeechClipBuilder.clipsFromWhisperSegments(
            segments: [],
            leadSamples: 0,
            windowSampleCount: 16_000,
            sampleRate: sampleRate,
            noSpeechThreshold: 0.6,
            fallbackText: "full transcript"
        )

        #expect(clips == [
            SpeechClip(text: "full transcript", startSample: 0, endSample: 16_000),
        ])
    }

    @Test("mergeClips joins whisper sub-segments into one window commit")
    func mergeClipsJoinsSubSegments() {
        let merged = SpeechClipBuilder.mergeClips([
            SpeechClip(text: "hello", startSample: 0, endSample: 8000),
            SpeechClip(text: "world", startSample: 8000, endSample: 16_000),
        ])

        #expect(merged == SpeechClip(text: "hello world", startSample: 0, endSample: 16_000))
    }
}
