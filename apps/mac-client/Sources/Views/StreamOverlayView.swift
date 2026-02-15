// StreamOverlayView.swift — Stats HUD overlay
// NVRemote macOS Client

import SwiftUI

/// A semi-transparent overlay displaying real-time streaming statistics.
/// Shown over the streaming view when toggled on.
struct StreamOverlayView: View {
    let stats: StreamStats

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                Spacer()
                overlayContent
            }
            Spacer()
        }
        .padding(16)
        .allowsHitTesting(false)
    }

    private var overlayContent: some View {
        VStack(alignment: .trailing, spacing: 8) {
            // Title bar
            HStack(spacing: 8) {
                Circle()
                    .fill(CSColors.nvidiaGreen)
                    .frame(width: 6, height: 6)
                Text("NVRemote")
                    .font(CSTypography.caption)
                    .foregroundColor(CSColors.nvidiaGreen)
            }

            // Primary stats row
            HStack(spacing: 8) {
                StatCard.fps(stats.fps)
                StatCard.latency(stats.decodeTimeMs + stats.renderTimeMs)
                StatCard.bitrate(stats.bitrateKbps)
                StatCard.packetLoss(stats.packetLoss)
            }

            // Secondary stats
            HStack(spacing: 16) {
                statLabel("Codec", value: stats.codec.isEmpty ? "N/A" : stats.codec)
                statLabel("Res", value: stats.resolutionString)
                statLabel("Decode", value: String(format: "%.1fms", stats.decodeTimeMs))
                statLabel("Render", value: String(format: "%.1fms", stats.renderTimeMs))
                statLabel("Jitter", value: String(format: "%.1fms", stats.jitterMs))
                statLabel("Decoded", value: "\(stats.framesDecoded)")
                statLabel("Dropped", value: "\(stats.framesDropped)")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(CSColors.surface.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 6))

            // Connection type
            HStack(spacing: 8) {
                Image(systemName: stats.connectionType == "p2p" ? "point.3.connected.trianglepath.dotted" : "server.rack")
                    .font(.system(size: 10))
                Text(stats.connectionType.uppercased())
                    .font(CSTypography.monoCaption)
                Text("\(stats.packetsReceived) pkts")
                    .font(CSTypography.monoCaption)
            }
            .foregroundColor(CSColors.textMuted)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(CSColors.surface.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
    }

    /// Small label + value pair for the secondary stats row.
    private func statLabel(_ label: String, value: String) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(CSTypography.monoCaption)
                .foregroundColor(CSColors.textMuted)
            Text(value)
                .font(CSTypography.monoCaption)
                .foregroundColor(CSColors.textSecondary)
        }
    }
}
