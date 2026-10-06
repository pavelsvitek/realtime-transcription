import AppKit
import FakeZoomCore

private enum Palette {
    static let background = NSColor(srgbRed: 0.11, green: 0.11, blue: 0.12, alpha: 1)
    static let bar = NSColor(srgbRed: 0.14, green: 0.14, blue: 0.15, alpha: 1)
    static let panel = NSColor(srgbRed: 0.15, green: 0.15, blue: 0.16, alpha: 1)
}

/// Lays the tiles out in a grid, centring an incomplete last row.
@MainActor
private final class TileGridView: NSView {
    private let tiles: [TileView]
    private let padding: CGFloat = 12
    private let gap: CGFloat = 8

    init(tiles: [TileView]) {
        self.tiles = tiles
        super.init(frame: .zero)
        tiles.forEach(addSubview)
    }

    required init?(coder: NSCoder) {
        fatalError("not used")
    }

    override var isFlipped: Bool { true }

    private var columns: Int {
        tiles.count <= 4 ? 2 : 3
    }

    override func layout() {
        super.layout()
        let columns = self.columns
        let rows = (tiles.count + columns - 1) / columns
        let cellWidth = (bounds.width - padding * 2 - gap * CGFloat(columns - 1)) / CGFloat(columns)
        let cellHeight = (bounds.height - padding * 2 - gap * CGFloat(rows - 1)) / CGFloat(rows)

        for (index, tile) in tiles.enumerated() {
            let row = index / columns
            let inRow = min(columns, tiles.count - row * columns)
            let rowWidth = CGFloat(inRow) * cellWidth + CGFloat(inRow - 1) * gap
            let originX = (bounds.width - rowWidth) / 2
            tile.frame = NSRect(
                x: originX + CGFloat(index % columns) * (cellWidth + gap),
                y: padding + CGFloat(row) * (cellHeight + gap),
                width: max(cellWidth, 0),
                height: max(cellHeight, 0)
            )
        }
    }
}

/// The roster Zoom shows beside the tiles. Only names: it is not a speaking
/// signal, and Amie must not take it for one.
@MainActor
private final class ParticipantsPanel: NSView {
    static let width: CGFloat = 260

    init(participants: [Participant]) {
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = Palette.panel.cgColor

        let header = NSTextField(labelWithString: "Participants (\(participants.count))")
        header.font = .systemFont(ofSize: 14, weight: .semibold)
        header.textColor = .white

        let rows = participants.map { person -> NSTextField in
            let row = NSTextField(labelWithString: person.name)
            row.font = .systemFont(ofSize: 13)
            row.textColor = NSColor.white.withAlphaComponent(0.85)
            return row
        }
        let stack = NSStackView(views: [header] + rows)
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -16),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("not used")
    }

    override var isFlipped: Bool { true }
}

/// Tiles, with the participants panel on the right when it is open.
@MainActor
private final class StageView: NSView {
    private let grid: TileGridView
    private let panel: ParticipantsPanel
    var isPanelVisible = false {
        didSet {
            panel.isHidden = !isPanelVisible
            needsLayout = true
        }
    }

    init(tiles: [TileView], participants: [Participant]) {
        grid = TileGridView(tiles: tiles)
        panel = ParticipantsPanel(participants: participants)
        super.init(frame: .zero)
        panel.isHidden = true
        addSubview(grid)
        addSubview(panel)
    }

    required init?(coder: NSCoder) {
        fatalError("not used")
    }

    override func layout() {
        super.layout()
        let panelWidth = isPanelVisible ? ParticipantsPanel.width : 0
        grid.frame = NSRect(x: 0, y: 0, width: bounds.width - panelWidth, height: bounds.height)
        panel.frame = NSRect(x: bounds.width - panelWidth, y: 0, width: panelWidth, height: bounds.height)
    }
}

@MainActor
final class CallWindowController: NSObject {
    let window: NSWindow
    private let call: CallModel
    private let tiles: [TileView]
    private let stage: StageView
    private let statusLabel = NSTextField(labelWithString: "")
    private let timerLabel = NSTextField(labelWithString: "00:00")
    private var clock: Task<Void, Never>?

    init(call: CallModel, showRoster: Bool) {
        self.call = call
        tiles = call.participants.enumerated().map { index, person in
            TileView(participant: person, colorIndex: index)
        }
        stage = StageView(tiles: tiles, participants: call.participants)
        stage.isPanelVisible = showRoster
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1040, height: 660),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        super.init()

        window.title = "Zoom Meeting"
        window.minSize = NSSize(width: 720, height: 480)
        window.backgroundColor = Palette.background
        window.appearance = NSAppearance(named: .darkAqua)
        window.isReleasedWhenClosed = false
        window.contentView = makeContent()
        window.center()

