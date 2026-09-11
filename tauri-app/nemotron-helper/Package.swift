// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "nemotron-helper",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .executable(name: "nemotron-bridge", targets: ["NemotronBridge"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/soniqo/speech-swift.git",
            exact: "0.0.22"
        ),
    ],
    targets: [
        .target(name: "NemotronCore"),
        .executableTarget(
            name: "NemotronBridge",
            dependencies: [
                "NemotronCore",
                .product(name: "NemotronStreamingASR", package: "speech-swift"),
            ]
        ),
        .testTarget(
            name: "NemotronCoreTests",
            dependencies: ["NemotronCore"]
        ),
    ]
)
