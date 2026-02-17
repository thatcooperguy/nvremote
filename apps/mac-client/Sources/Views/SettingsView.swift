// SettingsView.swift — App settings
// NVRemote macOS Client

import SwiftUI

/// Application settings view with video, audio, network, and input configuration.
struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var preferredCodec: String = "h265"
    @State private var maxBitrateMbps: Double = 50.0
    @State private var enableHardwareDecode: Bool = true
    @State private var enableDTLS: Bool = true
    @State private var audioVolume: Double = 1.0
    @State private var showStatsOverlay: Bool = false
    @State private var selectedStunServer: String = "stun.l.google.com"
    @State private var signalingServerURL: String = "wss://signal.nvremote.com/ws"

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Settings")
                    .font(CSTypography.title)
                    .foregroundColor(CSColors.textPrimary)
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(.csPrimary)
            }
            .padding(24)

            Divider()
                .background(CSColors.border)

            ScrollView {
                VStack(spacing: 24) {
                    videoSection
                    audioSection
                    networkSection
                    inputSection
                    aboutSection
                }
                .padding(24)
            }
        }
        .frame(width: 600, minHeight: 500)
        .csBackground()
        .onAppear { loadSettings() }
        .onDisappear { saveSettings() }
    }

    // MARK: - Video

    private var videoSection: some View {
        SettingsSection(title: "Video", icon: "play.rectangle") {
            // Preferred codec
            HStack {
                Text("Preferred Codec")
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textPrimary)
                Spacer()
                Picker("", selection: $preferredCodec) {
                    Text("H.264 (AVC)").tag("h264")
                    Text("H.265 (HEVC)").tag("h265")
                    Text("AV1").tag("av1")
                }
                .frame(width: 160)
            }

            // Max bitrate
            HStack {
                Text("Max Bitrate")
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textPrimary)
                Spacer()
                Text(String(format: "%.0f Mbps", maxBitrateMbps))
                    .font(CSTypography.statSmall)
                    .foregroundColor(CSColors.nvidiaGreen)
                    .frame(width: 80, alignment: .trailing)
            }
            Slider(value: $maxBitrateMbps, in: 5...150, step: 5)
                .tint(CSColors.nvidiaGreen)

            // Hardware decode
            Toggle("Hardware Accelerated Decode", isOn: $enableHardwareDecode)
                .font(CSTypography.body)
                .foregroundColor(CSColors.textPrimary)
                .tint(CSColors.nvidiaGreen)
        }
    }

    // MARK: - Audio

    private var audioSection: some View {
        SettingsSection(title: "Audio", icon: "speaker.wave.2") {
            HStack {
                Text("Volume")
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textPrimary)
                Spacer()
                Text(String(format: "%.0f%%", audioVolume * 100))
                    .font(CSTypography.statSmall)
                    .foregroundColor(CSColors.textSecondary)
                    .frame(width: 50, alignment: .trailing)
            }
            Slider(value: $audioVolume, in: 0...1, step: 0.05)
                .tint(CSColors.nvidiaGreen)
        }
    }

    // MARK: - Network

    private var networkSection: some View {
        SettingsSection(title: "Network", icon: "network") {
            // DTLS encryption
            Toggle("DTLS Encryption", isOn: $enableDTLS)
                .font(CSTypography.body)
                .foregroundColor(CSColors.textPrimary)
                .tint(CSColors.nvidiaGreen)

            // STUN server
            HStack {
                Text("STUN Server")
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textPrimary)
                Spacer()
                TextField("", text: $selectedStunServer)
                    .textFieldStyle(.plain)
                    .font(CSTypography.mono)
                    .foregroundColor(CSColors.textSecondary)
                    .frame(width: 200)
                    .padding(6)
                    .background(CSColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            // Signaling server
            HStack {
                Text("Signaling Server")
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textPrimary)
                Spacer()
                TextField("", text: $signalingServerURL)
                    .textFieldStyle(.plain)
                    .font(CSTypography.mono)
                    .foregroundColor(CSColors.textSecondary)
                    .frame(width: 280)
                    .padding(6)
                    .background(CSColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            // Stats overlay
            Toggle("Show Stats Overlay on Connect", isOn: $showStatsOverlay)
                .font(CSTypography.body)
                .foregroundColor(CSColors.textPrimary)
                .tint(CSColors.nvidiaGreen)
        }
    }

    // MARK: - Input

    private var inputSection: some View {
        SettingsSection(title: "Input", icon: "keyboard") {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Cursor Lock Toggle")
                        .font(CSTypography.body)
                        .foregroundColor(CSColors.textPrimary)
                    Text("Press to release/capture the cursor during streaming")
                        .font(CSTypography.caption)
                        .foregroundColor(CSColors.textMuted)
                }
                Spacer()
                Text("Cmd+Shift+Esc")
                    .font(CSTypography.mono)
                    .foregroundColor(CSColors.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(CSColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Stats Overlay Toggle")
                        .font(CSTypography.body)
                        .foregroundColor(CSColors.textPrimary)
                    Text("Show or hide the performance overlay")
                        .font(CSTypography.caption)
                        .foregroundColor(CSColors.textMuted)
                }
                Spacer()
                Text("Tab")
                    .font(CSTypography.mono)
                    .foregroundColor(CSColors.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(CSColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        SettingsSection(title: "About", icon: "info.circle") {
            HStack {
                Text("Version")
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textPrimary)
                Spacer()
                Text("1.0.0")
                    .font(CSTypography.mono)
                    .foregroundColor(CSColors.textSecondary)
            }
            HStack {
                Text("Platform")
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textPrimary)
                Spacer()
                Text("macOS \(ProcessInfo.processInfo.operatingSystemVersionString)")
                    .font(CSTypography.mono)
                    .foregroundColor(CSColors.textSecondary)
            }
        }
    }

    // MARK: - Persistence

    private func loadSettings() {
        let defaults = UserDefaults.standard
        preferredCodec = defaults.string(forKey: "preferred_codec") ?? "h265"
        maxBitrateMbps = defaults.double(forKey: "max_bitrate_mbps").nonZero ?? 50.0
        enableHardwareDecode = defaults.bool(forKey: "hw_decode", default: true)
        enableDTLS = defaults.bool(forKey: "enable_dtls", default: true)
        audioVolume = defaults.double(forKey: "audio_volume").nonZero ?? 1.0
        showStatsOverlay = defaults.bool(forKey: "show_stats_overlay")
        selectedStunServer = defaults.string(forKey: "stun_server") ?? "stun.l.google.com"
        signalingServerURL = defaults.string(forKey: "signaling_url") ?? "wss://signal.nvremote.com/ws"
    }

    private func saveSettings() {
        let defaults = UserDefaults.standard
        defaults.set(preferredCodec, forKey: "preferred_codec")
        defaults.set(maxBitrateMbps, forKey: "max_bitrate_mbps")
        defaults.set(enableHardwareDecode, forKey: "hw_decode")
        defaults.set(enableDTLS, forKey: "enable_dtls")
        defaults.set(audioVolume, forKey: "audio_volume")
        defaults.set(showStatsOverlay, forKey: "show_stats_overlay")
        defaults.set(selectedStunServer, forKey: "stun_server")
        defaults.set(signalingServerURL, forKey: "signaling_url")
    }
}

// MARK: - Settings Section

/// Reusable section container for settings groups.
struct SettingsSection<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section header
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(CSColors.nvidiaGreen)
                Text(title)
                    .font(CSTypography.title3)
                    .foregroundColor(CSColors.textPrimary)
            }

            VStack(alignment: .leading, spacing: 12) {
                content
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(CSColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(CSColors.border, lineWidth: 1)
            )
        }
    }
}

// MARK: - Helpers

private extension Double {
    /// Returns nil if this value is zero (useful for UserDefaults which return 0 for missing keys).
    var nonZero: Double? {
        self == 0 ? nil : self
    }
}

private extension UserDefaults {
    func bool(forKey key: String, default defaultValue: Bool) -> Bool {
        object(forKey: key) != nil ? bool(forKey: key) : defaultValue
    }
}