        for tile in tiles {
            tile.onClick = { [call] in call.toggle(tile.participant) }
        }
        call.onSpeakingChange = { [weak self] participant in
            guard let self, let tile = tiles.first(where: { $0.participant == participant }) else { return }
            tile.setSpeaking(call.isSpeaking(participant))
        }
        call.onStatusChange = { [weak self] status in self?.statusLabel.stringValue = status }
        statusLabel.stringValue = call.status
    }

    func show() {
        window.makeKeyAndOrderFront(nil)
        startClock()
    }

    /// Renders the window's contents to a PNG without a screen-recording
    /// permission, by asking the views to draw themselves.
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

    // MARK: Layout

    private func makeContent() -> NSView {
        let content = NSView()
        content.wantsLayer = true
        // Set here, not only on the window, so a snapshot of the view matches.
        content.layer?.backgroundColor = Palette.background.cgColor

        let top = makeTopBar()
        let bottom = makeControlBar()
        for view in [top, stage, bottom] {
            view.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(view)
        }
        NSLayoutConstraint.activate([
            top.topAnchor.constraint(equalTo: content.topAnchor),
            top.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            top.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            top.heightAnchor.constraint(equalToConstant: 44),

            bottom.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            bottom.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            bottom.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            bottom.heightAnchor.constraint(equalToConstant: 76),

            stage.topAnchor.constraint(equalTo: top.bottomAnchor),
            stage.bottomAnchor.constraint(equalTo: bottom.topAnchor),
            stage.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            stage.trailingAnchor.constraint(equalTo: content.trailingAnchor),
        ])
        return content
    }

    private func makeTopBar() -> NSView {
        let bar = NSView()
        bar.wantsLayer = true
        bar.layer?.backgroundColor = Palette.bar.cgColor

        let title = NSTextField(labelWithString: "Zoom Meeting")
        title.font = .systemFont(ofSize: 14, weight: .semibold)
        title.textColor = .white

        statusLabel.font = .systemFont(ofSize: 12)
        statusLabel.textColor = NSColor.white.withAlphaComponent(0.65)
        statusLabel.lineBreakMode = .byTruncatingTail
        statusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        timerLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .regular)
        timerLabel.textColor = NSColor.white.withAlphaComponent(0.85)

        statusLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let stack = NSStackView(views: [title, statusLabel, timerLabel])
        stack.orientation = .horizontal
        stack.distribution = .fill
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            stack.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
        ])
        return bar
    }

    private func makeControlBar() -> NSView {
        let bar = NSView()
        bar.wantsLayer = true
        bar.layer?.backgroundColor = Palette.bar.cgColor

        // Only Participants and Leave do anything; the rest are scenery.
        let buttons: [NSView] = [
            controlButton("Mute", symbol: "mic.fill", action: nil),
            controlButton("Stop Video", symbol: "video.fill", action: nil),
            controlButton("Participants", symbol: "person.2.fill", action: #selector(toggleParticipants)),
            controlButton("Chat", symbol: "bubble.left.fill", action: nil),
            controlButton("Share Screen", symbol: "arrow.up.square.fill", action: nil),
            controlButton("Reactions", symbol: "face.smiling", action: nil),
        ]
        let controls = NSStackView(views: buttons)
        controls.orientation = .horizontal
        controls.spacing = 28
        controls.translatesAutoresizingMaskIntoConstraints = false

        let leave = NSButton(title: "Leave", target: NSApp, action: #selector(NSApplication.terminate(_:)))
        leave.bezelStyle = .rounded
        leave.bezelColor = .systemRed
        leave.contentTintColor = .white
        leave.translatesAutoresizingMaskIntoConstraints = false

        bar.addSubview(controls)
        bar.addSubview(leave)
        NSLayoutConstraint.activate([
            controls.centerXAnchor.constraint(equalTo: bar.centerXAnchor),
            controls.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            leave.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -20),
            leave.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
        ])
        return bar
    }

    private func controlButton(_ title: String, symbol: String, action: Selector?) -> NSButton {
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: title)
        let button = NSButton(title: title, image: image ?? NSImage(), target: action == nil ? nil : self, action: action)
        button.imagePosition = .imageAbove
        button.isBordered = false
        button.contentTintColor = .white
        button.attributedTitle = NSAttributedString(
            string: title,
            attributes: [
                .foregroundColor: NSColor.white.withAlphaComponent(0.85),
                .font: NSFont.systemFont(ofSize: 11),
            ]
        )
        return button
    }

    @objc private func toggleParticipants() {
        stage.isPanelVisible.toggle()
    }
}
