import AppKit
import FakeSlackCore

/// A Slack Huddle participant tile.
///
/// Mirrors Slack 4.50.128's `AXCell` (`p-huddle_peer_tile`) inside
/// `p-huddle_grid_component__grid`, alongside its sibling offscreen description
/// node (`<cell-id>-a11y_huddle_peer_tile_description`).
@MainActor
final class PeerTileView: NSView {
    let participant: Participant
    let layoutMode: LayoutMode
    private(set) var isSpeaking = false
    private(set) var isMuted = false
    var onClick: (() -> Void)?

    private let avatar = NSView()
    private let initialsLabel: NSTextField
    private let nameLabel: NSTextField
    private let mutedBadge = NSView()
    private let mutedIconView = NSImageView()

    // Accessibility elements matching Slack 4.53.292's grid row + sibling offscreen description.
    let rowElement: DomAxElement
    let descriptionWrapper: DomAxElement
    private let descriptionText: DomAxElement
    private let mutedOverlayElement: DomAxElement
    private let speakingOverlayElement: DomAxElement
    private let nameOverlayElement: DomAxElement
    private let activityIconsElement: DomAxElement

    private static let speakingColor = NSColor(srgbRed: 0.17, green: 0.67, blue: 0.46, alpha: 1) // Slack #2BAC76
    private static let tileBackground = NSColor(srgbRed: 0.14, green: 0.16, blue: 0.18, alpha: 1)
    private static let palette: [NSColor] = [
        NSColor(srgbRed: 0.29, green: 0.08, blue: 0.29, alpha: 1), // Slack aubergine
        NSColor(srgbRed: 0.07, green: 0.39, blue: 0.64, alpha: 1),
        NSColor(srgbRed: 0.18, green: 0.52, blue: 0.45, alpha: 1),
        NSColor(srgbRed: 0.72, green: 0.36, blue: 0.22, alpha: 1),
        NSColor(srgbRed: 0.49, green: 0.30, blue: 0.66, alpha: 1),
        NSColor(srgbRed: 0.62, green: 0.45, blue: 0.16, alpha: 1),
        NSColor(srgbRed: 0.16, green: 0.48, blue: 0.68, alpha: 1),
        NSColor(srgbRed: 0.64, green: 0.22, blue: 0.42, alpha: 1),
    ]

