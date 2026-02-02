//
//  AppView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/22/25.
//

import SwiftUI

struct AppView: View {
  @State var isAuthenticated = false
  @StateObject private var userDataStore = UserDataStore.shared

  var body: some View {
    Group {
      if isAuthenticated {
        MainAppView()
          .environmentObject(userDataStore)
      } else {
        AuthView()
      }
    }
    .task {
      for await state in supabase.auth.authStateChanges {
        if [.initialSession, .signedIn, .signedOut].contains(state.event) {
          isAuthenticated = state.session != nil

          if isAuthenticated {
            await userDataStore.loadAllUserData()
            print("✅ User data loaded successfully on open from AppView")
          }
        }
      }
    }
  }
}

// Main app view with minimal FAB navigation
struct MainAppView: View {
    @EnvironmentObject var userDataStore: UserDataStore
    @StateObject private var appCoordinator = AppStateCoordinator()

    // Global AI Assistant overlay manager
    @State private var assistantManager = AssistantOverlayManager()

    // Navigation state
    @State private var currentPage: DrawerDestination = .home
    @State private var showingMenuDropdown = false
    @State private var showingPlusDropdown = false

    // Sheet states
    @State private var showingProfile = false

    // User info
    @State private var userEmail: String = ""

    var body: some View {
        ZStack {
            currentPageView
                .ignoresSafeArea(.keyboard)

            AssistantOverlayView()
                .environment(\.assistantManager, assistantManager)

            // Tap-to-close overlay for dropdowns
            if showingMenuDropdown || showingPlusDropdown {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(AppTheme.Animation.gentle) {
                            showingMenuDropdown = false
                            showingPlusDropdown = false
                        }
                    }
            }

            // ThinTopBar with dropdown menus
            VStack(spacing: 0) {
                ThinTopBar(
                    leftIcon: currentPage == .home ? "line.2.horizontal" : "chevron.left",
                    leftAction: {
                        if currentPage == .home {
                            withAnimation(AppTheme.Animation.gentle) {
                                showingPlusDropdown = false
                                showingMenuDropdown.toggle()
                            }
                        } else {
                            withAnimation(AppTheme.Animation.gentle) {
                                currentPage = .home
                            }
                        }
                    },
                    centerText: currentPage == .home ? nil : pageTitle,
                    rightIcon: currentPage == .home ? "plus" : nil,
                    rightAction: currentPage == .home ? {
                        withAnimation(AppTheme.Animation.gentle) {
                            showingMenuDropdown = false
                            showingPlusDropdown.toggle()
                        }
                    } : nil
                )

                // Dropdown menus (only on home)
                if currentPage == .home {
                    ZStack(alignment: .top) {
                        // Menu dropdown (left side)
                        if showingMenuDropdown {
                            menuDropdown
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }

                        // Plus dropdown (right side)
                        if showingPlusDropdown {
                            plusDropdown
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .top)
                }

                Spacer()
            }
        }
        .sheet(isPresented: $showingProfile) {
            ProfileView()
        }
        .onAppear {
            Task { await appCoordinator.startAppInitialization() }
            Task { await loadUserEmail() }
        }
    }

    // MARK: - Menu Dropdown

    private var menuDropdown: some View {
        VStack(alignment: .leading, spacing: 4) {
            dropdownButton(icon: "clock", label: "History") {
                currentPage = .stats
                showingMenuDropdown = false
            }
            dropdownButton(icon: "slider.horizontal.3", label: "Preferences") {
                currentPage = .info
                showingMenuDropdown = false
            }
            dropdownButton(icon: "person.text.rectangle", label: "Trainer") {
                currentPage = .coach
                showingMenuDropdown = false
            }
            dropdownButton(icon: "person", label: "Profile") {
                showingProfile = true
                showingMenuDropdown = false
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, AppTheme.Spacing.xl)
    }

    // MARK: - Plus Dropdown

    private var plusDropdown: some View {
        VStack(alignment: .leading, spacing: 4) {
            dropdownButton(icon: "sparkles", label: "Generate custom workout") {
                showingPlusDropdown = false
                NotificationCenter.default.post(name: .showQuickWorkoutSheet, object: nil)
            }
            dropdownButton(icon: "calendar", label: "Schedule a workout") {
                showingPlusDropdown = false
                NotificationCenter.default.post(name: .showScheduleWorkoutSheet, object: nil)
            }
            dropdownButton(icon: "figure.run", label: "Start a run") {
                showingPlusDropdown = false
                NotificationCenter.default.post(name: .showStartRunSheet, object: nil)
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
        )
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.horizontal, AppTheme.Spacing.xl)
    }

    // MARK: - Dropdown Button

    private func dropdownButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: {
            withAnimation(AppTheme.Animation.gentle) {
                action()
            }
        }) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .frame(width: 24)
                Text(label)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(AppTheme.Colors.primaryText)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                    .fill(Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Current Page View

    @ViewBuilder
    private var currentPageView: some View {
        switch currentPage {
        case .home:
            HomeView()
                .environmentObject(appCoordinator)
                .id("home")
        case .stats:
            StatsPageView()
                .id("stats")
        case .info:
            InfoPageView()
                .environmentObject(userDataStore)
                .id("info")
        case .coach:
            TrainerJourneyView()
                .id("coach")
        case .profile:
            EmptyView()
        }
    }

    private var pageTitle: String {
        switch currentPage {
        case .stats:
            return "History"
        case .info:
            return "Preferences"
        case .coach:
            return "Trainer"
        case .profile:
            return "Profile"
        case .home:
            return ""
        }
    }

    private func loadUserEmail() async {
        do {
            let session = try await supabase.auth.session
            userEmail = session.user.email ?? ""
        } catch {
            print("❌ Failed to load user email: \(error)")
            userEmail = ""
        }
    }
}

// MARK: - Two-Line Menu Icon

struct TwoLineMenuIcon: View {
    var body: some View {
        VStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 1)
                .fill(AppTheme.Colors.primaryText)
                .frame(width: 18, height: 2)
            RoundedRectangle(cornerRadius: 1)
                .fill(AppTheme.Colors.primaryText)
                .frame(width: 18, height: 2)
        }
    }
}

// MARK: - Stats Page View (Full Page Wrapper)

struct StatsPageView: View {
    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()
            StatsContentView()
        }
    }
}

// MARK: - Info Page View (Full Page Wrapper)

struct InfoPageView: View {
    @EnvironmentObject var userDataStore: UserDataStore

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()
            InfoContentView()
                .environmentObject(userDataStore)
        }
    }
}

// MARK: - Minimal Back Bar

struct MinimalBackBar: View {
    let title: String
    let onBack: () -> Void

    var body: some View {
        VStack {
            HStack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(width: 44, height: 44)
                }
                Spacer()
                Text(title)
                    .font(AppTheme.Typography.screenTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)
                Spacer()
                Color.clear.frame(width: 44, height: 44)
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.top, AppTheme.Spacing.md)
            Spacer()
        }
        .ignoresSafeArea(edges: .top)
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let showQuickWorkoutSheet = Notification.Name("showQuickWorkoutSheet")
    static let showScheduleWorkoutSheet = Notification.Name("showScheduleWorkoutSheet")
    static let showStartRunSheet = Notification.Name("showStartRunSheet")
}

#Preview {
    AppView()
}
