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
    @StateObject private var userSettings = UserSettings.shared
    @StateObject private var locationService = LocationService.shared
    
    @State private var showingStats = false
    @State private var showingInfo = false
    @State private var showingAssistant = false
    @State private var showingWritingMode = false
    @State private var showingProfile = false
    
    @State private var toast: ToastData?
    @State private var hasPerformedAutoDetect = false
    
    @Environment(\.scenePhase) private var scenePhase
    
    var body: some View {
        ZStack {
            // Main content
            HomeView()
            
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
        .toast($toast)
        .onChange(of: scenePhase) { oldPhase, newPhase in
            if newPhase == .active && !hasPerformedAutoDetect {
                performAutoDetection()
            }
        }
        .onChange(of: userDataStore.isLoadingAll) { oldValue, newValue in
            // When all data finishes loading, try auto-detection if not already done
            if !newValue && !hasPerformedAutoDetect {
                print("📍 User data finished loading, triggering auto-detection")
                performAutoDetection()
            }
        }
        .onAppear {
            if !hasPerformedAutoDetect {
                performAutoDetection()
            }
        }
    }
    
    // MARK: - Auto-Detection Logic
    
    private func performAutoDetection() {
        print("📍 performAutoDetection called")
        print("📍 - Auto-detect enabled: \(userSettings.isAutoDetectLocationEnabled)")
        print("📍 - Has permission: \(locationService.authorizationStatus == .authorizedWhenInUse || locationService.authorizationStatus == .authorizedAlways)")
        print("📍 - Is loading locations: \(userDataStore.isLoadingLocations)")
        print("📍 - Locations count: \(userDataStore.locations.count)")
        print("📍 - Has performed auto-detect: \(hasPerformedAutoDetect)")
        
        // Only run once per app session
        hasPerformedAutoDetect = true
        
        // Check if auto-detect is enabled
        guard userSettings.isAutoDetectLocationEnabled else {
            print("📍 Auto-detect is disabled, skipping")
            return
        }
        
        // Check if we have location permission
        guard locationService.authorizationStatus == .authorizedWhenInUse ||
              locationService.authorizationStatus == .authorizedAlways else {
            print("📍 No location permission, skipping auto-detect")
            return
        }
        
        // Wait for all data to finish loading before checking
        if userDataStore.isLoadingAll {
            print("📍 User data still loading, will retry when complete")
            hasPerformedAutoDetect = false // Reset flag to allow retry when loading completes
            return
        }
        
        // Ensure locations are loaded
        guard !userDataStore.locations.isEmpty else {
            print("📍 No saved locations, skipping auto-detect (count: \(userDataStore.locations.count))")
            return
        }
        
        Task {
            do {
                // Get current location
                guard let currentCoordinate = try await locationService.getCurrentLocation() else {
                    print("📍 Could not get current location")
                    return
                }
                
                print("📍 Current location: \(currentCoordinate.latitude), \(currentCoordinate.longitude)")
                
                // Find nearest location within 500m
                guard let nearestLocation = locationService.findNearestLocation(
                    from: currentCoordinate,
                    within: 500,
                    from: userDataStore.locations
                ) else {
                    print("📍 No nearby locations found")
                    return
                }
                
                // Check if it's already the current location
                if nearestLocation.currentLocation {
                    print("📍 Already at nearest location: \(nearestLocation.name)")
                    return
                }
                
                // Switch to the nearest location
                print("📍 Switching to nearest location: \(nearestLocation.name)")
                try await userDataStore.setCurrentLocation(nearestLocation.id)
                
                // Show toast notification
                await MainActor.run {
                    toast = ToastData(
                        message: "Switched to \(nearestLocation.name)",
                        icon: "location.fill",
                        duration: 3.0
                    )
                }
                
            } catch {
                print("⚠️ Auto-detect error: \(error.localizedDescription)")
                // Fail silently - don't bother the user with errors
            }
        }
    }
}

#Preview {
    AppView()
}

