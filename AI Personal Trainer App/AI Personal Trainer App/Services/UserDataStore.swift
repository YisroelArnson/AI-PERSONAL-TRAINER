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
    
    @Published var isLoadingAll: Bool = false
    @Published var isLoadingCategories: Bool = false
    @Published var isLoadingMuscles: Bool = false
    @Published var isLoadingPreferences: Bool = false
    
    @Published var lastFetchedAt: Date?
    @Published var error: Error?
    
    // MARK: - Singleton
    
    static let shared = UserDataStore()
    
    private init() {}
    
    // MARK: - Initial Data Loading
    
    /// Load all user data on app launch
    func loadAllUserData() async {
        isLoadingAll = true
        error = nil
        
        do {
            // Load all data in parallel for faster loading
            async let categoryGoalsTask = fetchCategoryGoals()
            async let muscleGoalsTask = fetchMuscleGoals()
            async let preferencesTask = fetchPreferences()
            
            let (categories, muscles, prefs) = try await (categoryGoalsTask, muscleGoalsTask, preferencesTask)
            
            self.categoryGoals = categories
            self.muscleGoals = muscles
            self.preferences = prefs
            self.lastFetchedAt = Date()
       
            print("✅ All user data loaded successfully")

        } catch {
            self.error = error
            print("❌ Error loading user data: \(error)")
        }
        
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

