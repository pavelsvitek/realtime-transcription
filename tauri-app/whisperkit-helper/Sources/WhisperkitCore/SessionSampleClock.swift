import Foundation

/// Maps buffer-relative sample indices to monotonic session timestamps.
///
/// Streaming keeps a rolling audio buffer and periodically drops committed prefix
/// samples. `trimmedPrefixSamples` tracks how much audio was removed so emitted
/// `startMs` / `endMs` stay session-relative across trims.
public struct SessionSampleClock: Equatable {
    public private(set) var trimmedPrefixSamples: Int = 0
    public let sampleRate: Int

    public init(sampleRate: Int) {
        self.sampleRate = max(1, sampleRate)
    }

    public func sessionMs(bufferIndex: Int) -> Int {
        let sessionIndex = trimmedPrefixSamples + bufferIndex
        return Int((Double(sessionIndex) / Double(sampleRate) * 1000.0).rounded())
    }

    public mutating func advanceTrim(by keepFrom: Int) {
        guard keepFrom > 0 else { return }
        trimmedPrefixSamples += keepFrom
    }

    /// Sample index to retain when trimming committed prefix (2 s overlap by default).
    public func trimKeepFrom(committedSampleIndex: Int, contextOverlapSamples: Int) -> Int {
        max(0, committedSampleIndex - contextOverlapSamples)
    }
}
