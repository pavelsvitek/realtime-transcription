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
            url: "https://github.com/FluidInference/FluidAudio.git",
            exact: "0.18.4"
        ),
    ],
    targets: [
        .target(name: "NemotronCore"),
        .executableTarget(
            name: "NemotronBridge",
            dependencies: [
                "NemotronCore",
                .product(name: "FluidAudio", package: "FluidAudio"),
            ]
        ),
        .testTarget(
            name: "NemotronCoreTests",
            dependencies: ["NemotronCore"]
        ),
    ]
)
