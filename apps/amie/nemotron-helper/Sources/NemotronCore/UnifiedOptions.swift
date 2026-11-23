import Foundation

public enum UnifiedLatencyTier: Int, Sendable, CaseIterable {
    case ms560 = 560
    case ms1120 = 1120
    case ms2080 = 2080

    public var leftFrames: Int { 70 }

    public var chunkFrames: Int {
        switch self {
        case .ms560: 2
        case .ms1120: 7
        case .ms2080: 13
        }
    }

    public var rightFrames: Int {
        switch self {
        case .ms560: 5
        case .ms1120: 7
        case .ms2080: 13
        }
    }

    public var contextSuffix: String {
        "\(leftFrames)_\(chunkFrames)_\(rightFrames)"
    }
}

public enum UnifiedPrecisionOption: String, Sendable, CaseIterable {
    case int8
    case fp16
}

public struct UnifiedRuntimeOptions: Sendable, Equatable {
    public static let defaultLatencyTier: UnifiedLatencyTier = .ms1120
    public static let defaultPrecision: UnifiedPrecisionOption = .int8
    public static let defaultLanguage = "en"

    public static let supportedLanguages: Set<String> = [
        "auto",
        "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr",
        "hr", "hu", "it", "lt", "lv", "mt", "nl", "pl", "pt", "ro",
        "ru", "sk", "sl", "sv", "uk",
    ]

    public let latencyTier: UnifiedLatencyTier
    public let precision: UnifiedPrecisionOption
    public let language: String

    public init(
        latencyTier: UnifiedLatencyTier = Self.defaultLatencyTier,
        precision: UnifiedPrecisionOption = Self.defaultPrecision,
        language: String = Self.defaultLanguage
    ) {
        self.latencyTier = latencyTier
        self.precision = precision
        self.language = language
    }

    public static func fromEnvironment(_ environment: [String: String]) -> Self {
        let latencyTier: UnifiedLatencyTier
        if let rawLatency = environment["NEMOTRON_UNIFIED_LATENCY_MS"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           let parsedInt = Int(rawLatency),
           let tier = UnifiedLatencyTier(rawValue: parsedInt)
        {
            latencyTier = tier
        } else {
            latencyTier = defaultLatencyTier
        }

        let precision: UnifiedPrecisionOption
        if let rawPrecision = environment["NEMOTRON_UNIFIED_PRECISION"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
           let parsed = UnifiedPrecisionOption(rawValue: rawPrecision)
        {
            precision = parsed
        } else {
            precision = defaultPrecision
        }

        let language: String
        if let rawLanguage = environment["NEMOTRON_UNIFIED_LANGUAGE"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
           supportedLanguages.contains(rawLanguage)
        {
            language = rawLanguage
        } else {
            language = defaultLanguage
        }

        return Self(latencyTier: latencyTier, precision: precision, language: language)
    }

    public var encoderFilename: String {
        let base = "nemotron_unified_encoder_streaming_\(latencyTier.contextSuffix)"
        return precision == .int8 ? "\(base)_int8.mlmodelc" : "\(base).mlmodelc"
    }

    public var requiredBundleComponents: [String] {
        [
            encoderFilename,
            "nemotron_unified_decoder.mlmodelc",
            "nemotron_unified_joint_decision_single_step.mlmodelc",
            "vocab.json",
        ]
    }
}

/// Tracks the committed prefix of an append-only streaming transcript so
/// silence boundaries can emit utterance commits without resetting the
/// streaming encoder's left-context window or RNN-T decoder state.
public struct UtteranceCursor: Sendable, Equatable {
    public private(set) var committedScalarCount = 0

    public init() {}

    public func pendingText(from fullTranscript: String) -> String {
        let scalars = fullTranscript.unicodeScalars
        let clamped = min(committedScalarCount, scalars.count)
        let suffix = String(scalars.dropFirst(clamped))
        return suffix.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public mutating func commit(from fullTranscript: String) -> String {
        let text = pendingText(from: fullTranscript)
        committedScalarCount = fullTranscript.unicodeScalars.count
        return text
    }

    public mutating func reset() {
        committedScalarCount = 0
    }
}
