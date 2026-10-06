import AppKit
import FakeZoomCore

/// A participant tile.
///
/// For Accessibility it is what Zoom's tiles are: a menu item named
/// "Ada Lovelace, speaking" with a size and a static-text child holding the
/// bare name. That label is the whole speaking signal Amie reads.
@MainActor
final class TileView: NSView {
    let participant: Participant
    private(set) var isSpeaking = false
    var onClick: (() -> Void)?

    private let avatar = NSView()
    private let initialsLabel: NSTextField
    private let nameLabel: NSTextField
    /// What Accessibility sees as the tile's one child: a static text holding
    /// the bare name, as in Zoom. The visible label is not exposed itself
    /// because AppKit would wrap it in an extra unknown element.
    private let nameElement: NSAccessibilityElement

    private static let speakingColor = NSColor(srgbRed: 0.24, green: 0.86, blue: 0.52, alpha: 1)
    private static let palette: [NSColor] = [
        NSColor(srgbRed: 0.36, green: 0.42, blue: 0.85, alpha: 1),
        NSColor(srgbRed: 0.85, green: 0.42, blue: 0.36, alpha: 1),
        NSColor(srgbRed: 0.24, green: 0.66, blue: 0.62, alpha: 1),
        NSColor(srgbRed: 0.78, green: 0.58, blue: 0.20, alpha: 1),
        NSColor(srgbRed: 0.65, green: 0.40, blue: 0.80, alpha: 1),
        NSColor(srgbRed: 0.30, green: 0.58, blue: 0.82, alpha: 1),
    ]

    init(participant: Participant, colorIndex: Int) {
        self.participant = participant
        initialsLabel = NSTextField(labelWithString: participant.initials)
        nameLabel = NSTextField(labelWithString: participant.name)
        nameElement = NSAccessibilityElement()
        super.init(frame: .zero)

        nameElement.setAccessibilityRole(.staticText)
        nameElement.setAccessibilityValue(participant.name)
        nameElement.setAccessibilityParent(self)
        nameLabel.setAccessibilityElement(false)
        initialsLabel.setAccessibilityElement(false)

        wantsLayer = true
        layer?.backgroundColor = NSColor(srgbRed: 0.17, green: 0.17, blue: 0.18, alpha: 1).cgColor
        layer?.cornerRadius = 10
        layer?.borderColor = Self.speakingColor.cgColor
        layer?.borderWidth = 0

        avatar.wantsLayer = true
        avatar.layer?.backgroundColor = Self.palette[colorIndex % Self.palette.count].cgColor
        addSubview(avatar)

        initialsLabel.font = .systemFont(ofSize: 34, weight: .semibold)
        initialsLabel.textColor = .white
        initialsLabel.alignment = .center
        avatar.addSubview(initialsLabel)

        nameLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        nameLabel.textColor = .white
        nameLabel.alignment = .center
        nameLabel.wantsLayer = true
        nameLabel.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.55).cgColor
        nameLabel.layer?.cornerRadius = 5
        addSubview(nameLabel)
    }

    required init?(coder: NSCoder) {
        fatalError("not used")
    }

    // MARK: Appearance

    func setSpeaking(_ speaking: Bool) {
        guard speaking != isSpeaking else { return }
        isSpeaking = speaking
        layer?.borderWidth = speaking ? 4 : 0
        NSAccessibility.post(element: self, notification: .titleChanged)
    }

    override func layout() {
        super.layout()
        let side = max(40, min(bounds.width, bounds.height) * 0.38)
        avatar.frame = NSRect(
            x: (bounds.width - side) / 2,
            y: (bounds.height - side) / 2,
            width: side,
            height: side
        )
        avatar.layer?.cornerRadius = side / 2
        initialsLabel.font = .systemFont(ofSize: side * 0.38, weight: .semibold)
        initialsLabel.sizeToFit()
        initialsLabel.frame.origin = NSPoint(
            x: (side - initialsLabel.frame.width) / 2,
            y: (side - initialsLabel.frame.height) / 2
        )

        nameLabel.sizeToFit()
        nameLabel.frame = NSRect(x: 10, y: 10, width: nameLabel.frame.width + 16, height: nameLabel.frame.height + 6)
        updateNameElementFrame()
    }

    private func updateNameElementFrame() {
        guard let window else { return }
        let inWindow = convert(nameLabel.frame, to: nil)
        nameElement.setAccessibilityFrame(window.convertToScreen(inWindow))
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        needsLayout = true
    }

    override func mouseDown(with event: NSEvent) {
        onClick?()
    }

    // MARK: Accessibility

    /// What Accessibility reports as the tile's name. Suffixes follow what the
    /// Zoom tests in Amie record from the real app.
    var accessibleName: String {
        if isSpeaking { return "\(participant.name), speaking" }
        return participant.isLocalUser ? "\(participant.name), unmuted" : "\(participant.name), not speaking"
    }

    override func isAccessibilityElement() -> Bool { true }
    override func accessibilityRole() -> NSAccessibility.Role? { .menuItem }
    override func accessibilityTitle() -> String? { accessibleName }
    override func accessibilityChildren() -> [Any]? { [nameElement] }
}
