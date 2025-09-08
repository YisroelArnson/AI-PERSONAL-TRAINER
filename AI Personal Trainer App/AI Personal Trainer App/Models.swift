//
//  Models.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/22/25.
//

import Foundation
import SwiftUI
import Combine
import Supabase

struct UserRow: Decodable {
  let userId: String
  let first_name: String?
  let last_name: String?

  enum CodingKeys: String, CodingKey {
    case userId = "user_id"
    case first_name
    case last_name
  }
}

struct UpdateUserParams: Encodable {
  let first_name: String?
  let last_name: String?

  enum CodingKeys: String, CodingKey {
    case first_name
    case last_name
  }
}

struct BodyStatsRow: Decodable {
  let user_id: String
  let sex: String?
  let dob: String? // ISO date string
  let height_cm: Double?
  let weight_kg: Double?
  let body_fat_pct: Double?
  let created_at: String? // ISO timestamp string
  
  enum CodingKeys: String, CodingKey {
    case user_id
    case sex
    case dob
    case height_cm
    case weight_kg
    case body_fat_pct
    case created_at
  }
}

struct UpdateBodyStatsParams: Encodable {
  let sex: String?
  let dob: String?
  let height_cm: Double?
  let weight_kg: Double?
  let body_fat_pct: Double?
  
  enum CodingKeys: String, CodingKey {
    case sex
    case dob
    case height_cm
    case weight_kg
    case body_fat_pct
  }
}

struct BodyStatsUpsertParams: Encodable {
  let user_id: String
  let sex: String?
  let dob: String?
  let height_cm: Double?
  let weight_kg: Double?
  let body_fat_pct: Double?
  
  enum CodingKeys: String, CodingKey {
    case user_id
    case sex
    case dob
    case height_cm
    case weight_kg
    case body_fat_pct
  }
}

// MARK: - Goals: user_muscle_and_weight

struct UserMuscleAndWeightRow: Decodable {
  let id: String
  let user_id: String
  let muscle: String
  let weight: Double
  let created_at: String?
  let updated_at: String?
  
  enum CodingKeys: String, CodingKey {
    case id
    case user_id
    case muscle
    case weight
    case created_at
    case updated_at
  }
}

struct InsertUserMuscleAndWeightParams: Encodable {
  let user_id: String
  let muscle: String
  let weight: Double
  
  enum CodingKeys: String, CodingKey {
    case user_id
    case muscle
    case weight
  }
}

struct UpdateUserMuscleAndWeightParams: Encodable {
  let muscle: String?
  let weight: Double?
  
  enum CodingKeys: String, CodingKey {
    case muscle
    case weight
  }
}

// MARK: - Goals: user_category_and_weight

struct UserCategoryAndWeightsRow: Decodable {
  let id: String
  let user_id: String
  let category: String
  let units: String
  let description: String
  let enabled: Bool
  let weight: Double
  let created_at: String?
  let updated_at: String?
  
  enum CodingKeys: String, CodingKey {
    case id
    case user_id
    case category
    case units
    case description
    case enabled
    case weight
    case created_at
    case updated_at
  }
}

struct InsertUserCategoryAndWeightsParams: Encodable {
  let user_id: String
  let category: String
  let units: String
  let description: String
  let enabled: Bool
  let weight: Double
  
  enum CodingKeys: String, CodingKey {
    case user_id
    case category
    case units
    case description
    case enabled
    case weight
  }
}

struct UpdateUserCategoryAndWeightsParams: Encodable {
  let category: String?
  let units: String?
  let description: String?
  let enabled: Bool?
  let weight: Double?
  
  enum CodingKeys: String, CodingKey {
    case category
    case units
    case description
    case enabled
    case weight
  }
}

// MARK: - User Locations

struct UserLocationRow: Decodable, Identifiable {
  let id: Int
  let name: String
  let description: String?
  let geo_data: String? // Simplified for now, could be more complex
  let created_at: String?
  let equipment: [String]?
  let user_id: String
  let current_location: Bool
  
  enum CodingKeys: String, CodingKey {
    case id
    case name
    case description
    case geo_data
    case created_at
    case equipment
    case user_id
    case current_location
  }
}

struct InsertUserLocationParams: Encodable {
  let user_id: String
  let name: String
  let description: String?
  let geo_data: String?
  let equipment: [String]?
  let current_location: Bool
  
  enum CodingKeys: String, CodingKey {
    case user_id
    case name
    case description
    case geo_data
    case equipment
    case current_location
  }
}

struct UpdateUserLocationParams: Encodable {
  let name: String?
  let description: String?
  let geo_data: String?
  let equipment: [String]?
  let current_location: Bool?
  
  enum CodingKeys: String, CodingKey {
    case name
    case description
    case geo_data
    case current_location
    case equipment
  }
}

// MARK: - User Preferences

struct UserPreferenceRow: Decodable, Identifiable {
  let id: Int
  let user_id: String?
  let type: String
  let description: String
  let user_transcription: String?
  let recommendations_guidance: String?
  let expire_time: String? // ISO timestamp string
  let delete_after_call: Bool
  let created_at: String? // ISO timestamp string
  
  enum CodingKeys: String, CodingKey {
    case id
    case user_id
    case type
    case description
    case user_transcription
    case recommendations_guidance
    case expire_time
    case delete_after_call
    case created_at
  }
}

struct InsertUserPreferenceParams: Encodable {
  let user_id: String
  let type: String
  let description: String
  let user_transcription: String?
  let recommendations_guidance: String?
  let expire_time: String?
  let delete_after_call: Bool
  
  enum CodingKeys: String, CodingKey {
    case user_id
    case type
    case description
    case user_transcription
    case recommendations_guidance
    case expire_time
    case delete_after_call
  }
}

struct UpdateUserPreferenceParams: Encodable {
  let type: String?
  let description: String?
  let user_transcription: String?
  let recommendations_guidance: String?
  let expire_time: String?
  let delete_after_call: Bool?
  
  enum CodingKeys: String, CodingKey {
    case type
    case description
    case user_transcription
    case recommendations_guidance
    case expire_time
    case delete_after_call
  }
}

// MARK: - User Location Manager

@MainActor
class UserLocationManager: ObservableObject {
    @Published var userLocations: [UserLocationRow] = []

    var currentLocation: UserLocationRow? {
        userLocations.first { $0.current_location }
    }

    func updateLocations(_ locations: [UserLocationRow]) {
        self.userLocations = locations
    }

    func refreshLocations() async {
        do {
            let currentUser = try await supabase.auth.session.user
            print("Refreshing locations for user: \(currentUser.id)")

            let locationRows: [UserLocationRow] = try await supabase
                .from("user_locations")
                .select()
                .eq("user_id", value: currentUser.id)
                .order("created_at", ascending: true)
                .execute()
                .value

            print("Successfully refreshed locations. Count: \(locationRows.count)")
            await MainActor.run {
                updateLocations(locationRows)
            }

        } catch {
            print("Error refreshing locations: \(error)")
            print("Error details: \(String(describing: error))")
        }
    }
}