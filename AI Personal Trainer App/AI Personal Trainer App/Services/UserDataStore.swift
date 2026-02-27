//
//  UserDataStore.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import Foundation

/// Centralized data store for user-specific data
/// Fetches all data once on app launch and provides reactive updates
@MainActor
class UserDataStore: ObservableObject {
    // MARK: - Published Properties

    @Published var locations: [Location] = []

    @Published var isLoadingAll: Bool = false
    @Published var isLoadingLocations: Bool = false

    @Published var lastFetchedAt: Date?
    @Published var error: Error?

    // Computed property for current location
    var currentLocation: Location? {
        locations.first { $0.currentLocation }
    }

    // MARK: - Singleton

    static let shared = UserDataStore()
    private let apiService = APIService.shared

    private init() {}

    // MARK: - Initial Data Loading

    /// Load all user data on app launch
    func loadAllUserData() async {
        isLoadingAll = true
        error = nil

        do {
            self.locations = try await fetchLocations()
            print("✅ Locations loaded")
        } catch {
            self.error = error
            print("❌ Error loading locations: \(error)")
            self.locations = []
        }

        self.lastFetchedAt = Date()
        print("✅ User data loading completed")

        isLoadingAll = false
    }

    // MARK: - Locations

    /// Fetch locations from database and update local state
    func refreshLocations() async {
        isLoadingLocations = true

        do {
            self.locations = try await fetchLocations()
            print("✅ Locations refreshed")
        } catch {
            self.error = error
            print("❌ Error refreshing locations: \(error)")
        }

        isLoadingLocations = false
    }

    private func fetchLocations() async throws -> [Location] {
        try await apiService.fetchLocations()
    }

    /// Create a new location
    func createLocation(_ location: Location) async throws {
        let newLocation = try await apiService.createLocation(location)

        await MainActor.run {
            if newLocation.currentLocation {
                // If this is set as current, unset all others
                locations.indices.forEach { index in
                    if locations[index].currentLocation {
                        var updated = locations[index]
                        updated.currentLocation = false
                        locations[index] = updated
                    }
                }
            }
            locations.append(newLocation)
        }

        print("✅ Location created successfully")
    }

    /// Update an existing location
    func updateLocation(_ location: Location) async throws {
        let updatedLocation = try await apiService.updateLocation(location)

        // Update local state
        if let index = locations.firstIndex(where: { $0.id == location.id }) {
            locations[index] = updatedLocation

            // If this became current, unset others locally
            if updatedLocation.currentLocation {
                for idx in locations.indices {
                    if idx != index && locations[idx].currentLocation {
                        var unset = locations[idx]
                        unset.currentLocation = false
                        locations[idx] = unset
                    }
                }
            }
        }

        print("✅ Location updated successfully")
    }

    /// Delete a location
    func deleteLocation(id: Int64) async throws {
        try await apiService.deleteLocation(id: id)

        locations.removeAll { $0.id == id }

        print("✅ Location deleted successfully")
    }

    /// Set a location as the current location
    func setCurrentLocation(_ locationId: Int64) async throws {
        let updatedLocation = try await apiService.setCurrentLocation(id: locationId)

        // Update local state
        for index in locations.indices {
            locations[index].currentLocation = (locations[index].id == locationId)
        }
        if !locations.contains(where: { $0.id == updatedLocation.id }) {
            locations.append(updatedLocation)
        }

        print("✅ Current location set successfully")
    }

    /// Update a single location in local state (for optimistic UI)
    func updateLocationLocally(_ location: Location) {
        if let index = locations.firstIndex(where: { $0.id == location.id }) {
            locations[index] = location
        } else {
            locations.append(location)
        }
    }

    /// Remove a location from local state
    func removeLocationLocally(id: Int64) {
        locations.removeAll { $0.id == id }
    }
}
