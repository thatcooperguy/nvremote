// Styles.swift — Reusable SwiftUI view modifiers and button styles
// NVRemote macOS Client

import SwiftUI

// MARK: - Card Modifier

/// Applies the standard NVRemote card appearance: dark surface, rounded corners, subtle border.
struct CSCardModifier: ViewModifier {
    var isHovered: Bool = false
    var isSelected: Bool = false

    func body(content: Content) -> some View {
        content
            .background(isHovered ? CSColors.surfaceHover : CSColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? CSColors.borderActive : CSColors.border, lineWidth: 1)
            )
            .shadow(
                color: isSelected ? CSColors.glowGreenSoft : .clear,
                radius: isSelected ? 8 : 0
            )
    }
}

extension View {
    /// Apply the standard NVRemote card style.
    func csCard(isHovered: Bool = false, isSelected: Bool = false) -> some View {
        modifier(CSCardModifier(isHovered: isHovered, isSelected: isSelected))
    }

    /// Apply a green glow shadow to this view.
    func csGlow(radius: CGFloat = 10, isActive: Bool = true) -> some View {
        shadow(color: isActive ? CSColors.glowGreen : .clear, radius: isActive ? radius : 0)
    }

    /// Apply the standard background to a full-screen view.
    func csBackground() -> some View {
        background(CSColors.background)
    }
}

// MARK: - Primary Button Style

/// NVIDIA green filled button with glow effect on hover.
struct CSPrimaryButtonStyle: ButtonStyle {
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CSTypography.buttonPrimary)
            .foregroundColor(configuration.isPressed ? .white.opacity(0.8) : .white)
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(configuration.isPressed ? CSColors.nvidiaGreenDark : CSColors.nvidiaGreen)
            )
            .shadow(
                color: isHovered ? CSColors.glowGreen : .clear,
                radius: isHovered ? 12 : 0
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
            .onHover { hovering in
                isHovered = hovering
            }
    }
}

// MARK: - Secondary Button Style

/// Outlined button with green border and text.
struct CSSecondaryButtonStyle: ButtonStyle {
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CSTypography.buttonSecondary)
            .foregroundColor(isHovered ? .white : CSColors.nvidiaGreen)
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isHovered ? CSColors.nvidiaGreen.opacity(0.15) : .clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(CSColors.nvidiaGreen.opacity(configuration.isPressed ? 0.5 : 1.0), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
            .onHover { hovering in
                isHovered = hovering
            }
    }
}

// MARK: - Ghost Button Style

/// Minimal button with no border, just tinted text.
struct CSGhostButtonStyle: ButtonStyle {
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CSTypography.buttonSecondary)
            .foregroundColor(isHovered ? CSColors.nvidiaGreen : CSColors.textSecondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isHovered ? CSColors.nvidiaGreen.opacity(0.08) : .clear)
            )
            .animation(.easeInOut(duration: 0.15), value: isHovered)
            .onHover { hovering in
                isHovered = hovering
            }
    }
}

// MARK: - Text Field Style

/// Dark text field with subtle border that glows green on focus.
struct CSTextFieldStyle: TextFieldStyle {
    @FocusState private var isFocused: Bool

    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .textFieldStyle(.plain)
            .font(CSTypography.body)
            .foregroundColor(CSColors.textPrimary)
            .padding(10)
            .background(CSColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isFocused ? CSColors.nvidiaGreen : CSColors.border, lineWidth: 1)
            )
            .focused($isFocused)
    }
}

// MARK: - Convenience Extensions

extension ButtonStyle where Self == CSPrimaryButtonStyle {
    static var csPrimary: CSPrimaryButtonStyle { CSPrimaryButtonStyle() }
}

extension ButtonStyle where Self == CSSecondaryButtonStyle {
    static var csSecondary: CSSecondaryButtonStyle { CSSecondaryButtonStyle() }
}

extension ButtonStyle where Self == CSGhostButtonStyle {
    static var csGhost: CSGhostButtonStyle { CSGhostButtonStyle() }
}

// MARK: - Animated Green Glow Border

/// A view modifier that animates a pulsing green glow border, used on active streaming indicators.
struct CSPulsingGlow: ViewModifier {
    let isActive: Bool
    @State private var glowOpacity: Double = 0.3

    func body(content: Content) -> some View {
        content
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(CSColors.nvidiaGreen.opacity(isActive ? glowOpacity : 0), lineWidth: 2)
            )
            .shadow(
                color: CSColors.nvidiaGreen.opacity(isActive ? glowOpacity * 0.5 : 0),
                radius: isActive ? 10 : 0
            )
            .onAppear {
                guard isActive else { return }
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    glowOpacity = 0.8
                }
            }
            .onChange(of: isActive) { _, active in
                if active {
                    withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                        glowOpacity = 0.8
                    }
                } else {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        glowOpacity = 0.0
                    }
                }
            }
    }
}

extension View {
    func csPulsingGlow(isActive: Bool) -> some View {
        modifier(CSPulsingGlow(isActive: isActive))
    }
}
