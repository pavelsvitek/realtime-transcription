import AppKit
import FakeSlackCore

private enum SlackPalette {
    static let background = NSColor(srgbRed: 0.10, green: 0.11, blue: 0.13, alpha: 1) // #1A1D21
    static let surface = NSColor(srgbRed: 0.13, green: 0.15, blue: 0.17, alpha: 1)    // #222529
    static let header = NSColor(srgbRed: 0.11, green: 0.13, blue: 0.15, alpha: 1)
    static let green = NSColor(srgbRed: 0.17, green: 0.67, blue: 0.46, alpha: 1)      // #2BAC76
    static let danger = NSColor(srgbRed: 0.88, green: 0.12, blue: 0.35, alpha: 1)     // #E01E5A
    static let buttonIdle = NSColor(srgbRed: 0.20, green: 0.22, blue: 0.25, alpha: 1)
}

/// Lays Slack huddle peer tiles in a centered grid and exposes Slack's
/// `p-huddle_grid_component__grid` accessibility structure (paired `AXRow` +
/// sibling offscreen description node per participant).
@MainActor
private final class HuddleGridView: DomAxContainerView {
    private let tiles: [PeerTileView]
    private let padding: CGFloat = 16
    private let gap: CGFloat = 12

    init(tiles: [PeerTileView]) {
        self.tiles = tiles
        super.init(role: .group, classes: ["p-huddle_grid_component__grid"])
        tiles.forEach(addSubview)
        for tile in tiles {
            tile.rowElement.setAccessibilityParent(self)
            tile.descriptionWrapper.setAccessibilityParent(self)
        }
        customAccessibilityChildren = { [tiles] in
            var elements: [Any] = []
            for tile in tiles {
                elements.append(tile.rowElement)
                elements.append(tile.descriptionWrapper)
            }
            return elements
        }
    }

    required init?(coder: NSCoder) {
        fatalError("not used")
    }

    override var isFlipped: Bool { true }

    private var columns: Int {
        switch tiles.count {
        case 1: return 1
        case 2, 3, 4: return 2
        case 5, 6: return 3
        default: return 4
        }
    }

    override func layout() {
        super.layout()
        let columns = self.columns
        let rows = (tiles.count + columns - 1) / columns
        let maxW = (bounds.width - padding * 2 - gap * CGFloat(columns - 1)) / CGFloat(columns)
        let maxH = (bounds.height - padding * 2 - gap * CGFloat(rows - 1)) / CGFloat(rows)
        let side = max(120, min(maxW, maxH, 190))

        let totalHeight = CGFloat(rows) * side + CGFloat(rows - 1) * gap
        let startY = max(padding, (bounds.height - totalHeight) / 2)

        for (index, tile) in tiles.enumerated() {
            let row = index / columns
            let inRow = min(columns, tiles.count - row * columns)
            let rowWidth = CGFloat(inRow) * side + CGFloat(inRow - 1) * gap
            let originX = (bounds.width - rowWidth) / 2
            tile.frame = NSRect(
                x: originX + CGFloat(index % columns) * (side + gap),
                y: startY + CGFloat(row) * (side + gap),
                width: side,
                height: side
            )
        }
    }
}

@MainActor
final class HuddleWindowController: NSObject {
    let window: NSWindow
    private let huddle: HuddleModel
    private let channelName: String
    private let layoutMode: LayoutMode
    private let tiles: [PeerTileView]
    private let statusLabel = NSTextField(labelWithString: "")
    private let timerLabel = NSTextField(labelWithString: "00:00")
    private let micButton = DomAxButton()
    private var clock: Task<Void, Never>?

