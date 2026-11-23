import AppKit

/// Prints the accessibility tree this app exposes, one element per line: role,
/// title, description, value, `AXDOMIdentifier`, `AXDOMClassList`, and size.
///
/// Uses the exact same `AXUIElementCopyAttributeValue` calls that Amie's
/// `speakers/meeting/ax.rs` makes against real Slack. A process may inspect
/// itself without Accessibility permission.
@MainActor
enum AccessibilityDump {
    private static let maximumDepth = 24

    static func render() -> String {
        let app = AXUIElementCreateApplication(ProcessInfo.processInfo.processIdentifier)
        var lines: [String] = []
        guard let first = describe(app) else {
            return "unavailable: macOS refused to let this app read its own accessibility tree"
        }
        lines.append(first)
        for child in children(of: app) where role(of: child) != kAXMenuBarRole {
            walk(child, depth: 1, into: &lines)
        }
        return lines.joined(separator: "\n")
    }

    private static func walk(_ element: AXUIElement, depth: Int, into lines: inout [String]) {
        guard depth <= maximumDepth, let line = describe(element) else { return }
        lines.append(String(repeating: "  ", count: depth) + line)
        for child in children(of: element) {
            walk(child, depth: depth + 1, into: &lines)
        }
    }

    private static func describe(_ element: AXUIElement) -> String? {
        guard let role = role(of: element) else { return nil }
        var parts = [role]
        for (label, attribute) in [
            ("title", kAXTitleAttribute),
            ("description", kAXDescriptionAttribute),
            ("value", kAXValueAttribute),
            ("id", "AXDOMIdentifier"),
        ] {
            if let text = string(element, attribute), !text.isEmpty {
                parts.append("\(label)=\"\(text)\"")
            }
        }
        let classes = stringArray(element, "AXDOMClassList")
        if !classes.isEmpty {
            parts.append("classes=[\(classes.joined(separator: ", "))]")
        }
        if let size = size(of: element), size.width > 0 || size.height > 0 {
            parts.append("size=\(Int(size.width))x\(Int(size.height))")
        }
        return parts.joined(separator: "  ")
    }

    private static func role(of element: AXUIElement) -> String? {
        string(element, kAXRoleAttribute)
    }

    private static func children(of element: AXUIElement) -> [AXUIElement] {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success else {
            return []
        }
        return value as? [AXUIElement] ?? []
    }

    private static func string(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else {
            return nil
        }
        return value as? String
    }

    private static func stringArray(_ element: AXUIElement, _ attribute: String) -> [String] {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
              let array = value as? [Any]
        else { return [] }
        return array.compactMap { $0 as? String }
    }

    private static func size(of element: AXUIElement) -> CGSize? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &value) == .success,
              let value, CFGetTypeID(value) == AXValueGetTypeID()
        else { return nil }
        var size = CGSize.zero
        guard AXValueGetValue(value as! AXValue, .cgSize, &size) else { return nil }
        return size
    }
}
