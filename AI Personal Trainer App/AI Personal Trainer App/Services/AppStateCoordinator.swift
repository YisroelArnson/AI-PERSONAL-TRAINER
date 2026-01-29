//
//  AppStateCoordinator.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/9/25.
//

import Foundation
import SwiftUI
import CoreLocation

// MARK: - App Loading State

enum AppLoadingState: Equatable {
    case initializing
    case loadingUserData
    case checkingLocation
    case locationDetected(String) // location name
    case fetchingRecommendations
    case ready
    case error(String)
    
    var message: String {
        switch self {
        case .initializing:
            return "Initializing..."
        case .loadingUserData:
            return "Loading your data..."
        case .checkingLocation:
            return "Checking location..."
        case .locationDetected(let locationName):
            return "Switched to \(locationName)"
        case .fetchingRecommendations:
            return "Fetching recommendations..."
        case .ready:
            return "Ready"
        case .error(let message):
            return message
        }
    }
    
    var icon: String {
        switch self {
        case .initializing:
            return "hourglass"
        case .loadingUserData:
            return "arrow.down.circle"
        case .checkingLocation:
            return "location.circle"
        case .locationDetected:
            return "location.fill"
        case .fetchingRecommendations:
            return "sparkles"
        case .ready:
            return "checkmark.circle.fill"
        case .error:
            return "exclamationmark.triangle"
        }
    }
}

// MARK: - App State Coordinator

@MainActor
class AppStateCoordinator: ObservableObject {
    @Published var loadingState: AppLoadingState = .initializing
    @Published var isReady: Bool = false
    @Published var shouldFetchRecommendations: Bool = false
    
    private var userDataStore: UserDataStore
    private var userSettings: UserSettings
    private var locationService: LocationService
    
    init(
        userDataStore: UserDataStore = .shared,
        userSettings: UserSettings = .shared,
        locationService: LocationService = .shared
    ) {
        self.userDataStore = userDataStore
        self.userSettings = userSettings
        self.locationService = locationService
    }
    
    /// Start the app initialization sequence
    /// Coordinates: load data → auto-detect location → signal ready for recommendations
    func startAppInitialization() async {
        print("🚀 Starting app initialization sequence")
        
        // Step 1: Load user data (minimum 2 seconds display)
        loadingState = .loadingUserData
        let dataLoadStart = Date()
        await waitForUserDataLoad()
        let dataLoadElapsed = Date().timeIntervalSince(dataLoadStart)
        if dataLoadElapsed < 2.0 {
            try? await Task.sleep(nanoseconds: UInt64((2.0 - dataLoadElapsed) * 1_000_000_000))
        }
        
        // Step 2: Auto-detect location (if enabled, minimum 1.5 seconds display)
        let locationStart = Date()
        await performAutoDetectionIfEnabled()
        let locationElapsed = Date().timeIntervalSince(locationStart)
        if locationElapsed < 1.5 && loadingState == .checkingLocation {
            try? await Task.sleep(nanoseconds: UInt64((1.5 - locationElapsed) * 1_000_000_000))
        }
        
        // If location was detected, show it for at least 1.5 seconds
        if case .locationDetected = loadingState {
            try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 seconds
        }
        
        // Step 3: Signal ready for workout home
        loadingState = .ready
        shouldFetchRecommendations = false
        isReady = true
        print("✅ App initialization complete - ready for workout")
    }
    
    /// Call this from HomeView when the first exercise is received
    func markAsReady() {
        guard !isReady else { return }
        loadingState = .ready
        isReady = true
        print("✅ App initialization complete - first exercise received")
    }
    
    // MARK: - Private Helpers
    
    private func waitForUserDataLoad() async {
        // Wait for user data to finish loading
        while userDataStore.isLoadingAll {
            try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
        }
        
        print("✅ User data loaded - locations count: \(userDataStore.locations.count)")
    }
    
    private func performAutoDetectionIfEnabled() async {
        // Check if auto-detect is enabled
        guard userSettings.isAutoDetectLocationEnabled else {
            print("📍 Auto-detect is disabled, skipping location check")
            return
        }
        
        // Check if we have location permission
        guard locationService.authorizationStatus == .authorizedWhenInUse ||
              locationService.authorizationStatus == .authorizedAlways else {
            print("📍 No location permission, skipping auto-detect")
            return
        }
        
        // Check if there are saved locations
        guard !userDataStore.locations.isEmpty else {
            print("📍 No saved locations, skipping auto-detect")
            return
        }
        
        // Update state to checking location
        loadingState = .checkingLocation
        
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
            
            // Update state to show location detected
            loadingState = .locationDetected(nearestLocation.name)
            
            print("✅ Location switched to: \(nearestLocation.name)")
            
        } catch {
            print("⚠️ Auto-detect error: \(error.localizedDescription)")
            // Don't block the app, continue to recommendations
        }
    }
    
    /// Reset the coordinator (useful for testing or retry scenarios)
    func reset() {
        loadingState = .initializing
        isReady = false
        shouldFetchRecommendations = false
    }
}
