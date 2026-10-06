import Foundation

/// Timestamped lines on stdout. They are the ground truth to compare Amie's
/// transcript against: who was marked speaking, and when.
@MainActor
enum Log {
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter
    }()

    static func line(_ message: String) {
        print("\(formatter.string(from: Date()))  \(message)")
        fflush(stdout)
    }
}
