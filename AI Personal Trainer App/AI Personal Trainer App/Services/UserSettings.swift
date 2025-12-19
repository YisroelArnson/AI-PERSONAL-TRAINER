//
//  UserSettings.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/2/25.
//

import Foundation
import SwiftUI

/// Unit options for weight
enum WeightUnit: String, CaseIterable {
    case lbs = "lbs"
    case kg = "kg"
    
    var displayName: String {
        switch self {
        case .lbs: return "Pounds (lbs)"
        case .kg: return "Kilograms (kg)"
        }
    }
}

/// Unit options for distance
enum DistanceUnit: String, CaseIterable {
    case miles = "miles"
    case km = "km"
    
    var displayName: String {
        switch self {
        case .miles: return "Miles"
        case .km: return "Kilometers (km)"
        }
    }
}

/// Centralized settings storage for user preferences
@MainActor
class UserSettings: ObservableObject {
    static let shared = UserSettings()
    
    private let apiService = APIService()
    
    // MARK: - Published Settings (Local)
    
    @AppStorage("isAutoDetectLocationEnabled")
    var isAutoDetectLocationEnabled: Bool = false
    
    @AppStorage("isAutoRefreshExercisesEnabled")
    var isAutoRefreshExercisesEnabled: Bool = false
    
    @AppStorage("autoRefreshExercisesHours")
    var autoRefreshExercisesHours: Int = 12  // Default 12 hours
    
    // MARK: - Unit Preferences (Synced with Database)
    
    @Published var weightUnit: WeightUnit = .lbs
    @Published var distanceUnit: DistanceUnit = .miles
    @Published var isLoadingSettings: Bool = false
    @Published var settingsError: String? = nil
    
    // Local cache keys for offline support
    @AppStorage("cachedWeightUnit")
    private var cachedWeightUnit: String = "lbs"
    
    @AppStorage("cachedDistanceUnit")
    private var cachedDistanceUnit: String = "miles"
    
    private init() {
        // Load cached values initially
        weightUnit = WeightUnit(rawValue: cachedWeightUnit) ?? .lbs
        distanceUnit = DistanceUnit(rawValue: cachedDistanceUnit) ?? .miles
    }
    
    // MARK: - Database Sync Methods
    
    /// Fetch settings from the database
    func fetchSettings() async {
        isLoadingSettings = true
        settingsError = nil
        
        do {
            let settings = try await apiService.fetchUserSettings()
            
            // Update local state
            if let weight = WeightUnit(rawValue: settings.weight_unit) {
                weightUnit = weight
                cachedWeightUnit = weight.rawValue
            }
            
            if let distance = DistanceUnit(rawValue: settings.distance_unit) {
                distanceUnit = distance
                cachedDistanceUnit = distance.rawValue
            }
            
            print("✅ Successfully fetched user settings: weight=\(weightUnit.rawValue), distance=\(distanceUnit.rawValue)")
            
        } catch {
            print("❌ Failed to fetch user settings: \(error.localizedDescription)")
            settingsError = error.localizedDescription
            // Keep using cached/default values on error
        }
        
        isLoadingSettings = false
    }
    
    /// Update weight unit and sync to database
    func updateWeightUnit(_ unit: WeightUnit) async {
        let previousUnit = weightUnit
        weightUnit = unit
        cachedWeightUnit = unit.rawValue
        
        do {
            _ = try await apiService.updateUserSettings(weightUnit: unit.rawValue, distanceUnit: nil)
            print("✅ Successfully updated weight unit to: \(unit.rawValue)")
        } catch {
            print("❌ Failed to update weight unit: \(error.localizedDescription)")
            // Revert on failure
            weightUnit = previousUnit
            cachedWeightUnit = previousUnit.rawValue
            settingsError = error.localizedDescription
        }
    }
    
    /// Update distance unit and sync to database
    func updateDistanceUnit(_ unit: DistanceUnit) async {
        let previousUnit = distanceUnit
        distanceUnit = unit
        cachedDistanceUnit = unit.rawValue
        
        do {
            _ = try await apiService.updateUserSettings(weightUnit: nil, distanceUnit: unit.rawValue)
            print("✅ Successfully updated distance unit to: \(unit.rawValue)")
        } catch {
            print("❌ Failed to update distance unit: \(error.localizedDescription)")
            // Revert on failure
            distanceUnit = previousUnit
            cachedDistanceUnit = previousUnit.rawValue
            settingsError = error.localizedDescription
        }
    }
    
    // MARK: - Helper Methods
    
    /// Format a weight value with the current unit
    func formatWeight(_ value: Double) -> String {
        let formatted = value.truncatingRemainder(dividingBy: 1) == 0 
            ? String(format: "%.0f", value) 
            : String(format: "%.1f", value)
        return "\(formatted) \(weightUnit.rawValue)"
    }
    
    /// Format a distance value with the current unit
    func formatDistance(_ value: Double) -> String {
        let formatted = value.truncatingRemainder(dividingBy: 1) == 0 
            ? String(format: "%.0f", value) 
            : String(format: "%.2f", value)
        return "\(formatted) \(distanceUnit.rawValue)"
    }
    
    /// Get the weight unit label
    var weightUnitLabel: String {
        weightUnit.rawValue
    }
    
    /// Get the distance unit label
    var distanceUnitLabel: String {
        distanceUnit.rawValue
    }
    
    /// Reset all settings to defaults
    func resetToDefaults() {
        isAutoDetectLocationEnabled = false
        isAutoRefreshExercisesEnabled = false
        autoRefreshExercisesHours = 12
        weightUnit = .lbs
        distanceUnit = .miles
        cachedWeightUnit = "lbs"
        cachedDistanceUnit = "miles"
    }
}