    init(huddle: HuddleModel, channelName: String, layoutMode: LayoutMode = .compact) {
        self.huddle = huddle
        self.channelName = channelName
        self.layoutMode = layoutMode
        self.tiles = huddle.participants.enumerated().map { index, person in
            PeerTileView(
                participant: person,
                colorIndex: index,
                initiallyMuted: huddle.isMuted(person),
                layoutMode: layoutMode
            )
        }

        let initialSize: NSSize = {
            if layoutMode == .full {
                return NSSize(width: 1120, height: 680)
            }
            switch huddle.participants.count {
            case ...2: return NSSize(width: 696, height: 390)
            case 3...6: return NSSize(width: 780, height: 540)
            default: return NSSize(width: 960, height: 540)
            }
        }()

        window = NSWindow(
            contentRect: NSRect(origin: .zero, size: initialSize),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        super.init()

        window.title = "\(channelName) - Fake Workspace - Slack"
        window.minSize = NSSize(width: 560, height: 340)
        window.backgroundColor = SlackPalette.background
        window.appearance = NSAppearance(named: .darkAqua)
        window.isReleasedWhenClosed = false
        window.contentView = makeContent()
        window.center()

        for tile in tiles {
            tile.onClick = { [huddle] in huddle.toggleSpeaking(tile.participant) }
        }
        huddle.onParticipantChange = { [weak self] participant in
            guard let self, let tile = tiles.first(where: { $0.participant == participant }) else { return }
            tile.update(speaking: huddle.isSpeaking(participant), muted: huddle.isMuted(participant))
        }
        huddle.onLocalMuteChange = { [weak self] muted in
            self?.updateMicButton(muted: muted)
        }
        huddle.onStatusChange = { [weak self] status in
            self?.statusLabel.stringValue = status
        }
        statusLabel.stringValue = huddle.status
        updateMicButton(muted: huddle.isLocalMuted)
    }

    func show() {
        window.makeKeyAndOrderFront(nil)
        startClock()
    }

    /// Renders the window's contents to a PNG without screen-recording permission.
    func writeSnapshot(to path: String) throws {
        guard let view = window.contentView,
              let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds),
              let png = {
                  view.cacheDisplay(in: view.bounds, to: bitmap)
                  return bitmap.representation(using: .png, properties: [:])
              }()
        else { throw CocoaError(.fileWriteUnknown) }
        try png.write(to: URL(fileURLWithPath: path))
    }

