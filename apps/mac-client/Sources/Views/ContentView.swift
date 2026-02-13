// ContentView.swift — Main view router
// CrazyStream macOS Client

import SwiftUI

/// The root view that routes between login, host list, and streaming views
/// based on the current application state.
struct ContentView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var authManager: AuthManager

    var body: some View {
        Group {
            if !authManager.isAuthenticated {
                LoginView()
                    .transition(.opacity)
            } else if appState.isStreaming {
                StreamView(streamEngine: appState.streamEngine)
                    .transition(.opacity)
            } else {
                HostListView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authManager.isAuthenticated)
        .animation(.easeInOut(duration: 0.3), value: appState.isStreaming)
        .frame(minWidth: 800, minHeight: 600)
        .preferredColorScheme(.dark)
    }
}
