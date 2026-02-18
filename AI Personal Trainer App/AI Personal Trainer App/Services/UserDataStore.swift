//
//  UserDataStore.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import Foundation
import Supabase

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
        // Get current user ID
        let session = try await supabase.auth.session
        let userId = session.user.id

        // Try to use ST_AsText() to get WKT format, but fall back to raw query if it fails
        let response: [LocationDB]
        do {
            // Try with ST_AsText() first
            response = try await supabase
                .from("user_locations")
                .select("id, user_id, name, description, equipment, current_location, created_at, ST_AsText(geo_data)")
                .eq("user_id", value: userId.uuidString)
                .order("created_at", ascending: true)
                .execute()
                .value
        } catch {
            // If ST_AsText() fails, fall back to regular select (will return EWKB hex)
            print("⚠️ ST_AsText() not supported, falling back to raw geo_data (EWKB hex)")
            response = try await supabase
                .from("user_locations")
                .select()
                .eq("user_id", value: userId.uuidString)
                .order("created_at", ascending: true)
                .execute()
                .value
        }

        return response.map { db in
            print("📍 fetchLocations: Processing location '\(db.name)' with geo_data: \(db.geo_data ?? "nil")")
            let geoData = Location.coordinateFromPostGIS(db.geo_data)
            if geoData == nil && db.geo_data != nil {
                print("⚠️ fetchLocations: geo_data exists but conversion failed for location '\(db.name)'")
            }
            return Location(
                id: db.id,
                name: db.name,
                description: db.description,
                equipment: db.equipment ?? [],
                currentLocation: db.current_location ?? false,
                geoData: geoData,
                createdAt: db.created_at
            )
        }
    }

    /// Create a new location
    func createLocation(_ location: Location) async throws {
        let session = try await supabase.auth.session
        let userId = session.user.id

        struct LocationInsert: Codable {
            let user_id: String
            let name: String
            let description: String?
            let equipment: [EquipmentItem]
            let current_location: Bool
            let geo_data: String?
        }

        let insert = LocationInsert(
            user_id: userId.uuidString,
            name: location.name,
            description: location.description,
            equipment: location.equipment,
            current_location: location.currentLocation,
            geo_data: location.geoData != nil ? Location.postGISFromCoordinate(location.geoData!) : nil
        )

        // Insert the location
        let response: LocationDB
        do {
            response = try await supabase
                .from("user_locations")
                .insert(insert)
                .select()
                .single()
                .execute()
                .value
        } catch {
            print("❌ Error inserting location: \(error)")
            throw error
        }

        // Convert to Location and add to local state
        let newLocation = Location(
            id: response.id,
            name: response.name,
            description: response.description,
            equipment: response.equipment ?? [],
            currentLocation: response.current_location ?? false,
            geoData: Location.coordinateFromPostGIS(response.geo_data),
            createdAt: response.created_at
        )

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
        let session = try await supabase.auth.session
        let userId = session.user.id

        struct LocationUpdate: Codable {
            let name: String
            let description: String?
            let equipment: [EquipmentItem]
            let current_location: Bool
            let geo_data: String?
        }

        let update = LocationUpdate(
            name: location.name,
            description: location.description,
            equipment: location.equipment,
            current_location: location.currentLocation,
            geo_data: location.geoData != nil ? Location.postGISFromCoordinate(location.geoData!) : nil
        )

        // Update the location
        let response: LocationDB
        do {
            response = try await supabase
                .from("user_locations")
                .update(update)
                .eq("id", value: String(location.id))
                .eq("user_id", value: userId.uuidString)
                .select()
                .single()
                .execute()
                .value
        } catch {
            print("❌ Error updating location: \(error)")
            throw error
        }

        // If setting as current location, unset all others
        if location.currentLocation {
            try await supabase
                .from("user_locations")
                .update(["current_location": false])
                .eq("user_id", value: try await supabase.auth.session.user.id.uuidString)
                .neq("id", value: String(location.id))
                .execute()
        }

        // Update local state
        if let index = locations.firstIndex(where: { $0.id == location.id }) {
            let updatedLocation = Location(
                id: response.id,
                name: response.name,
                description: response.description,
                equipment: response.equipment ?? [],
                currentLocation: response.current_location ?? false,
                geoData: Location.coordinateFromPostGIS(response.geo_data),
                createdAt: response.created_at
            )
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
        let session = try await supabase.auth.session
        let userId = session.user.id

        try await supabase
            .from("user_locations")
            .delete()
            .eq("id", value: String(id))
            .eq("user_id", value: userId.uuidString)
            .execute()

        locations.removeAll { $0.id == id }

        print("✅ Location deleted successfully")
    }

    /// Set a location as the current location
    func setCurrentLocation(_ locationId: Int64) async throws {
        let session = try await supabase.auth.session
        let userId = session.user.id

        // First, set all locations to not current
        try await supabase
            .from("user_locations")
            .update(["current_location": false])
            .eq("user_id", value: userId.uuidString)
            .execute()

        // Then set the selected location as current
        try await supabase
            .from("user_locations")
            .update(["current_location": true])
            .eq("id", value: String(locationId))
            .eq("user_id", value: userId.uuidString)
            .execute()

        // Update local state
        for index in locations.indices {
            locations[index].currentLocation = (locations[index].id == locationId)
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
