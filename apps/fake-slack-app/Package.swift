// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "fake-slack-app",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .executable(name: "FakeSlack", targets: ["FakeSlack"]),
    ],
    targets: [
        // Roster, command line, scenario files, and Slack AX formatting.
        // No AppKit, so it is unit tested.
        .target(name: "FakeSlackCore"),
        .executableTarget(
            name: "FakeSlack",
            dependencies: ["FakeSlackCore"]
        ),
        .testTarget(
            name: "FakeSlackCoreTests",
            dependencies: ["FakeSlackCore"]
        ),
    ]
)
