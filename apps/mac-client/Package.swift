// swift-tools-version: 5.9
// NVRemote macOS Client — Swift Package Manager manifest

import PackageDescription

let package = Package(
    name: "NVRemote",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "NVRemote",
            targets: ["NVRemote"]
        ),
    ],
    targets: [
        .executableTarget(
            name: "NVRemote",
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
