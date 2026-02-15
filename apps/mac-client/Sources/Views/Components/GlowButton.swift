// GlowButton.swift — NVIDIA-themed button with glow effect
// NVRemote macOS Client

import SwiftUI

/// An NVIDIA-themed button with a green glow effect on hover and active states.
struct GlowButton: View {
    let title: String
    let icon: String?
    let style: GlowButtonStyle
    let action: () -> Void

    @State private var isHovered = false

    enum GlowButtonStyle {
        case primary     // Filled green
        case secondary   // Outlined green
        case danger      // Filled red
        case ghost       // Text-only
    }

    init(_ title: String, icon: String? = nil, style: GlowButtonStyle = .primary, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.style = style
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 14, weight: .medium))
                }
                Text(title)
                    .font(CSTypography.buttonPrimary)
            }
            .foregroundColor(foregroundColor)
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            .background(backgroundView)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(borderView)
            .shadow(color: glowColor, radius: isHovered ? 12 : 0)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
    }

    private var foregroundColor: Color {
        switch style {
        case .primary: return .white
        case .secondary: return isHovered ? .white : CSColors.nvidiaGreen
        case .danger: return .white
        case .ghost: return isHovered ? CSColors.nvidiaGreen : CSColors.textSecondary
        }
    }

    @ViewBuilder
    private var backgroundView: some View {
        switch style {
        case .primary:
            RoundedRectangle(cornerRadius: 8)
                .fill(isHovered ? CSColors.nvidiaGreenLight : CSColors.nvidiaGreen)
        case .secondary:
            RoundedRectangle(cornerRadius: 8)
                .fill(isHovered ? CSColors.nvidiaGreen.opacity(0.15) : Color.clear)
        case .danger:
            RoundedRectangle(cornerRadius: 8)
                .fill(isHovered ? CSColors.statusError.opacity(0.9) : CSColors.statusError)
        case .ghost:
            RoundedRectangle(cornerRadius: 8)
                .fill(isHovered ? CSColors.nvidiaGreen.opacity(0.08) : Color.clear)
        }
    }

    @ViewBuilder
    private var borderView: some View {
        switch style {
        case .primary, .danger, .ghost:
            EmptyView()
        case .secondary:
            RoundedRectangle(cornerRadius: 8)
                .stroke(CSColors.nvidiaGreen, lineWidth: 1)
        }
    }

    private var glowColor: Color {
        switch style {
        case .primary, .secondary: return CSColors.glowGreen
        case .danger: return CSColors.statusError.opacity(0.5)
        case .ghost: return .clear
        }
    }
}
