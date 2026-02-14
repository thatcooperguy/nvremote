// StatCard.swift — Latency/FPS/bitrate stat display card
// GridStreamer macOS Client

import SwiftUI

/// A compact card displaying a single streaming statistic with label and value.
struct StatCard: View {
    let label: String
    let value: String
    let unit: String
    let icon: String
    let quality: StatQuality

    enum StatQuality {
        case good
        case warning
        case bad
        case neutral

        var color: Color {
            switch self {
            case .good:    return CSColors.statusOnline
            case .warning: return CSColors.statusWarning
            case .bad:     return CSColors.statusError
            case .neutral: return CSColors.textSecondary
            }
        }
    }

    init(
        label: String,
        value: String,
        unit: String = "",
        icon: String = "",
        quality: StatQuality = .neutral
    ) {
        self.label = label
        self.value = value
        self.unit = unit
        self.icon = icon
        self.quality = quality
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Label row
            HStack(spacing: 4) {
                if !icon.isEmpty {
                    Image(systemName: icon)
                        .font(.system(size: 10))
                        .foregroundColor(CSColors.textMuted)
                }
                Text(label)
                    .font(CSTypography.caption)
                    .foregroundColor(CSColors.textMuted)
            }

            // Value row
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(CSTypography.statMedium)
                    .foregroundColor(quality.color)

                if !unit.isEmpty {
                    Text(unit)
                        .font(CSTypography.caption)
                        .foregroundColor(CSColors.textMuted)
                }
            }
        }
        .padding(12)
        .frame(minWidth: 90)
        .background(CSColors.surface.opacity(0.8))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(quality.color.opacity(0.2), lineWidth: 0.5)
        )
    }
}

// MARK: - Convenience Initializers

extension StatCard {
    /// Create a stat card for FPS display.
    static func fps(_ value: Double) -> StatCard {
        let quality: StatQuality
        if value >= 110 { quality = .good }
        else if value >= 55 { quality = .warning }
        else { quality = .bad }

        return StatCard(
            label: "FPS",
            value: String(format: "%.0f", value),
            icon: "gauge.high",
            quality: quality
        )
    }

    /// Create a stat card for latency display.
    static func latency(_ ms: Double) -> StatCard {
        let quality: StatQuality
        if ms < 10 { quality = .good }
        else if ms < 30 { quality = .warning }
        else { quality = .bad }

        return StatCard(
            label: "Latency",
            value: String(format: "%.1f", ms),
            unit: "ms",
            icon: "clock.arrow.circlepath",
            quality: quality
        )
    }

    /// Create a stat card for bitrate display.
    static func bitrate(_ kbps: Double) -> StatCard {
        let displayValue: String
        let displayUnit: String
        if kbps >= 1000 {
            displayValue = String(format: "%.1f", kbps / 1000.0)
            displayUnit = "Mbps"
        } else {
            displayValue = String(format: "%.0f", kbps)
            displayUnit = "kbps"
        }

        return StatCard(
            label: "Bitrate",
            value: displayValue,
            unit: displayUnit,
            icon: "arrow.up.arrow.down",
            quality: .neutral
        )
    }

    /// Create a stat card for packet loss display.
    static func packetLoss(_ ratio: Double) -> StatCard {
        let percent = ratio * 100.0
        let quality: StatQuality
        if percent < 0.5 { quality = .good }
        else if percent < 2.0 { quality = .warning }
        else { quality = .bad }

        return StatCard(
            label: "Loss",
            value: String(format: "%.2f", percent),
            unit: "%",
            icon: "exclamationmark.triangle",
            quality: quality
        )
    }
}
