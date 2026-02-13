// StatusBadge.swift — Online/offline/streaming status badge
// CrazyStream macOS Client

import SwiftUI

/// A small pill-shaped badge indicating a host's current status.
struct StatusBadge: View {
    let status: HostStatus

    enum HostStatus: String, Sendable {
        case online    = "Online"
        case offline   = "Offline"
        case streaming = "Streaming"
        case busy      = "Busy"

        var color: Color {
            switch self {
            case .online:    return CSColors.statusOnline
            case .offline:   return CSColors.statusOffline
            case .streaming: return CSColors.modeCompetitive
            case .busy:      return CSColors.statusWarning
            }
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(status.color)
                .frame(width: 8, height: 8)
                .shadow(color: status.color.opacity(0.6), radius: status == .online ? 4 : 0)

            Text(status.rawValue)
                .font(CSTypography.caption)
                .foregroundColor(status.color)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(status.color.opacity(0.12))
        )
        .overlay(
            Capsule()
                .stroke(status.color.opacity(0.25), lineWidth: 0.5)
        )
    }
}
