// LoginView.swift — Google Sign-In view
// NVRemote macOS Client

import SwiftUI

/// The login screen shown when the user is not authenticated.
/// Provides a Google Sign-In button with NVIDIA-themed styling.
struct LoginView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var showingError = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Logo and branding
            VStack(spacing: 16) {
                // App icon placeholder (green bolt)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 64))
                    .foregroundColor(CSColors.nvidiaGreen)
                    .shadow(color: CSColors.glowGreen, radius: 20)

                Text("NVRemote")
                    .font(CSTypography.largeTitle)
                    .foregroundColor(CSColors.textPrimary)

                Text("Ultra-low latency game streaming")
                    .font(CSTypography.callout)
                    .foregroundColor(CSColors.textSecondary)
            }

            Spacer()
                .frame(height: 60)

            // Sign in section
            VStack(spacing: 20) {
                Text("Sign in to connect to your hosts")
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textSecondary)

                Button(action: { authManager.signIn() }) {
                    HStack(spacing: 12) {
                        // Google "G" icon placeholder
                        Image(systemName: "g.circle.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.white)

                        Text("Sign in with Google")
                            .font(CSTypography.buttonPrimary)
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 32)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(CSColors.nvidiaGreen)
                    )
                    .shadow(color: CSColors.glowGreen, radius: 10)
                }
                .buttonStyle(.plain)
                .disabled(authManager.isLoading)

                if authManager.isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .scaleEffect(0.8)
                        .tint(CSColors.nvidiaGreen)
                }

                if let error = authManager.errorMessage {
                    Text(error)
                        .font(CSTypography.caption)
                        .foregroundColor(CSColors.statusError)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
            }

            Spacer()

            // Footer
            Text("v1.0.0")
                .font(CSTypography.caption2)
                .foregroundColor(CSColors.textMuted)
                .padding(.bottom, 20)
        }
        .frame(minWidth: 500, minHeight: 400)
        .csBackground()
    }
}
