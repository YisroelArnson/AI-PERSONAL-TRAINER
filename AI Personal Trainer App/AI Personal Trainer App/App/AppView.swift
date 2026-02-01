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
    @State private var isFabExpanded = false

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

            if currentPage == .home {
                ExpandingFabMenu(isExpanded: $isFabExpanded, items: menuItems)
            } else {
                MinimalBackBar(title: pageTitle) {
                    withAnimation(AppTheme.Animation.gentle) {
                        currentPage = .home
                    }
                }
            }

            if isFabExpanded {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(AppTheme.Animation.gentle) {
                            isFabExpanded = false
                        }
                    }
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

    private var menuItems: [FabMenuItem] {
        [
            FabMenuItem(icon: "clock") {
                currentPage = .stats
            },
            FabMenuItem(icon: "slider.horizontal.3") {
                currentPage = .info
            },
            FabMenuItem(icon: "person.text.rectangle") {
                currentPage = .coach
            },
            FabMenuItem(icon: "person") {
                showingProfile = true
            }
        ]
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
            AnimatedGradientBackground()
            StatsContentView()
        }
    }
}

// MARK: - Info Page View (Full Page Wrapper)

struct InfoPageView: View {
    @EnvironmentObject var userDataStore: UserDataStore

    var body: some View {
        ZStack {
            AnimatedGradientBackground()
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

#Preview {
    AppView()
}
