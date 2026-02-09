import Foundation

/// Local storage for all intake answers before authentication.
/// Saved to UserDefaults and synced to backend after auth completes.
struct LocalIntakeData: Codable, Equatable {
    // About You
    var name: String?
    var birthday: Date?
    var gender: String?

    // Goals
    var goals: String?
    var timeline: String?

    // Training History
    var experienceLevel: String?
    var frequency: String?
    var currentRoutine: String?
    var pastAttempts: String?
    var hobbySports: String?

    // Body Metrics
    var heightInches: Int?
    var weightLbs: Double?
    var bodyComp: String?

    // Fitness Baseline
    var physicalBaseline: String?
    var mobility: String?

    // Health
    var injuries: String?
    var healthNuances: String?
    var supplements: String?

    // Lifestyle
    var activityLevel: String?
    var sleep: String?
    var nutrition: String?

    // Equipment
    var environment: String?

    // Preferences
    var movementPrefs: String?
    var coachingStyle: String?

    // Almost Done
    var anythingElse: String?

    // MARK: - Field Access by String Key

    /// Get a string field value by field name
    func stringValue(for field: String) -> String? {
        switch field {
        case "name": return name
        case "gender": return gender
        case "goals": return goals
        case "timeline": return timeline
        case "experienceLevel": return experienceLevel
        case "frequency": return frequency
        case "currentRoutine": return currentRoutine
        case "pastAttempts": return pastAttempts
        case "hobbySports": return hobbySports
        case "bodyComp": return bodyComp
        case "physicalBaseline": return physicalBaseline
        case "mobility": return mobility
        case "injuries": return injuries
        case "healthNuances": return healthNuances
        case "supplements": return supplements
        case "activityLevel": return activityLevel
        case "sleep": return sleep
        case "nutrition": return nutrition
        case "environment": return environment
        case "movementPrefs": return movementPrefs
        case "coachingStyle": return coachingStyle
        case "anythingElse": return anythingElse
        default: return nil
        }
    }

    /// Set a string field value by field name
    mutating func setStringValue(_ value: String?, for field: String) {
        switch field {
        case "name": name = value
        case "gender": gender = value
        case "goals": goals = value
        case "timeline": timeline = value
        case "experienceLevel": experienceLevel = value
        case "frequency": frequency = value
        case "currentRoutine": currentRoutine = value
        case "pastAttempts": pastAttempts = value
        case "hobbySports": hobbySports = value
        case "bodyComp": bodyComp = value
        case "physicalBaseline": physicalBaseline = value
        case "mobility": mobility = value
        case "injuries": injuries = value
        case "healthNuances": healthNuances = value
        case "supplements": supplements = value
        case "activityLevel": activityLevel = value
        case "sleep": sleep = value
        case "nutrition": nutrition = value
        case "environment": environment = value
        case "movementPrefs": movementPrefs = value
        case "coachingStyle": coachingStyle = value
        case "anythingElse": anythingElse = value
        default: break
        }
    }

    /// Check if a field has a value (non-nil and non-empty for strings)
    func hasValue(for field: String) -> Bool {
        switch field {
        case "birthday": return birthday != nil
        case "heightInches": return heightInches != nil
        case "weightLbs": return weightLbs != nil
        case "_complete": return true
        default:
            guard let str = stringValue(for: field) else { return false }
            return !str.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    /// Convert to dictionary for backend submission
    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [:]
        if let name = name { dict["name"] = name }
        if let birthday = birthday {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]
            dict["birthday"] = formatter.string(from: birthday)
        }
        if let gender = gender { dict["gender"] = gender }
        if let goals = goals { dict["goals"] = goals }
        if let timeline = timeline { dict["timeline"] = timeline }
        if let experienceLevel = experienceLevel { dict["experience_level"] = experienceLevel }
        if let frequency = frequency { dict["frequency"] = frequency }
        if let currentRoutine = currentRoutine { dict["current_routine"] = currentRoutine }
        if let pastAttempts = pastAttempts { dict["past_attempts"] = pastAttempts }
        if let hobbySports = hobbySports { dict["hobby_sports"] = hobbySports }
        if let heightInches = heightInches { dict["height_inches"] = heightInches }
        if let weightLbs = weightLbs { dict["weight_lbs"] = weightLbs }
        if let bodyComp = bodyComp { dict["body_comp"] = bodyComp }
        if let physicalBaseline = physicalBaseline { dict["physical_baseline"] = physicalBaseline }
        if let mobility = mobility { dict["mobility"] = mobility }
        if let injuries = injuries { dict["injuries"] = injuries }
        if let healthNuances = healthNuances { dict["health_nuances"] = healthNuances }
        if let supplements = supplements { dict["supplements"] = supplements }
        if let activityLevel = activityLevel { dict["activity_level"] = activityLevel }
        if let sleep = sleep { dict["sleep"] = sleep }
        if let nutrition = nutrition { dict["nutrition"] = nutrition }
        if let environment = environment { dict["environment"] = environment }
        if let movementPrefs = movementPrefs { dict["movement_prefs"] = movementPrefs }
        if let coachingStyle = coachingStyle { dict["coaching_style"] = coachingStyle }
        if let anythingElse = anythingElse { dict["anything_else"] = anythingElse }
        return dict
    }
}
