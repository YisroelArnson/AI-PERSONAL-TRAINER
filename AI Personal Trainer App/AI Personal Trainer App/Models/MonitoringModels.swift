import Foundation

struct MeasurementResponse: Codable {
    let success: Bool
    let measurement: Measurement
}

struct MeasurementsListResponse: Codable {
    let success: Bool
    let measurements: [Measurement]
}

struct Measurement: Codable, Identifiable {
    let id: String
    let measurementType: String
    let value: Double
    let unit: String
    let measuredAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case measurementType = "measurement_type"
        case value
        case unit
        case measuredAt = "measured_at"
    }
}

struct MemoryResponse: Codable {
    let success: Bool
    let items: [MemoryItem]?
    let memory: MemoryItem?
}

struct MemoryItem: Codable, Identifiable {
    let id: String
    let memoryType: String
    let key: String
    let valueJson: [String: CodableValue]
    let status: String

    enum CodingKeys: String, CodingKey {
        case id
        case memoryType = "memory_type"
        case key
        case valueJson = "value_json"
        case status
    }
}

struct CalendarEventsResponse: Codable {
    let success: Bool
    let events: [CalendarEvent]
}

struct CalendarEventResponse: Codable {
    let success: Bool
    let event: CalendarEvent
}

struct CalendarCheckRegenerateResponse: Codable {
    let success: Bool
    let regenerated: Bool
    let events: [CalendarEvent]?
    let reason: String?
}

struct CalendarEvent: Codable, Identifiable {
    let id: String
    let eventType: String
    let startAt: Date
    let endAt: Date?
    let title: String?
    let status: String
    let notes: String?
    let userModified: Bool?
    let linkedProgramId: String?
    let linkedProgramVersion: Int?
    let plannedSession: PlannedSession?

    enum CodingKeys: String, CodingKey {
        case id
        case eventType = "event_type"
        case startAt = "start_at"
        case endAt = "end_at"
        case title
        case status
        case notes
        case userModified = "user_modified"
        case linkedProgramId = "linked_program_id"
        case linkedProgramVersion = "linked_program_version"
        case plannedSession = "planned_session"
    }
}

struct PlannedSession: Codable, Identifiable {
    let id: String
    let intentJson: [String: CodableValue]

    enum CodingKeys: String, CodingKey {
        case id
        case intentJson = "intent_json"
    }
}

struct WeeklyReportsResponse: Codable {
    let success: Bool
    let reports: [WeeklyReport]
}

struct WeeklyReportResponse: Codable {
    let success: Bool
    let report: WeeklyReport
}

struct WeeklyReport: Codable {
    let weekStart: String
    let sessionsCompleted: Int
    let wins: [String]
    let focus: String

    enum CodingKeys: String, CodingKey {
        case weekStart = "week_start"
        case sessionsCompleted = "sessions_completed"
        case wins
        case focus
    }
}
