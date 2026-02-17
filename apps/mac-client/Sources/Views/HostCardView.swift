// HostCardView.swift — Individual host card
// NVRemote macOS Client

import SwiftUI

/// A card displaying information about a single available streaming host.
struct HostCardView: View {
    let host: HostInfo
    let isSelected: Bool
    let onConnect: () -> Void

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 16) {
            // GPU icon
            VStack {
                Image(systemName: "desktopcomputer")
                    .font(.system(size: 28))
                    .foregroundColor(host.isOnline ? CSColors.nvidiaGreen : CSColors.textMuted)
            }
            .frame(width: 50, height: 50)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(host.isOnline ? CSColors.nvidiaGreen.opacity(0.1) : CSColors.surface)
            )

            // Host details
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(host.name)
                        .font(CSTypography.title3)
                        .foregroundColor(CSColors.textPrimary)

                    Spacer()

                    StatusBadge(status: host.isOnline ? .online : .offline)
                }

                HStack(spacing: 12) {
                    Label(host.gpuName, systemImage: "gpu")
                        .font(CSTypography.caption)
                        .foregroundColor(CSColors.textSecondary)

                    if let game = host.currentGame {
                        Label(game, systemImage: "gamecontroller")
                            .font(CSTypography.caption)
                            .foregroundColor(CSColors.textSecondary)
                    }
                }

                if host.isOnline {
                    HStack(spacing: 16) {
                        if let resolution = host.resolution {
                            Text(resolution)
                                .font(CSTypography.monoCaption)
                                .foregroundColor(CSColors.textMuted)
                        }
                        if let fps = host.fps {
                            Text("\(fps) FPS")
                                .font(CSTypography.monoCaption)
                                .foregroundColor(CSColors.textMuted)
                        }
                        if let latency = host.latencyMs {
                            Text("\(latency) ms")
                                .font(CSTypography.monoCaption)
                                .foregroundColor(latency < 20 ? CSColors.statusOnline : CSColors.statusWarning)
                        }
                    }
                }
            }

            // Connect button
            if host.isOnline {
                GlowButton("Connect", icon: "play.fill", style: isSelected ? .secondary : .primary) {
                    onConnect()
                }
            }
        }
        .padding(16)
        .csCard(isHovered: isHovered, isSelected: isSelected)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
    }
}
