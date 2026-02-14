// HostListView.swift — Available hosts list
// GridStreamer macOS Client

import SwiftUI

/// Displays the list of available streaming hosts with connection controls.
struct HostListView: View {
    @EnvironmentObject private var appState: AppState

    @State private var selectedHostId: String?
    @State private var isRefreshing = false
    @State private var showSettings = false
    @State private var searchText = ""

    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView

            Divider()
                .background(CSColors.border)

            // Content
            if appState.hosts.isEmpty && !isRefreshing {
                emptyStateView
            } else {
                hostListContent
            }
        }
        .csBackground()
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(appState)
        }
        .task {
            await refreshHosts()
        }
    }

    // MARK: - Header

    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Your Hosts")
                    .font(CSTypography.title)
                    .foregroundColor(CSColors.textPrimary)

                Text("\(appState.hosts.filter(\.isOnline).count) online")
                    .font(CSTypography.caption)
                    .foregroundColor(CSColors.nvidiaGreen)
            }

            Spacer()

            // Search field
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(CSColors.textMuted)
                TextField("Search hosts...", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(CSTypography.body)
                    .foregroundColor(CSColors.textPrimary)
            }
            .padding(8)
            .frame(width: 200)
            .background(CSColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(CSColors.border, lineWidth: 1)
            )

            // Refresh button
            Button(action: {
                Task { await refreshHosts() }
            }) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(CSColors.textSecondary)
                    .rotationEffect(.degrees(isRefreshing ? 360 : 0))
                    .animation(isRefreshing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: isRefreshing)
            }
            .buttonStyle(.plain)
            .padding(8)

            // Settings button
            Button(action: { showSettings = true }) {
                Image(systemName: "gearshape")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(CSColors.textSecondary)
            }
            .buttonStyle(.plain)
            .padding(8)

            // User menu
            userMenuView
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }

    private var userMenuView: some View {
        Menu {
            if let user = appState.authManager.user {
                Text(user.displayName)
                Text(user.email)
                Divider()
            }
            Button("Sign Out", action: { appState.authManager.signOut() })
        } label: {
            Image(systemName: "person.circle")
                .font(.system(size: 20))
                .foregroundColor(CSColors.textSecondary)
        }
        .menuStyle(.borderlessButton)
        .frame(width: 32)
    }

    // MARK: - Host List

    private var hostListContent: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                // Gaming mode selector at the top
                GamingModeSelector(selectedMode: $appState.selectedGamingMode)
                    .padding(.bottom, 8)

                ForEach(filteredHosts) { host in
                    HostCardView(
                        host: host,
                        isSelected: selectedHostId == host.id,
                        onConnect: {
                            selectedHostId = host.id
                            Task { await appState.connectToHost(host) }
                        }
                    )
                }
            }
            .padding(24)
        }
    }

    private var filteredHosts: [HostInfo] {
        if searchText.isEmpty {
            return appState.hosts.sorted { $0.isOnline && !$1.isOnline }
        }
        return appState.hosts.filter { host in
            host.name.localizedCaseInsensitiveContains(searchText) ||
            host.gpuName.localizedCaseInsensitiveContains(searchText)
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "desktopcomputer.trianglebadge.exclamationmark")
                .font(.system(size: 48))
                .foregroundColor(CSColors.textMuted)

            Text("No hosts found")
                .font(CSTypography.title2)
                .foregroundColor(CSColors.textPrimary)

            Text("Make sure your GridStreamer host is running\nand connected to the same account.")
                .font(CSTypography.body)
                .foregroundColor(CSColors.textSecondary)
                .multilineTextAlignment(.center)

            GlowButton("Refresh", icon: "arrow.clockwise") {
                Task { await refreshHosts() }
            }

            Spacer()
        }
    }

    // MARK: - Actions

    private func refreshHosts() async {
        isRefreshing = true
        await appState.refreshHosts()
        isRefreshing = false
    }
}
