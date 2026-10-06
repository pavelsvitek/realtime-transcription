import AppKit

/// Prints the accessibility tree this app exposes, one element per line: role,
/// name, value and size.
///
/// It reads the tree through the real `AXUIElement` interface, with the same
/// attributes Amie reads from Zoom. A process may inspect itself without the
/// Accessibility permission, so this needs no setup. Anything printed here is
/// what Amie's Zoom reader is given; what it makes of it is up to its parser.
@MainActor
enum AccessibilityDump {
    private static let maximumDepth = 12

    /// The tree below the app's windows. The menu bar is left out: it is the
    /// system's, and lists things like recent apps.
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
        ] {
            if let text = string(element, attribute), !text.isEmpty {
                parts.append("\(label)=\"\(text)\"")
            }
        }
        if let size = size(of: element) {
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
