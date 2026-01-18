//
//  AgentModels.swift
//  AI Personal Trainer App
//
//  Data models for the AI Assistant chat interface and agent communication.
//

import Foundation

// MARK: - Message Models

/// Represents a chat message in the assistant conversation
struct ChatMessage: Identifiable, Equatable {
    let id: UUID
    let role: MessageRole
    var content: String
    let timestamp: Date

    // Steps associated with this message (for assistant messages during agent processing)
    var steps: [StepItem]

    // Whether this message is still being streamed/constructed
    var isStreaming: Bool

    init(
        id: UUID = UUID(),
        role: MessageRole,
        content: String,
        timestamp: Date = Date(),
        steps: [StepItem] = [],
        isStreaming: Bool = false
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
        self.steps = steps
        self.isStreaming = isStreaming
    }
}

/// The role of a message sender
enum MessageRole: String, Codable {
    case user
    case assistant
}

// MARK: - Step Models (for inline display in message bubbles)

/// Represents a single step in the agent's processing, displayed inline in assistant messages
struct StepItem: Identifiable, Equatable {
    let id: UUID
    let tool: String
    let displayName: String
    var status: ActionStatus
    let timestamp: Date
    let details: String?

    init(
        id: UUID = UUID(),
        tool: String,
        displayName: String,
        status: ActionStatus,
        timestamp: Date = Date(),
        details: String? = nil
    ) {
        self.id = id
        self.tool = tool
        self.displayName = displayName
        self.status = status
        self.timestamp = timestamp
        self.details = details
    }

    /// Creates a human-friendly display name from a tool name (past tense for completed steps)
    static func humanFriendlyName(for tool: String, completed: Bool = false) -> String {
        switch tool {
        // Tool execution steps
        case "fetch_workout_history":
            return completed ? "Fetched workout history" : "Fetching workout history"
        case "fetch_preferences":
            return completed ? "Loaded preferences" : "Loading preferences"
        case "fetch_goals":
            return completed ? "Loaded your goals" : "Loading your goals"
        case "fetch_distribution":
            return completed ? "Analyzed exercise distribution" : "Analyzing exercise distribution"
        case "generate_workout":
            return completed ? "Created workout" : "Creating workout"
        case "log_exercise":
            return completed ? "Logged exercise" : "Logging exercise"
        case "update_preference":
            return completed ? "Updated preference" : "Updating preference"
        case "update_goal":
            return completed ? "Updated goal" : "Updating goal"
        case "message_notify_user":
            return completed ? "Prepared response" : "Preparing response"
        case "message_ask_user":
            return completed ? "Asked question" : "Asking question"
        case "idle":
            return "Done"

        // Knowledge/context loading steps (from initializer agent)
        case "workout_history":
            return completed ? "Loaded workout history" : "Loading workout history"
        case "category_goals":
            return completed ? "Loaded category goals" : "Loading category goals"
        case "muscle_goals":
            return completed ? "Loaded muscle goals" : "Loading muscle goals"
        case "active_preferences":
            return completed ? "Loaded preferences" : "Loading preferences"
        case "user_profile":
            return completed ? "Loaded profile" : "Loading profile"
        case "exercise_distribution":
            return completed ? "Analyzed exercise patterns" : "Analyzing exercise patterns"
        case "user_settings":
            return completed ? "Loaded settings" : "Loading settings"
        case "all_locations":
            return completed ? "Loaded locations" : "Loading locations"
        case "current_workout_session":
            return completed ? "Loaded current workout" : "Loading current workout"

        default:
            // Convert snake_case to Title Case
            let baseName = tool.replacingOccurrences(of: "_", with: " ").capitalized
            return completed ? baseName : baseName + "..."
        }
    }
}

// MARK: - Action Log Models

/// Represents a tool execution in the action log
struct ActionLogItem: Identifiable, Equatable {
    let id: UUID
    let tool: String
    let displayName: String
    let status: ActionStatus
    let timestamp: Date
    let details: String?
    
    init(id: UUID = UUID(), tool: String, displayName: String, status: ActionStatus, timestamp: Date = Date(), details: String? = nil) {
        self.id = id
        self.tool = tool
        self.displayName = displayName
        self.status = status
        self.timestamp = timestamp
        self.details = details
    }
    
