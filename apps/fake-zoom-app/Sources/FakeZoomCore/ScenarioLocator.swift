import Foundation

/// Finds the file behind `--scenario`. A path is used as given; a bare name
/// like `conversation` also matches a shipped scenario, with or without `.json`.
public enum ScenarioLocator {
    public static func candidates(for argument: String, shippedDirectory: String?) -> [String] {
        var paths = [argument]
        if let shippedDirectory, !argument.hasPrefix("/") {
            paths.append((shippedDirectory as NSString).appendingPathComponent(argument))
            if !argument.hasSuffix(".json") {
                paths.append((shippedDirectory as NSString).appendingPathComponent(argument + ".json"))
            }
        }
        return paths
    }

    public static func resolve(
        _ argument: String,
        shippedDirectory: String?,
        fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) -> String? {
        candidates(for: argument, shippedDirectory: shippedDirectory).first(where: fileExists)
    }

    /// Names usable with `--scenario`, for the "not found" message.
    public static func shippedNames(in directory: String) -> [String] {
        let files = (try? FileManager.default.contentsOfDirectory(atPath: directory)) ?? []
        return files
            .filter { $0.hasSuffix(".json") }
            .map { String($0.dropLast(".json".count)) }
            .sorted()
    }
}
