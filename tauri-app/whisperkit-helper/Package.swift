// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "whisperkit-helper",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "whisperkit-bridge", targets: ["WhisperkitBridge"]),
    ],
    dependencies: [
        .package(url: "https://github.com/argmaxinc/argmax-oss-swift.git", branch: "main"),
    ],
    targets: [
        .target(name: "WhisperkitCore"),
        .executableTarget(
            name: "WhisperkitBridge",
            dependencies: [
                "WhisperkitCore",
                .product(name: "WhisperKit", package: "argmax-oss-swift"),
            ]
        ),
        .testTarget(
            name: "WhisperkitCoreTests",
            dependencies: ["WhisperkitCore"]
        ),
    ]
)
