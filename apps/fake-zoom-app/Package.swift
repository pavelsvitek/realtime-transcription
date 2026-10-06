// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "fake-zoom-app",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .executable(name: "FakeZoom", targets: ["FakeZoom"]),
    ],
    targets: [
        // Roster, command line, scenario files. No AppKit, so it is unit tested.
        .target(name: "FakeZoomCore"),
        .executableTarget(
            name: "FakeZoom",
            dependencies: ["FakeZoomCore"]
        ),
        .testTarget(
            name: "FakeZoomCoreTests",
            dependencies: ["FakeZoomCore"]
        ),
    ]
)
