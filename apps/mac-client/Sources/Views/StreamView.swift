// StreamView.swift — Full-screen streaming view with Metal rendering
// CrazyStream macOS Client

import SwiftUI
import MetalKit

/// The full-screen streaming view that hosts the Metal rendering surface
/// and overlays for stats HUD and controls.
struct StreamView: View {
    @EnvironmentObject private var appState: AppState
    @ObservedObject var streamEngine: StreamEngine

    @State private var showControls = false
    @State private var controlsTimer: Timer?
    @State private var isFullScreen = false

    var body: some View {
        ZStack {
            // Metal rendering surface (full window)
            MetalViewRepresentable(streamEngine: streamEngine)
                .ignoresSafeArea()
                .onHover { _ in
                    showControlsBriefly()
                }

            // Stats overlay (top-right)
            if streamEngine.showOverlay {
                StreamOverlayView(stats: streamEngine.stats)
                    .transition(.opacity)
            }

            // Top controls bar (shown on hover)
            if showControls {
                VStack {
                    controlsBar
                        .transition(.move(edge: .top).combined(with: .opacity))
                    Spacer()
                }
            }

            // Connection state overlays
            connectionOverlay
        }
        .csBackground()
        .onAppear {
            // Start cursor capture when the stream view appears
            streamEngine.enableInput()
        }
        .onDisappear {
            streamEngine.disableInput()
        }
        .onKeyPress(.escape) {
            handleEscape()
            return .handled
        }
    }

    // MARK: - Controls Bar

    private var controlsBar: some View {
        HStack {
            // Back button
            Button(action: { appState.disconnect() }) {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.left")
                    Text("Disconnect")
                }
                .font(CSTypography.buttonSecondary)
                .foregroundColor(CSColors.textSecondary)
            }
            .buttonStyle(.plain)
            .padding(8)

            Spacer()

            // Stream info
            if let config = appState.currentSessionConfig {
                HStack(spacing: 12) {
                    Text(config.hostId)
                        .font(CSTypography.callout)
                        .foregroundColor(CSColors.textSecondary)

                    Text("\(config.width)x\(config.height)")
                        .font(CSTypography.monoCaption)
                        .foregroundColor(CSColors.textMuted)
                }
            }

            Spacer()

            // Action buttons
            HStack(spacing: 8) {
                // Toggle stats overlay
                Button(action: { streamEngine.toggleOverlay() }) {
                    Image(systemName: streamEngine.showOverlay ? "chart.bar.fill" : "chart.bar")
                        .font(.system(size: 14))
                        .foregroundColor(streamEngine.showOverlay ? CSColors.nvidiaGreen : CSColors.textSecondary)
                }
                .buttonStyle(.plain)
                .padding(6)
                .help("Toggle stats overlay (Tab)")

                // Toggle cursor lock
                Button(action: { streamEngine.toggleInputCapture() }) {
                    Image(systemName: "cursorarrow.motionlines")
                        .font(.system(size: 14))
                        .foregroundColor(CSColors.textSecondary)
                }
                .buttonStyle(.plain)
                .padding(6)
                .help("Toggle cursor lock (Cmd+Shift+Escape)")

                // Full screen toggle
                Button(action: { toggleFullScreen() }) {
                    Image(systemName: isFullScreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 14))
                        .foregroundColor(CSColors.textSecondary)
                }
                .buttonStyle(.plain)
                .padding(6)
                .help("Toggle full screen (F11)")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(
            LinearGradient(
                colors: [CSColors.background.opacity(0.9), CSColors.background.opacity(0)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    // MARK: - Connection Overlay

    @ViewBuilder
    private var connectionOverlay: some View {
        switch streamEngine.state {
        case .connecting:
            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(1.5)
                    .tint(CSColors.nvidiaGreen)
                Text("Connecting...")
                    .font(CSTypography.title2)
                    .foregroundColor(CSColors.textPrimary)
            }

        case .reconnecting:
            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(CSColors.statusWarning)
                Text("Reconnecting...")
                    .font(CSTypography.title2)
                    .foregroundColor(CSColors.statusWarning)
            }

        case .error(let message):
            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(CSColors.statusError)
                Text("Connection Error")
                    .font(CSTypography.title2)
                    .foregroundColor(CSColors.textPrimary)
                Text(message)
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textSecondary)
                GlowButton("Disconnect", icon: "xmark", style: .secondary) {
                    appState.disconnect()
                }
            }

        default:
            EmptyView()
        }
    }

    // MARK: - Actions

    private func showControlsBriefly() {
        withAnimation(.easeInOut(duration: 0.2)) {
            showControls = true
        }
        controlsTimer?.invalidate()
        controlsTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { _ in
            withAnimation(.easeInOut(duration: 0.3)) {
                showControls = false
            }
        }
    }

    private func handleEscape() {
        streamEngine.toggleInputCapture()
        showControlsBriefly()
    }

    private func toggleFullScreen() {
        if let window = NSApp.keyWindow {
            window.toggleFullScreen(nil)
            isFullScreen.toggle()
        }
    }
}

// MARK: - Metal View Representable

/// NSViewRepresentable wrapper for MTKView.
struct MetalViewRepresentable: NSViewRepresentable {
    let streamEngine: StreamEngine

    func makeNSView(context: Context) -> MTKView {
        let mtkView = MTKView()
        mtkView.colorPixelFormat = .bgra8Unorm
        mtkView.framebufferOnly = true
        mtkView.preferredFramesPerSecond = 240
        mtkView.isPaused = false
        mtkView.enableSetNeedsDisplay = false

        // Background color matches our theme
        mtkView.clearColor = MTLClearColor(red: 0.02, green: 0.02, blue: 0.02, alpha: 1.0)

        return mtkView
    }

    func updateNSView(_ nsView: MTKView, context: Context) {
        // The MTKView is configured once; StreamEngine manages the renderer
    }
}