    /// Creates a human-friendly display name from a tool name
    static func humanFriendlyName(for tool: String) -> String {
        switch tool {
        case "fetch_workout_history":
            return "Fetching workout history"
        case "fetch_preferences":
            return "Loading preferences"
        case "fetch_goals":
            return "Loading your goals"
        case "fetch_distribution":
            return "Analyzing exercise distribution"
        case "generate_workout":
            return "Creating workout"
        case "log_exercise":
            return "Logging exercise"
        case "update_preference":
            return "Updating preference"
        case "update_goal":
            return "Updating goal"
        case "message_notify_user":
            return "Preparing response"
        case "message_ask_user":
            return "Asking question"
        case "idle":
            return "Done"
        default:
            // Convert snake_case to Title Case
            return tool.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

/// Status of an action/tool execution
enum ActionStatus: String, Equatable {
    case running
    case done
    case failed
}

// MARK: - API Response Models

/// Response from the agent chat endpoint (non-streaming)
struct AgentChatResponse: Decodable {
    let sessionId: String
    let response: AgentChatResponseContent
    let iterations: Int
}

/// Content of the agent chat response
struct AgentChatResponseContent: Decodable {
    let messages: [String]
    let exercises: [StreamingExercise]?
    let question: AgentQuestion?
}

/// A question from the agent requiring user input
struct AgentQuestion: Decodable, Equatable {
    let text: String
    let options: [String]?
}

// MARK: - Streaming Event Models

/// Event types received during SSE streaming
struct AgentStreamEvent: Decodable {
    let type: String
    let data: AgentStreamData?
    let sessionId: String?
    let message: String?  // For error events
    let formatted: String? // Formatted result from tool execution
}

/// Data payload in a stream event
struct AgentStreamData: Decodable {
    let message: String?
    let question: String?
    let options: [String]?
    let tool: String?
    let status: String?
    let exercises: [StreamingExercise]?
    let phase: String?         // For status events: 'start', 'done', 'error'
    let statusMessage: String? // Alias for message in status events
    let formatted: String?     // Formatted result string for display in action log
    let source: String?        // For knowledge events: the data source name
    let displayName: String?   // For knowledge events: human-friendly display name
}

// MARK: - Session Models

/// Represents a chat session with the agent
struct AgentSession: Identifiable, Decodable {
    let id: String
    let userId: String
    let createdAt: Date
    let lastMessageAt: Date?
    let messageCount: Int
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case createdAt = "created_at"
        case lastMessageAt = "last_message_at"
        case messageCount = "message_count"
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        let createdAtString = try container.decode(String.self, forKey: .createdAt)
        createdAt = dateFormatter.date(from: createdAtString) ?? Date()
        
        if let lastMessageString = try container.decodeIfPresent(String.self, forKey: .lastMessageAt) {
            lastMessageAt = dateFormatter.date(from: lastMessageString)
        } else {
            lastMessageAt = nil
        }
        
        messageCount = try container.decodeIfPresent(Int.self, forKey: .messageCount) ?? 0
    }
    
    // Manual initializer for testing/previews
    init(id: String, userId: String, createdAt: Date, lastMessageAt: Date?, messageCount: Int) {
        self.id = id
        self.userId = userId
        self.createdAt = createdAt
        self.lastMessageAt = lastMessageAt
        self.messageCount = messageCount
    }
}

// MARK: - API Request Models

/// Request body for sending a chat message
struct AgentChatRequest: Encodable {
    let message: String
    let sessionId: String?
    let currentWorkout: CurrentWorkoutPayload?
}

/// Payload representing the current workout session state (sent to backend)
struct CurrentWorkoutPayload: Encodable {
    let exercises: [WorkoutExercisePayload]
    let currentIndex: Int
    let totalCompleted: Int
}

/// Individual exercise in the current workout payload
struct WorkoutExercisePayload: Encodable {
    let name: String
    let type: String
    let completed: Bool
    
    // Optional fields based on exercise type
    let sets: Int?
    let reps: [Int]?
    let loadKgEach: [Double]?
    let durationMin: Int?
    let distanceKm: Double?
    let holdDurationSec: [Int]?
    let rounds: Int?
    let totalDurationMin: Int?
    
    enum CodingKeys: String, CodingKey {
        case name, type, completed, sets, reps
        case loadKgEach = "load_kg_each"
        case durationMin = "duration_min"
        case distanceKm = "distance_km"
        case holdDurationSec = "hold_duration_sec"
        case rounds
        case totalDurationMin = "total_duration_min"
    }
}

// MARK: - Sessions List Response

struct AgentSessionsResponse: Decodable {
    let sessions: [AgentSession]
}

// MARK: - Sample Data for Previews

extension ChatMessage {
    static let samples: [ChatMessage] = [
        ChatMessage(role: .user, content: "I want to focus on building strength today"),
        ChatMessage(
            role: .assistant,
            content: "Great choice! Based on your recent workouts, I'll focus on upper body strength since you've been working legs more frequently. Let me put together a workout for you.",
            steps: [
                StepItem(tool: "fetch_workout_history", displayName: "Fetched workout history", status: .done),
                StepItem(tool: "fetch_preferences", displayName: "Loaded preferences", status: .done),
                StepItem(tool: "generate_workout", displayName: "Created workout", status: .done)
            ]
        ),
        ChatMessage(role: .user, content: "Can we include some core work too?"),
        ChatMessage(role: .assistant, content: "Absolutely! I've added some core exercises to round out your session. Here's your personalized workout.")
    ]

    static let streamingSample: ChatMessage = ChatMessage(
        role: .assistant,
        content: "",
        steps: [
            StepItem(tool: "fetch_workout_history", displayName: "Fetched workout history", status: .done),
            StepItem(tool: "fetch_preferences", displayName: "Loading preferences", status: .running)
        ],
        isStreaming: true
    )
}

extension StepItem {
    static let samples: [StepItem] = [
        StepItem(tool: "fetch_workout_history", displayName: "Fetched workout history", status: .done),
        StepItem(tool: "fetch_preferences", displayName: "Loaded preferences", status: .done),
        StepItem(tool: "generate_workout", displayName: "Created workout", status: .done)
    ]
}

extension ActionLogItem {
    static let samples: [ActionLogItem] = [
        ActionLogItem(tool: "fetch_workout_history", displayName: "Fetched last 30 days of workouts", status: .done),
        ActionLogItem(tool: "fetch_preferences", displayName: "Loaded your preferences", status: .done),
        ActionLogItem(tool: "generate_workout", displayName: "Creating workout...", status: .running)
    ]
}