    private func startClock() {
        let started = ContinuousClock.now
        clock = Task { [weak self] in
            while !Task.isCancelled {
                let elapsed = Int((ContinuousClock.now - started).components.seconds)
                self?.timerLabel.stringValue = String(format: "%02d:%02d", elapsed / 60, elapsed % 60)
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }

    // MARK: Layout + Slack AX Hierarchy

    private func makeContent() -> NSView {
        // AXWebArea -> AXGroup(p-view_contents--huddle) -> gallery + footer
        let webArea = DomAxContainerView(
            role: NSAccessibility.Role(rawValue: "AXWebArea"),
            title: window.title
        )
        webArea.wantsLayer = true
        webArea.layer?.backgroundColor = SlackPalette.background.cgColor

        let viewContents = DomAxContainerView(
            role: .group,
            classes: ["p-view_contents", "p-view_contents--primary", "p-view_contents--huddle"]
        )
        let contentContainer = DomAxContainerView(
            role: .group,
            classes: layoutMode == .compact
                ? [
                    "p-huddle_window__content_container",
                    "p-huddle_window__content_container--compact_mode",
                ]
                : [
                    "p-huddle_window__content_container",
                    "p-huddle_window__content_container--full_mode",
                ]
        )
        let header = makeHeader()
        let gallery = makeGallery()
        let footer = makeFooter()

        pinFull(viewContents, inside: webArea)
        pinFull(contentContainer, inside: viewContents)

        for v in [header, gallery, footer] {
            v.translatesAutoresizingMaskIntoConstraints = false
            contentContainer.addSubview(v)
        }
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: contentContainer.topAnchor),
            header.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 40),

            footer.bottomAnchor.constraint(equalTo: contentContainer.bottomAnchor),
            footer.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
            footer.heightAnchor.constraint(equalToConstant: 64),

            gallery.topAnchor.constraint(equalTo: header.bottomAnchor),
            gallery.bottomAnchor.constraint(equalTo: footer.topAnchor),
            gallery.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
            gallery.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
        ])

        return webArea
    }

    private func makeHeader() -> NSView {
        let bar = DomAxContainerView(
            role: .toolbar,
            description: "Header",
            classes: ["p-huddle_compact_header"]
        )
        bar.wantsLayer = true
        bar.layer?.backgroundColor = SlackPalette.header.cgColor

        let badge = NSTextField(labelWithString: "Huddle · \(channelName)")
        badge.font = .systemFont(ofSize: 13, weight: .semibold)
        badge.textColor = .white
        badge.setAccessibilityElement(false)

        statusLabel.font = .systemFont(ofSize: 12)
        statusLabel.textColor = NSColor.white.withAlphaComponent(0.65)
        statusLabel.lineBreakMode = .byTruncatingTail
        statusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        statusLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
        statusLabel.setAccessibilityElement(false)

        timerLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        timerLabel.textColor = SlackPalette.green
        timerLabel.setAccessibilityElement(false)

        let stack = NSStackView(views: [badge, statusLabel, timerLabel])
        stack.orientation = .horizontal
        stack.distribution = .fill
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            stack.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
        ])
        return bar
    }

    private func makeGallery() -> NSView {
        let gallery = DomAxContainerView(
            role: .group,
            title: "Gallery",
            description: "Gallery",
            classes: layoutMode == .compact
                ? ["p-huddle_window_content"]
                : ["p-huddle_window_content", "p-huddle_window_content--expanded-view"]
        )
        let table = DomAxContainerView(
            role: .table,
            classes: ["p-huddle_grid_component"]
        )
        let grid = HuddleGridView(tiles: tiles)
        pinFull(table, inside: gallery)
        pinFull(grid, inside: table)
        return gallery
    }

    private func makeFooter() -> NSView {
        let footer = DomAxContainerView(
            role: .group,
            classes: layoutMode == .compact
                ? ["p-huddle_footer", "p-huddle_footer--compact_mode"]
                : ["footerTarget__vxx2n"]
        )
        footer.wantsLayer = true
        footer.layer?.backgroundColor = SlackPalette.surface.cgColor

        let toolbar = DomAxContainerView(
            role: .toolbar,
            title: "Huddles actions",
            description: "Huddles actions"
        )
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        footer.addSubview(toolbar)
        NSLayoutConstraint.activate([
            toolbar.centerXAnchor.constraint(equalTo: footer.centerXAnchor),
            toolbar.centerYAnchor.constraint(equalTo: footer.centerYAnchor),
            toolbar.heightAnchor.constraint(equalToConstant: 44),
        ])

        // Mic toggle (functional — matches Slack's "Mute microphone" / "Unmute microphone")
        configurePillButton(micButton, symbol: "mic.fill", target: self, action: #selector(toggleLocalMute))

        // Scenery buttons matching Slack's Huddles actions toolbar
        let camera = makeActionButton(
            description: "Turn on camera",
            symbol: "video.slash.fill",
            classes: ["c-button-unstyled", "button__Dv5Vp", "segmentedButtonMain__erfvC"]
        )
        let share = makeActionButton(
            description: "Share your screen",
            symbol: "rectangle.inset.filled.and.person.filled",
            role: .checkBox,
            classes: ["c-button-unstyled", "c-icon_button", "button__Dv5Vp"]
        )
        let hand = makeActionButton(
            description: "Raise hand",
            symbol: "hand.raised.fill",
            classes: ["c-button-unstyled", "button__Dv5Vp", "stickerButton__BfgQn"]
        )
        let reaction = makeActionButton(
            description: "Add reaction",
            symbol: "face.smiling",
            classes: ["c-button-unstyled", "button__Dv5Vp", "emojiButton__KGFo5"]
        )

        let leave = DomAxButton()
        leave.title = "Leave"
        leave.target = NSApp
        leave.action = #selector(NSApplication.terminate(_:))
        leave.isBordered = false
        leave.wantsLayer = true
        leave.layer?.backgroundColor = SlackPalette.danger.cgColor
        leave.layer?.cornerRadius = 8
        leave.attributedTitle = NSAttributedString(
            string: "Leave",
            attributes: [
                .foregroundColor: NSColor.white,
                .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
            ]
        )
        leave.axDescriptionText = "Leave Huddle"
        leave.domClasses = [
            "c-button-unstyled",
            "leaveButton__wzISw",
            "c-button",
            "c-button--medium",
            "c-button--danger",
        ]
        leave.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            leave.widthAnchor.constraint(equalToConstant: 76),
            leave.heightAnchor.constraint(equalToConstant: 36),
        ])

        let stack = NSStackView(views: [micButton, camera, share, hand, reaction, leave])
        stack.orientation = .horizontal
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        toolbar.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: toolbar.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: toolbar.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: toolbar.centerYAnchor),
        ])
        toolbar.customAccessibilityChildren = { [micButton, camera, share, hand, reaction, leave] in
            [micButton, camera, share, hand, reaction, leave]
        }

        return footer
    }

    private func makeActionButton(
        description: String,
        symbol: String,
        role: NSAccessibility.Role? = nil,
        classes: [String]
    ) -> DomAxButton {
        let button = DomAxButton()
        configurePillButton(button, symbol: symbol, target: nil, action: nil)
        button.axRoleOverride = role
        button.axDescriptionText = description
        button.domClasses = classes
        return button
    }

    private func configurePillButton(_ button: DomAxButton, symbol: String, target: AnyObject?, action: Selector?) {
        button.title = ""
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
        button.imagePosition = .imageOnly
        button.isBordered = false
        button.contentTintColor = .white
        button.target = target
        button.action = action
        button.wantsLayer = true
        button.layer?.backgroundColor = SlackPalette.buttonIdle.cgColor
        button.layer?.cornerRadius = 8
        button.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: 40),
            button.heightAnchor.constraint(equalToConstant: 36),
        ])
    }

    private func updateMicButton(muted: Bool) {
        if muted {
            micButton.axDescriptionText = "Unmute microphone"
            micButton.domClasses = [
                "c-button-unstyled",
                "button__Dv5Vp",
                "segmentedButtonMain__erfvC",
            ]
            micButton.image = NSImage(systemSymbolName: "mic.slash.fill", accessibilityDescription: nil)
            micButton.layer?.backgroundColor = SlackPalette.buttonIdle.cgColor
        } else {
            micButton.axDescriptionText = "Mute microphone"
            micButton.domClasses = [
                "c-button-unstyled",
                "button__Dv5Vp",
                "segmentedButtonMain__erfvC",
                "buttonToggledOn__Kuvfg",
            ]
            micButton.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: nil)
            micButton.layer?.backgroundColor = SlackPalette.green.cgColor
        }
        NSAccessibility.post(element: micButton, notification: .titleChanged)
    }

    @objc private func toggleLocalMute() {
        huddle.toggleLocalMute()
    }

    private func pinFull(_ child: NSView, inside parent: NSView) {
        child.translatesAutoresizingMaskIntoConstraints = false
        parent.addSubview(child)
        NSLayoutConstraint.activate([
            child.topAnchor.constraint(equalTo: parent.topAnchor),
            child.bottomAnchor.constraint(equalTo: parent.bottomAnchor),
            child.leadingAnchor.constraint(equalTo: parent.leadingAnchor),
            child.trailingAnchor.constraint(equalTo: parent.trailingAnchor),
        ])
    }
}
