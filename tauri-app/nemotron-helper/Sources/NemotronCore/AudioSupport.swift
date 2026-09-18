import Foundation

public struct SessionSampleClock: Sendable {
    public let sampleRate: Int
    public private(set) var totalSamples: Int = 0

    public init(sampleRate: Int) {
        self.sampleRate = max(1, sampleRate)
    }

    public mutating func advance(by sampleCount: Int) {
        totalSamples += max(0, sampleCount)
    }

    public func milliseconds(for sampleIndex: Int) -> Int {
        Int((Double(max(0, sampleIndex)) / Double(sampleRate) * 1_000).rounded())
    }

    public var elapsedMilliseconds: Int {
        milliseconds(for: totalSamples)
    }
}

public struct SpeechBoundaryDetector: Sendable {
    private let sampleRate: Int
    private let rmsThreshold: Float
    private let trailingSilenceSamples: Int
    private let minimumSpeechSamples: Int

    public private(set) var speechStartSample: Int?
    public private(set) var voicedSamples = 0
    public private(set) var silentSamples = 0

    public init(
        sampleRate: Int,
        rmsThreshold: Float,
        trailingSilenceMilliseconds: Int,
        minimumSpeechMilliseconds: Int
    ) {
        self.sampleRate = max(1, sampleRate)
        self.rmsThreshold = max(0, rmsThreshold)
        trailingSilenceSamples =
            self.sampleRate * max(1, trailingSilenceMilliseconds) / 1_000
        minimumSpeechSamples =
            self.sampleRate * max(1, minimumSpeechMilliseconds) / 1_000
    }

    public mutating func observe(_ samples: [Float], absoluteStartSample: Int) -> Bool {
        guard !samples.isEmpty else { return false }

        let rms = Self.rms(samples)
        if rms >= rmsThreshold {
            if speechStartSample == nil {
                speechStartSample = max(0, absoluteStartSample)
            }
            voicedSamples += samples.count
            silentSamples = 0
        } else if speechStartSample != nil {
            silentSamples += samples.count
        }

        return voicedSamples >= minimumSpeechSamples
            && silentSamples >= trailingSilenceSamples
    }

    public mutating func reset() {
        speechStartSample = nil
        voicedSamples = 0
        silentSamples = 0
    }

    public static func rms(_ samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0 }
        let sumSquares = samples.reduce(Float.zero) { $0 + $1 * $1 }
        return (sumSquares / Float(samples.count)).squareRoot()
    }
}

public func decodePCM16Base64(_ encoded: String) throws -> [Float] {
    guard let data = Data(base64Encoded: encoded) else {
        throw AudioSupportError.invalidBase64
    }
    guard data.count.isMultiple(of: 2) else {
        throw AudioSupportError.invalidPCMByteCount(data.count)
    }

    return data.withUnsafeBytes { bytes in
        bytes.bindMemory(to: Int16.self).map { Float($0) / Float(Int16.max) }
    }
}

public func resampleLinear(_ samples: [Float], from sourceRate: Int, to targetRate: Int) -> [Float] {
    guard !samples.isEmpty, sourceRate > 0, targetRate > 0 else { return [] }
    guard sourceRate != targetRate else { return samples }

    let ratio = Double(targetRate) / Double(sourceRate)
    let outputCount = max(1, Int((Double(samples.count) * ratio).rounded()))
    var output = [Float](repeating: 0, count: outputCount)

    for index in output.indices {
        let sourceIndex = Double(index) / ratio
        let lower = min(Int(sourceIndex.rounded(.down)), samples.count - 1)
        let upper = min(lower + 1, samples.count - 1)
        let fraction = Float(sourceIndex - Double(lower))
        output[index] = samples[lower] + (samples[upper] - samples[lower]) * fraction
    }
    return output
}

public enum AudioSupportError: Error, LocalizedError {
    case invalidBase64
    case invalidPCMByteCount(Int)

    public var errorDescription: String? {
        switch self {
        case .invalidBase64:
            "Audio payload is not valid base64"
        case let .invalidPCMByteCount(count):
            "Audio payload has \(count) bytes; PCM16 requires an even byte count"
        }
    }
}