    init(participant: Participant, colorIndex: Int, initiallyMuted: Bool, layoutMode: LayoutMode) {
        self.participant = participant
        self.layoutMode = layoutMode
        self.isMuted = initiallyMuted
        initialsLabel = NSTextField(labelWithString: participant.initials)
        nameLabel = NSTextField(labelWithString: participant.isLocalUser ? "\(participant.name) (You)" : participant.name)

        rowElement = DomAxElement(
            role: .row,
            title: participant.profileDescription,
            classes: ["p-bp__grid_row", "offscreen"]
        )

        let mutedMicIcon = DomAxElement(
            role: .group,
            classes: ["micIcon__XE9Cj", "micIconContainer___DE57", "p-huddle_mic_icon"]
        )
        let micImg = DomAxElement(role: .image)
        micImg.setAccessibilityParent(mutedMicIcon)
        mutedMicIcon.axChildElements = [micImg]

        mutedOverlayElement = DomAxElement(
            role: .group,
            classes: Participant.micOverlayClasses(isMuted: true, isSpeaking: false, layout: layoutMode) ?? []
        )
        mutedMicIcon.setAccessibilityParent(mutedOverlayElement)
        mutedOverlayElement.axChildElements = [mutedMicIcon]

        let speakingMicIcon = DomAxElement(
            role: .group,
            classes: ["micIcon__XE9Cj", "micIconContainer___DE57"]
        )
        speakingOverlayElement = DomAxElement(
            role: .group,
            classes: Participant.micOverlayClasses(isMuted: false, isSpeaking: true, layout: layoutMode) ?? []
        )
        speakingMicIcon.setAccessibilityParent(speakingOverlayElement)
        speakingOverlayElement.axChildElements = [speakingMicIcon]

        let audioLabel = initiallyMuted ? "video is off, audio is off" : "video is off, audio is on"
        nameOverlayElement = DomAxElement(
            role: .button,
            title: audioLabel,
            description: audioLabel,
            classes: Participant.nameOverlayClasses(isMuted: initiallyMuted, isSpeaking: false)
        )

        activityIconsElement = DomAxElement(
            role: .group,
            classes: layoutMode == .compact
                ? [
                    "p-huddle_peer_tile__activity_icons_container",
                    "p-huddle_peer_tile__activity_icons_container--medium-tile",
                ]
                : ["p-huddle_peer_tile__activity_icons_container"]
        )

        descriptionText = DomAxElement(
            role: .staticText,
            value: participant.tileDescriptionText(isMuted: initiallyMuted)
        )
        let descriptionInner = DomAxElement(
            role: .group,
            domId: participant.descriptionDomId,
            classes: ["offscreen"]
        )
        descriptionText.setAccessibilityParent(descriptionInner)
        descriptionInner.axChildElements = [descriptionText]

        descriptionWrapper = DomAxElement(role: .group)
        descriptionInner.setAccessibilityParent(descriptionWrapper)
        descriptionWrapper.axChildElements = [descriptionInner]

        super.init(frame: .zero)

        rowElement.axChildElements = [self]
        mutedOverlayElement.setAccessibilityParent(self)
        speakingOverlayElement.setAccessibilityParent(self)
        nameOverlayElement.setAccessibilityParent(self)
        activityIconsElement.setAccessibilityParent(self)

        nameLabel.setAccessibilityElement(false)
        initialsLabel.setAccessibilityElement(false)
        avatar.setAccessibilityElement(false)
        mutedBadge.setAccessibilityElement(false)
        mutedIconView.setAccessibilityElement(false)

        wantsLayer = true
        layer?.backgroundColor = Self.tileBackground.cgColor
        layer?.cornerRadius = 14
        layer?.borderColor = Self.speakingColor.cgColor
        layer?.borderWidth = 0

        avatar.wantsLayer = true
        avatar.layer?.backgroundColor = Self.palette[colorIndex % Self.palette.count].cgColor
        addSubview(avatar)

        initialsLabel.font = .systemFont(ofSize: 32, weight: .semibold)
        initialsLabel.textColor = .white
        initialsLabel.alignment = .center
        avatar.addSubview(initialsLabel)

        nameLabel.font = .systemFont(ofSize: 12, weight: .semibold)
        nameLabel.textColor = .white
        nameLabel.alignment = .center
        nameLabel.wantsLayer = true
        nameLabel.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.55).cgColor
        nameLabel.layer?.cornerRadius = 6
        addSubview(nameLabel)

