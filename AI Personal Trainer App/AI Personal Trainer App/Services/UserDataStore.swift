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
    
    @Published var categoryGoals: [CategoryGoalItem] = []
    @Published var muscleGoals: [MuscleGoalItem] = []
    @Published var preferences: [UserPreference] = []
    @Published var locations: [Location] = []
    
    @Published var isLoadingAll: Bool = false
    @Published var isLoadingCategories: Bool = false
    @Published var isLoadingMuscles: Bool = false
    @Published var isLoadingPreferences: Bool = false
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
        
        // Load all data in parallel for faster loading
        // Handle errors individually so one failure doesn't prevent others from loading
        async let categoryGoalsTask = fetchCategoryGoals()
        async let muscleGoalsTask = fetchMuscleGoals()
        async let preferencesTask = fetchPreferences()
        async let locationsTask = fetchLocations()
        
        // Await each task individually and handle errors separately
        do {
            self.categoryGoals = try await categoryGoalsTask
            print("✅ Category goals loaded")
        } catch {
            self.error = error
            print("❌ Error loading category goals: \(error)")
            self.categoryGoals = []
        }
        
        do {
            self.muscleGoals = try await muscleGoalsTask
            print("✅ Muscle goals loaded")
        } catch {
            self.error = error
            print("❌ Error loading muscle goals: \(error)")
            self.muscleGoals = []
        }
        
        do {
            self.preferences = try await preferencesTask
            print("✅ Preferences loaded")
        } catch {
            self.error = error
            print("❌ Error loading preferences: \(error)")
            self.preferences = []
        }
        
        do {
            self.locations = try await locationsTask
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
    
    // MARK: - Category Goals
    
    /// Fetch category goals from database and update local state
    func refreshCategoryGoals() async {
        isLoadingCategories = true
        
        do {
            self.categoryGoals = try await fetchCategoryGoals()
            print("✅ Category goals refreshed")
        } catch {
            self.error = error
            print("❌ Error refreshing category goals: \(error)")
        }
        
        isLoadingCategories = false
    }
    
    private func fetchCategoryGoals() async throws -> [CategoryGoalItem] {
        let response: [CategoryGoalDB] = try await supabase
            .from("user_category_and_weight")
            .select()
            .order("created_at", ascending: true)
            .execute()
            .value
        
        return response.map { db in
            CategoryGoalItem(
                id: db.id,
                category: db.category,
                description: db.description,
                weight: db.weight,
                enabled: db.enabled ?? true  // Default to true if not present in database
            )
        }
    }
    
    // MARK: - Muscle Goals
    
    /// Fetch muscle goals from database and update local state
    func refreshMuscleGoals() async {
        isLoadingMuscles = true
        
        do {
            self.muscleGoals = try await fetchMuscleGoals()
            print("✅ Muscle goals refreshed")
        } catch {
            self.error = error
            print("❌ Error refreshing muscle goals: \(error)")
        }
        
        isLoadingMuscles = false
    }
    
    private func fetchMuscleGoals() async throws -> [MuscleGoalItem] {
        let response: [MuscleGoalDB] = try await supabase
            .from("user_muscle_and_weight")
            .select()
            .order("muscle", ascending: true)
            .execute()
            .value
        
        return response.map { db in
            MuscleGoalItem(
                id: db.id,
                muscle: db.muscle,
                weight: db.weight,
                enabled: db.enabled ?? true  // Default to true if not present in database
            )
        }
    }
    
    // MARK: - Preferences
    
    /// Fetch preferences from database and update local state
    func refreshPreferences() async {
        isLoadingPreferences = true
        
        do {
            self.preferences = try await fetchPreferences()
            print("✅ Preferences refreshed")
        } catch {
            self.error = error
            print("❌ Error refreshing preferences: \(error)")
        }
        
        isLoadingPreferences = false
    }
    
    private func fetchPreferences() async throws -> [UserPreference] {
        // Get current user ID
        let session = try await supabase.auth.session
        let userId = session.user.id
        
        // Get current timestamp in ISO format for comparison
        let now = ISO8601DateFormatter().string(from: Date())
        
        let response: [UserPreferenceDB] = try await supabase
            .from("preferences")
            .select()
            .eq("user_id", value: userId.uuidString)
            .or("expire_time.is.null,expire_time.gt.\(now)")
            .order("created_at", ascending: false)
            .execute()
            .value
        
        return response.map { db in
            UserPreference(
                id: db.id,
                type: db.type,
                description: db.description,
                userTranscription: db.user_transcription ?? "",
                recommendationsGuidance: db.recommendations_guidance ?? "",
                expireTime: db.expire_time,
                deleteAfterCall: db.delete_after_call ?? false
            )
        }
    }
    
    // MARK: - Local State Updates (Optimistic UI)
    
    /// Update a single category goal in local state (for optimistic UI)
    /// Call this after successfully updating in database
    func updateCategoryGoal(_ goal: CategoryGoalItem) {
        if let index = categoryGoals.firstIndex(where: { $0.id == goal.id }) {
            categoryGoals[index] = goal
        } else {
            categoryGoals.append(goal)
        }
    }
    
    /// Remove a category goal from local state
    func removeCategoryGoal(id: UUID) {
        categoryGoals.removeAll { $0.id == id }
    }
    
    /// Update a single muscle goal in local state (for optimistic UI)
    func updateMuscleGoal(_ goal: MuscleGoalItem) {
        if let index = muscleGoals.firstIndex(where: { $0.id == goal.id }) {
            muscleGoals[index] = goal
        } else {
            muscleGoals.append(goal)
        }
    }
    
    /// Remove a muscle goal from local state
    func removeMuscleGoal(id: UUID) {
        muscleGoals.removeAll { $0.id == id }
    }
    
    /// Update a single preference in local state (for optimistic UI)
    func updatePreference(_ preference: UserPreference) {
        if let index = preferences.firstIndex(where: { $0.id == preference.id }) {
            preferences[index] = preference
        } else {
            preferences.append(preference)
        }
    }
    
    /// Remove a preference from local state
    func removePreference(id: Int) {
        preferences.removeAll { $0.id == id }
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
        try await supabase
            .from("user_locations")
            .delete()
            .eq("id", value: String(id))
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

// MARK: - Database Models

struct CategoryGoalDB: Codable {
    let id: UUID
    let user_id: UUID
    let category: String
    let description: String
    let weight: Double
    let enabled: Bool?  // Optional because it might not exist in the database yet
    let created_at: Date?
    let updated_at: Date?
    
    enum CodingKeys: String, CodingKey {
        case id, user_id, category, description, weight, enabled, created_at, updated_at
    }
}

struct MuscleGoalDB: Codable {
    let id: UUID
    let user_id: UUID
    let muscle: String
    let weight: Double
    let enabled: Bool?  // Optional because it might not exist in the database yet
    let created_at: Date?
    let updated_at: Date?
    
    enum CodingKeys: String, CodingKey {
        case id, user_id, muscle, weight, enabled, created_at, updated_at
    }
}

// MARK: - Category Goal Model

struct CategoryGoalItem: Identifiable, Codable {
    let id: UUID
    var category: String
    var description: String
    var weight: Double
    var enabled: Bool
    
    init(id: UUID = UUID(), category: String, description: String, weight: Double, enabled: Bool = true) {
        self.id = id
        self.category = category
        self.description = description
        self.weight = weight
        self.enabled = enabled
    }
}

// MARK: - Muscle Goal Model

struct MuscleGoalItem: Identifiable, Codable {
    let id: UUID
    var muscle: String
    var weight: Double
    var enabled: Bool
    
    init(id: UUID = UUID(), muscle: String, weight: Double, enabled: Bool = true) {
        self.id = id
        self.muscle = muscle
        self.weight = weight
        self.enabled = enabled
    }
}

// MARK: - User Preference Database Model

struct UserPreferenceDB: Codable {
    let id: Int  // Changed from UUID to Int - preferences table uses integer IDs
    let user_id: UUID
    let type: String
    let description: String
    let user_transcription: String?
    let recommendations_guidance: String?
    let expire_time: Date?
    let delete_after_call: Bool?
    let created_at: Date?
    
    enum CodingKeys: String, CodingKey {
        case id, user_id, type, description, user_transcription, recommendations_guidance, expire_time, delete_after_call, created_at
    }
}

// MARK: - User Preference Model

struct UserPreference: Identifiable, Codable {
    let id: Int  // Changed from UUID to Int to match database
    var type: String
    var description: String
    var userTranscription: String
    var recommendationsGuidance: String
    var expireTime: Date?
    var deleteAfterCall: Bool
    
    init(id: Int, type: String, description: String, userTranscription: String = "", recommendationsGuidance: String = "", expireTime: Date? = nil, deleteAfterCall: Bool = false) {
        self.id = id
        self.type = type
        self.description = description
        self.userTranscription = userTranscription
        self.recommendationsGuidance = recommendationsGuidance
        self.expireTime = expireTime
        self.deleteAfterCall = deleteAfterCall
    }
}

