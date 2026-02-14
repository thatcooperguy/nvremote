// GridStreamerApp.swift — App entry point
// GridStreamer macOS Client

import SwiftUI

/// The main entry point for the GridStreamer macOS client application.
@main
struct GridStreamerApp: App {
    @StateObject private var authManager = AuthManager()
    @StateObject private var appState: AppState

    init() {
        // Initialize AuthManager first, then AppState which depends on it
        let auth = AuthManager()
        auth.clientID = AppConfig.googleClientID
        _authManager = StateObject(wrappedValue: auth)
        _appState = StateObject(wrappedValue: AppState(authManager: auth))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(appState)
                .frame(minWidth: 800, minHeight: 600)
                .onAppear {
                    configureAppearance()
                }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1280, height: 800)
        .commands {
            // Custom menu commands
            CommandGroup(replacing: .newItem) { }

            CommandMenu("Stream") {
                Button("Toggle Stats Overlay") {
                    appState.streamEngine.toggleOverlay()
                }
                .keyboardShortcut(KeyEquivalent.tab, modifiers: [])
                .disabled(!appState.isStreaming)

                Button("Toggle Input Capture") {
                    appState.streamEngine.toggleInputCapture()
                }
                .keyboardShortcut(.escape, modifiers: [.command, .shift])
                .disabled(!appState.isStreaming)

                Divider()

                Button("Disconnect") {
                    appState.disconnect()
                }
                .keyboardShortcut("d", modifiers: [.command])
                .disabled(!appState.isStreaming)
            }

            CommandMenu("Gaming Mode") {
                ForEach(StreamSessionConfig.GamingMode.allCases) { mode in
                    Button(mode.displayName) {
                        appState.selectedGamingMode = mode
                    }
                    .disabled(appState.isStreaming)
                }
            }
        }

        // Settings window
        Settings {
            SettingsView()
                .environmentObject(appState)
        }
    }

    /// Configure the global appearance for the dark NVIDIA theme.
    private func configureAppearance() {
        // Force dark mode
        NSApp.appearance = NSAppearance(named: .darkAqua)

        // Configure window appearance
        if let window = NSApp.windows.first {
            window.backgroundColor = CSColors.backgroundNS
            window.isOpaque = true
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden

            // Set minimum window size
            window.minSize = NSSize(width: 800, height: 600)
        }
    }
}
