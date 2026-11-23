import AppKit

/// A virtual accessibility node that carries Chromium/Electron DOM metadata
/// (`AXDOMIdentifier` and `AXDOMClassList`) alongside standard AX attributes.
///
/// Amie's `ax.rs` reads `AXDOMIdentifier` and `AXDOMClassList` via
/// `AXUIElementCopyAttributeValue`, which AppKit routes to
/// `accessibilityAttributeValue(_:)` for non-standard attributes.
final class DomAxElement: NSAccessibilityElement, @unchecked Sendable {
    private let axRole: NSAccessibility.Role
    var axTitleText: String?
    var axDescriptionText: String?
    var axValueText: String?
    var domIdentifier: String?
    var domClasses: [String]
    var axChildElements: [Any] = []

    init(
        role: NSAccessibility.Role,
        title: String? = nil,
        description: String? = nil,
        value: String? = nil,
        domId: String? = nil,
        classes: [String] = []
    ) {
        self.axRole = role
        self.axTitleText = title
        self.axDescriptionText = description
        self.axValueText = value
        self.domIdentifier = domId
        self.domClasses = classes
        super.init()
    }

    override func isAccessibilityElement() -> Bool { true }
    override func accessibilityRole() -> NSAccessibility.Role? { axRole }
    override func accessibilityTitle() -> String? { axTitleText }
    override func accessibilityLabel() -> String? { axDescriptionText }
    override func accessibilityValue() -> Any? { axValueText }
    override func accessibilityChildren() -> [Any]? { axChildElements }

    @available(macOS, deprecated: 10.10)
    override func accessibilityAttributeNames() -> [NSAccessibility.Attribute] {
        var names = super.accessibilityAttributeNames()
        if domIdentifier != nil {
            names.append(NSAccessibility.Attribute(rawValue: "AXDOMIdentifier"))
        }
        if !domClasses.isEmpty {
            names.append(NSAccessibility.Attribute(rawValue: "AXDOMClassList"))
        }
        return names
    }

    @available(macOS, deprecated: 10.10)
    override func accessibilityAttributeValue(_ attribute: NSAccessibility.Attribute) -> Any? {
        if attribute.rawValue == "AXDOMIdentifier" { return domIdentifier }
        if attribute.rawValue == "AXDOMClassList" { return domClasses }
        return super.accessibilityAttributeValue(attribute)
    }
}

/// An `NSView` container that exposes a specific AX role, label, DOM id, and
/// CSS class list so its subtree mirrors Slack's Electron accessibility tree.
@MainActor
class DomAxContainerView: NSView {
    let axRole: NSAccessibility.Role
    var axTitleText: String?
    var axDescriptionText: String?
    var domIdentifier: String?
    var domClasses: [String]
    var customAccessibilityChildren: (() -> [Any])?

    init(
        role: NSAccessibility.Role = .group,
        title: String? = nil,
        description: String? = nil,
        domId: String? = nil,
        classes: [String] = []
    ) {
        self.axRole = role
        self.axTitleText = title
        self.axDescriptionText = description
        self.domIdentifier = domId
        self.domClasses = classes
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) {
        fatalError("not used")
    }

    override func isAccessibilityElement() -> Bool { true }
    override func accessibilityRole() -> NSAccessibility.Role? { axRole }
    override func accessibilityTitle() -> String? { axTitleText }
    override func accessibilityLabel() -> String? { axDescriptionText }

    override func accessibilityChildren() -> [Any]? {
        if let customAccessibilityChildren {
            return customAccessibilityChildren()
        }
        return super.accessibilityChildren()
    }

    @available(macOS, deprecated: 10.10)
    override nonisolated func accessibilityAttributeNames() -> [NSAccessibility.Attribute] {
        var names = super.accessibilityAttributeNames()
        let (hasId, hasClasses) = MainActor.assumeIsolated { (domIdentifier != nil, !domClasses.isEmpty) }
        if hasId {
            names.append(NSAccessibility.Attribute(rawValue: "AXDOMIdentifier"))
        }
        if hasClasses {
            names.append(NSAccessibility.Attribute(rawValue: "AXDOMClassList"))
        }
        return names
    }

    @available(macOS, deprecated: 10.10)
    override nonisolated func accessibilityAttributeValue(_ attribute: NSAccessibility.Attribute) -> Any? {
        if attribute.rawValue == "AXDOMIdentifier" {
            return MainActor.assumeIsolated { domIdentifier }
        }
        if attribute.rawValue == "AXDOMClassList" {
            return MainActor.assumeIsolated { domClasses }
        }
        return super.accessibilityAttributeValue(attribute)
    }
}

/// An `NSButton` that exposes Slack's `AXButton` / `AXCheckBox` role directly
/// (without `NSButtonCell`'s `AXUnknown` wrapper), plus `AXDOMClassList` and
/// dynamic `AXDescription` (`"Unmute microphone"` / `"Mute microphone"`).
@MainActor
final class DomAxButton: NSButton {
    var axRoleOverride: NSAccessibility.Role?
    var axDescriptionText: String?
    var domIdentifier: String?
    var domClasses: [String] = []

    override func isAccessibilityElement() -> Bool { true }
    override func accessibilityRole() -> NSAccessibility.Role? { axRoleOverride ?? .button }
    override func accessibilityTitle() -> String? { axDescriptionText }
    override func accessibilityLabel() -> String? { axDescriptionText }
    override func accessibilityChildren() -> [Any]? { [] }

    @available(macOS, deprecated: 10.10)
    override nonisolated func accessibilityAttributeNames() -> [NSAccessibility.Attribute] {
        var names = super.accessibilityAttributeNames()
        let (hasId, hasClasses) = MainActor.assumeIsolated { (domIdentifier != nil, !domClasses.isEmpty) }
        if hasId {
            names.append(NSAccessibility.Attribute(rawValue: "AXDOMIdentifier"))
        }
        if hasClasses {
            names.append(NSAccessibility.Attribute(rawValue: "AXDOMClassList"))
        }
        return names
    }

    @available(macOS, deprecated: 10.10)
    override nonisolated func accessibilityAttributeValue(_ attribute: NSAccessibility.Attribute) -> Any? {
        if attribute.rawValue == "AXDOMIdentifier" {
            return MainActor.assumeIsolated { domIdentifier }
        }
        if attribute.rawValue == "AXDOMClassList" {
            return MainActor.assumeIsolated { domClasses }
        }
        return super.accessibilityAttributeValue(attribute)
    }
}
