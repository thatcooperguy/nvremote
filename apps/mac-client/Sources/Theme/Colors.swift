// Colors.swift — NVIDIA-inspired color palette for NVRemote
// NVRemote macOS Client

import SwiftUI

/// Centralized color definitions for the NVRemote dark theme.
/// All colors are NVIDIA-inspired with a very dark background and vivid green accents.
enum CSColors {
    // MARK: - Primary Brand Colors

    /// NVIDIA green — primary accent (#76B900)
    static let nvidiaGreen = Color(red: 0x76 / 255.0, green: 0xB9 / 255.0, blue: 0x00 / 255.0)

    /// Darker green for pressed/secondary states (#5A8F00)
    static let nvidiaGreenDark = Color(red: 0x5A / 255.0, green: 0x8F / 255.0, blue: 0x00 / 255.0)

    /// Lighter green for highlights and glow effects (#8ED200)
    static let nvidiaGreenLight = Color(red: 0x8E / 255.0, green: 0xD2 / 255.0, blue: 0x00 / 255.0)

    // MARK: - Background Colors

    /// App background — very dark (#050505)
    static let background = Color(red: 0x05 / 255.0, green: 0x05 / 255.0, blue: 0x05 / 255.0)

    /// Card / surface background (#0F0F0F)
    static let surface = Color(red: 0x0F / 255.0, green: 0x0F / 255.0, blue: 0x0F / 255.0)

    /// Elevated surface for modals and popovers (#1A1A1A)
    static let surfaceElevated = Color(red: 0x1A / 255.0, green: 0x1A / 255.0, blue: 0x1A / 255.0)

    /// Subtle hover state background (#141414)
    static let surfaceHover = Color(red: 0x14 / 255.0, green: 0x14 / 255.0, blue: 0x14 / 255.0)

    // MARK: - Border Colors

    /// Subtle card border (#1F1F1F)
    static let border = Color(red: 0x1F / 255.0, green: 0x1F / 255.0, blue: 0x1F / 255.0)

    /// Active / focused border (green)
    static let borderActive = nvidiaGreen.opacity(0.5)

    // MARK: - Text Colors

    /// Primary text — near white (#ECECEC)
    static let textPrimary = Color(red: 0xEC / 255.0, green: 0xEC / 255.0, blue: 0xEC / 255.0)

    /// Secondary text — gray (#8A8A8A)
    static let textSecondary = Color(red: 0x8A / 255.0, green: 0x8A / 255.0, blue: 0x8A / 255.0)

    /// Muted text — darker gray (#555555)
    static let textMuted = Color(red: 0x55 / 255.0, green: 0x55 / 255.0, blue: 0x55 / 255.0)

    // MARK: - Status Colors

    /// Online / connected / healthy
    static let statusOnline = nvidiaGreen

    /// Warning / degraded
    static let statusWarning = Color(red: 0xFF / 255.0, green: 0xA5 / 255.0, blue: 0x00 / 255.0)

    /// Error / disconnected / critical
    static let statusError = Color(red: 0xFF / 255.0, green: 0x35 / 255.0, blue: 0x35 / 255.0)

    /// Offline / idle
    static let statusOffline = Color(red: 0x55 / 255.0, green: 0x55 / 255.0, blue: 0x55 / 255.0)

    // MARK: - Glow Effects

    /// Green glow shadow color for active elements
    static let glowGreen = nvidiaGreen.opacity(0.6)

    /// Soft green glow for subtle hover states
    static let glowGreenSoft = nvidiaGreen.opacity(0.2)

    // MARK: - Gaming Mode Colors

    /// Competitive mode — electric blue
    static let modeCompetitive = Color(red: 0x00 / 255.0, green: 0xAA / 255.0, blue: 0xFF / 255.0)

    /// Balanced mode — NVIDIA green
    static let modeBalanced = nvidiaGreen

    /// Cinematic mode — warm gold
    static let modeCinematic = Color(red: 0xFF / 255.0, green: 0xD7 / 255.0, blue: 0x00 / 255.0)

    // MARK: - NSColor Bridges (for Metal/AppKit interop)

    /// NVIDIA green as NSColor for use in AppKit contexts.
    static var nvidiaGreenNS: NSColor {
        NSColor(red: 0x76 / 255.0, green: 0xB9 / 255.0, blue: 0x00 / 255.0, alpha: 1.0)
    }

    /// Background as NSColor.
    static var backgroundNS: NSColor {
        NSColor(red: 0x05 / 255.0, green: 0x05 / 255.0, blue: 0x05 / 255.0, alpha: 1.0)
    }
}

// MARK: - Color Extensions

extension Color {
    /// Create a Color from a hex integer (e.g. 0x76B900).
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(red: r, green: g, blue: b, opacity: opacity)
    }
}
