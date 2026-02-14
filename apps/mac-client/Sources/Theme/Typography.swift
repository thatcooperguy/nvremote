// Typography.swift — Font system for GridStreamer
// GridStreamer macOS Client

import SwiftUI

/// Centralized typography definitions. Uses SF Pro (system font) for UI text
/// and SF Mono for numeric stats and technical information.
enum CSTypography {
    // MARK: - Display / Heading Fonts

    /// Large title — used for the app name and splash
    static let largeTitle = Font.system(size: 32, weight: .bold, design: .default)

    /// Section title — used for view headers
    static let title = Font.system(size: 24, weight: .semibold, design: .default)

    /// Subsection title
    static let title2 = Font.system(size: 20, weight: .semibold, design: .default)

    /// Card title or item label
    static let title3 = Font.system(size: 17, weight: .medium, design: .default)

    // MARK: - Body Text

    /// Standard body text
    static let body = Font.system(size: 14, weight: .regular, design: .default)

    /// Emphasized body text
    static let bodyBold = Font.system(size: 14, weight: .semibold, design: .default)

    /// Smaller secondary text
    static let callout = Font.system(size: 13, weight: .regular, design: .default)

    /// Small labels and captions
    static let caption = Font.system(size: 11, weight: .regular, design: .default)

    /// Tiny text for fine print
    static let caption2 = Font.system(size: 10, weight: .regular, design: .default)

    // MARK: - Monospaced (for stats and technical info)

    /// Large stat number (e.g., FPS counter in overlay)
    static let statLarge = Font.system(size: 28, weight: .bold, design: .monospaced)

    /// Medium stat number (e.g., latency display)
    static let statMedium = Font.system(size: 18, weight: .semibold, design: .monospaced)

    /// Small stat value (e.g., inline metric)
    static let statSmall = Font.system(size: 13, weight: .medium, design: .monospaced)

    /// Tiny monospace for packet data / debug info
    static let mono = Font.system(size: 12, weight: .regular, design: .monospaced)

    /// Monospace caption
    static let monoCaption = Font.system(size: 10, weight: .regular, design: .monospaced)

    // MARK: - Button Fonts

    /// Primary button label
    static let buttonPrimary = Font.system(size: 15, weight: .semibold, design: .default)

    /// Secondary / smaller button label
    static let buttonSecondary = Font.system(size: 13, weight: .medium, design: .default)

    // MARK: - Gaming Mode Selector

    /// Gaming mode name
    static let modeName = Font.system(size: 16, weight: .bold, design: .default)

    /// Gaming mode description
    static let modeDescription = Font.system(size: 12, weight: .regular, design: .default)
}