        mutedBadge.wantsLayer = true
        mutedBadge.layer?.backgroundColor = NSColor(srgbRed: 0.88, green: 0.12, blue: 0.35, alpha: 0.92).cgColor
        mutedBadge.layer?.cornerRadius = 12
        mutedBadge.isHidden = !initiallyMuted
        if let symbol = NSImage(systemSymbolName: "mic.slash.fill", accessibilityDescription: nil) {
            mutedIconView.image = symbol
            mutedIconView.contentTintColor = .white
        }
        mutedBadge.addSubview(mutedIconView)
        addSubview(mutedBadge)
    }

    required init?(coder: NSCoder) {
        fatalError("not used")
    }

    func update(speaking: Bool, muted: Bool) {
        guard speaking != isSpeaking || muted != isMuted else { return }
        isSpeaking = speaking
        isMuted = muted
        layer?.borderWidth = speaking ? 3.5 : 0
        mutedBadge.isHidden = !muted
        descriptionText.axValueText = participant.tileDescriptionText(isMuted: muted)
        let audioLabel = muted ? "video is off, audio is off" : "video is off, audio is on"
        nameOverlayElement.axTitleText = audioLabel
        nameOverlayElement.axDescriptionText = audioLabel
        nameOverlayElement.domClasses = Participant.nameOverlayClasses(isMuted: muted, isSpeaking: speaking)
        NSAccessibility.post(element: self, notification: .uiElementDestroyed)
        NSAccessibility.post(element: descriptionText, notification: .valueChanged)
    }

    override func layout() {
        super.layout()
        let side = max(44, min(bounds.width, bounds.height) * 0.42)
        avatar.frame = NSRect(
            x: (bounds.width - side) / 2,
            y: (bounds.height - side) / 2 + 6,
            width: side,
            height: side
        )
        avatar.layer?.cornerRadius = side * 0.24
        initialsLabel.font = .systemFont(ofSize: side * 0.38, weight: .semibold)
        initialsLabel.sizeToFit()
        initialsLabel.frame.origin = NSPoint(
            x: (side - initialsLabel.frame.width) / 2,
            y: (side - initialsLabel.frame.height) / 2
        )

        nameLabel.sizeToFit()
        let labelW = min(bounds.width - 16, nameLabel.frame.width + 14)
        nameLabel.frame = NSRect(x: 8, y: 8, width: labelW, height: nameLabel.frame.height + 5)

        let badgeSize: CGFloat = 24
        mutedBadge.frame = NSRect(
            x: bounds.width - badgeSize - 8,
            y: 8,
            width: badgeSize,
            height: badgeSize
        )
        mutedIconView.frame = NSRect(x: 4, y: 4, width: 16, height: 16)

        updateVirtualFrames()
    }

    private func updateVirtualFrames() {
        guard let window else { return }
        let screenRect = window.convertToScreen(convert(bounds, to: nil))
        rowElement.setAccessibilityFrame(NSRect(x: screenRect.minX, y: screenRect.minY, width: 1, height: 1))
        descriptionWrapper.setAccessibilityFrame(screenRect)
        let micRect = window.convertToScreen(convert(mutedBadge.frame, to: nil))
        mutedOverlayElement.setAccessibilityFrame(micRect)
        speakingOverlayElement.setAccessibilityFrame(micRect)
        let nameRect = window.convertToScreen(convert(nameLabel.frame, to: nil))
        nameOverlayElement.setAccessibilityFrame(nameRect)
        activityIconsElement.setAccessibilityFrame(NSRect(x: screenRect.maxX - 44, y: screenRect.maxY - 36, width: 40, height: 32))
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        needsLayout = true
    }

    override func mouseDown(with event: NSEvent) {
        onClick?()
    }

    // MARK: Accessibility (matches Slack 4.53.292's AXCell.p-huddle_peer_tile)

    override func isAccessibilityElement() -> Bool { true }
    override func accessibilityRole() -> NSAccessibility.Role? { .cell }
    override func accessibilityParent() -> Any? { rowElement }
    override func accessibilityLabel() -> String? { participant.profileDescription }
    override func accessibilityTitle() -> String? { participant.profileDescription }

    override func accessibilityChildren() -> [Any]? {
        var children: [Any] = []
        if isMuted {
            children.append(mutedOverlayElement)
        } else if isSpeaking {
            children.append(speakingOverlayElement)
        }
        if layoutMode == .full {
            children.append(nameOverlayElement)
        }
        children.append(activityIconsElement)
        return children
    }

    @available(macOS, deprecated: 10.10)
    override nonisolated func accessibilityAttributeNames() -> [NSAccessibility.Attribute] {
        var names = super.accessibilityAttributeNames()
        names.append(NSAccessibility.Attribute(rawValue: "AXDOMIdentifier"))
        names.append(NSAccessibility.Attribute(rawValue: "AXDOMClassList"))
        return names
    }

    @available(macOS, deprecated: 10.10)
    override nonisolated func accessibilityAttributeValue(_ attribute: NSAccessibility.Attribute) -> Any? {
        if attribute.rawValue == "AXDOMIdentifier" {
            return MainActor.assumeIsolated { participant.gridCellDomId }
        }
        if attribute.rawValue == "AXDOMClassList" {
            return MainActor.assumeIsolated { participant.tileClasses }
        }
        return super.accessibilityAttributeValue(attribute)
    }
}
