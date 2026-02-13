// GamingModeSelector.swift — Competitive/Balanced/Cinematic selector
// CrazyStream macOS Client

import SwiftUI

/// A three-option selector for choosing the gaming mode preset.
struct GamingModeSelector: View {
    @Binding var selectedMode: StreamSessionConfig.GamingMode

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Gaming Mode")
                .font(CSTypography.title3)
                .foregroundColor(CSColors.textPrimary)

            HStack(spacing: 12) {
                ForEach(StreamSessionConfig.GamingMode.allCases) { mode in
                    GamingModeCard(
                        mode: mode,
                        isSelected: selectedMode == mode,
                        onSelect: { selectedMode = mode }
                    )
                }
            }
        }
    }
}

/// Individual card within the gaming mode selector.
private struct GamingModeCard: View {
    let mode: StreamSessionConfig.GamingMode
    let isSelected: Bool
    let onSelect: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 8) {
                // Icon and name
                HStack {
                    Image(systemName: iconName)
                        .font(.system(size: 20))
                        .foregroundColor(isSelected ? accentColor : CSColors.textMuted)

                    Spacer()

                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(accentColor)
                    }
                }

                Text(mode.displayName)
                    .font(CSTypography.modeName)
                    .foregroundColor(isSelected ? CSColors.textPrimary : CSColors.textSecondary)

                Text(mode.description)
                    .font(CSTypography.modeDescription)
                    .foregroundColor(CSColors.textMuted)
                    .lineLimit(2)

                // Stats preview
                HStack(spacing: 8) {
                    ModeStatPill(label: targetLabel)
                    ModeStatPill(label: latencyLabel)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? accentColor.opacity(0.08) : CSColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? accentColor.opacity(0.5) : CSColors.border, lineWidth: isSelected ? 1.5 : 1)
            )
            .shadow(color: isSelected ? accentColor.opacity(0.2) : .clear, radius: isSelected ? 8 : 0)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
    }

    private var iconName: String {
        switch mode {
        case .competitive: return "bolt.fill"
        case .balanced:    return "scale.3d"
        case .cinematic:   return "film"
        }
    }

    private var accentColor: Color {
        switch mode {
        case .competitive: return CSColors.modeCompetitive
        case .balanced:    return CSColors.modeBalanced
        case .cinematic:   return CSColors.modeCinematic
        }
    }

    private var targetLabel: String {
        switch mode {
        case .competitive: return "240 FPS"
        case .balanced:    return "1440p@120"
        case .cinematic:   return "4K@60"
        }
    }

    private var latencyLabel: String {
        switch mode {
        case .competitive: return "1ms buffer"
        case .balanced:    return "4ms buffer"
        case .cinematic:   return "8ms buffer"
        }
    }
}

/// Small pill displaying a mode stat.
private struct ModeStatPill: View {
    let label: String

    var body: some View {
        Text(label)
            .font(CSTypography.monoCaption)
            .foregroundColor(CSColors.textMuted)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule()
                    .fill(CSColors.background)
            )
    }
}
