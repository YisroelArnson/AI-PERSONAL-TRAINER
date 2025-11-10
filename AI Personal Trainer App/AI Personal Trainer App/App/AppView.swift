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
          
          // Load user data when authenticated
          if isAuthenticated {
            await userDataStore.loadAllUserData()
            print("✅ User data loaded successfully on open from AppView")
          }
        }
      }
    }
  }
}

// Main app view with floating navigation
struct MainAppView: View {
    @EnvironmentObject var userDataStore: UserDataStore
    @StateObject private var appCoordinator = AppStateCoordinator()
    
    @State private var showingStats = false
    @State private var showingInfo = false
    @State private var showingAssistant = false
    @State private var showingWritingMode = false
    @State private var showingProfile = false
    
    var body: some View {
        ZStack {
            // Main content
            HomeView()
                .environmentObject(appCoordinator)
            
            // Floating navigation bar - always on top
            VStack {
                Spacer()
                FloatingNavigationBar(
                    showingStats: $showingStats,
                    showingInfo: $showingInfo,
                    showingAssistant: $showingAssistant,
                    showingWritingMode: $showingWritingMode,
                    showingProfile: $showingProfile
                )
                .padding(.bottom, 20)
                .padding(.horizontal, 20)
            }
        }
        .sheet(isPresented: $showingStats) {
            StatsView()
        }
        .sheet(isPresented: $showingInfo) {
            InfoView()
        }
        .sheet(isPresented: $showingAssistant) {
            AssistantView()
        }
        .sheet(isPresented: $showingWritingMode) {
            WritingModeView()
        }
        .sheet(isPresented: $showingProfile) {
            ProfileView()
        }
        .onAppear {
            // Start the coordinated initialization sequence
            Task {
                await appCoordinator.startAppInitialization()
            }
        }
    }
}

#Preview {
    AppView()
}


