// swift-tools-version: 5.9
// GridStreamer macOS Client — Swift Package Manager manifest

import PackageDescription

let package = Package(
    name: "GridStreamer",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "GridStreamer",
            targets: ["GridStreamer"]
        ),
    ],
    targets: [
        .executableTarget(
            name: "GridStreamer",
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
