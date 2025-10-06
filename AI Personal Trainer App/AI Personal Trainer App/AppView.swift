//
//  AppView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/22/25.
//

import SwiftUI

struct AppView: View {
  @State var isAuthenticated = false

  var body: some View {
    Group {
      if isAuthenticated {
        MainAppView()
      } else {
        MainAppView()
      }
    }
    .task {
      for await state in supabase.auth.authStateChanges {
        if [.initialSession, .signedIn, .signedOut].contains(state.event) {
          isAuthenticated = state.session != nil
        }
      }
    }
  }
}

// Main app view with floating navigation
struct MainAppView: View {
    @State private var showingStats = false
    @State private var showingInfo = false
    @State private var showingAssistant = false
    @State private var showingWritingMode = false
    @State private var showingProfile = false
    
    var body: some View {
        ZStack {
            // Main content
            ContentView()
            
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
    }
}
