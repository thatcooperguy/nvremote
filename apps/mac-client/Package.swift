// swift-tools-version: 5.9
// CrazyStream macOS Client — Swift Package Manager manifest

import PackageDescription

let package = Package(
    name: "CrazyStream",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "CrazyStream",
            targets: ["CrazyStream"]
        ),
    ],
    targets: [
        .executableTarget(
            name: "CrazyStream",
            path: "Sources",
            resources: [
                .process("../Resources")
            ],
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency")
            ],
            linkerSettings: [
                .linkedFramework("Metal"),
                .linkedFramework("MetalKit"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("VideoToolbox"),
                .linkedFramework("CoreMedia"),
                .linkedFramework("CoreVideo"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("GameController"),
                .linkedFramework("Network"),
                .linkedFramework("Security"),
                .linkedFramework("AuthenticationServices"),
                .linkedFramework("IOSurface"),
                .linkedFramework("Accelerate"),
            ]
        ),
    ]
)
