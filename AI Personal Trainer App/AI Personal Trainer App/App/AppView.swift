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

    // Sheet states
    @State private var showingProfile = false

    // User info
    @State private var userEmail: String = ""

    var body: some View {
        ZStack(alignment: .top) {
            currentPageView
                .ignoresSafeArea(.keyboard)

            AssistantOverlayView()
                .environment(\.assistantManager, assistantManager)

            // Top bar
            VStack(spacing: 0) {
                homeTopBar
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

    // MARK: - Home Top Bar

    private var homeTopBar: some View {
        HStack {
            // Left button - Menu or Back
            if currentPage == .home {
                Menu {
                    Button(action: { currentPage = .stats }) {
                        Label("History", systemImage: "clock")
                    }
                    Button(action: { currentPage = .info }) {
                        Label("Preferences", systemImage: "slider.horizontal.3")
                    }
                    Button(action: { currentPage = .coach }) {
                        Label("Trainer", systemImage: "person.text.rectangle")
                    }
                    Button(action: { showingProfile = true }) {
                        Label("Profile", systemImage: "person")
                    }
                } label: {
                    TwoLineMenuIcon()
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
            } else {
                Button(action: {
                    withAnimation(AppTheme.Animation.gentle) {
                        currentPage = .home
                    }
                }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }

            Spacer()

            // Center text (non-home pages)
            if currentPage != .home {
                Text(pageTitle)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }

            Spacer()

            // Right button - Plus menu or spacer
            if currentPage == .home {
                Menu {
                    Button(action: {
                        NotificationCenter.default.post(name: .showQuickWorkoutSheet, object: nil)
                    }) {
                        Label("Generate custom workout", systemImage: "sparkles")
                    }
                    Button(action: {
                        NotificationCenter.default.post(name: .showScheduleWorkoutSheet, object: nil)
                    }) {
                        Label("Schedule a workout", systemImage: "calendar")
                    }
                    Button(action: {
                        NotificationCenter.default.post(name: .showStartRunSheet, object: nil)
                    }) {
                        Label("Start a run", systemImage: "figure.run")
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
            } else {
                Color.clear
                    .frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.xl)
        .padding(.top, 4)
        .padding(.bottom, 12)
        .frame(height: 60)
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
