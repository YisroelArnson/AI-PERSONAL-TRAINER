//
//  IntervalTimer.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 12/7/25.
//

import Foundation
import SwiftUI

// MARK: - Phase Type

/// Types of phases that can occur in an interval timer
enum PhaseType: String, Codable, CaseIterable {
    case work       // Active exercise (reps, cardio, etc.)
    case rest       // Rest between sets/rounds
    case hold       // Isometric holds, stretches
    case transition // Moving between exercises in circuits
    case warmup     // Preparation phase
    case cooldown   // Wind-down phase
    
    /// Color associated with this phase type
    var color: Color {
        switch self {
        case .work:
            return AppTheme.Colors.warmAccent
        case .rest:
            return AppTheme.Colors.accentSecondary
        case .hold:
            return AppTheme.Colors.isometric
        case .transition:
            return AppTheme.Colors.secondaryText
        case .warmup:
            return AppTheme.Colors.yoga
        case .cooldown:
            return AppTheme.Colors.flexibility
        }
    }
    
    /// Whether this phase type indicates active work (vs rest/recovery)
    var isActive: Bool {
        switch self {
        case .work, .hold:
            return true
        case .rest, .transition, .warmup, .cooldown:
            return false
        }
    }
}

// MARK: - Interval Phase

/// A single phase in the interval timer sequence
struct IntervalPhase: Codable, Identifiable {
    let id: UUID
    let phase_type: PhaseType
    let duration_sec: Int
    let cue: String
    let detail: String?
    let countdown: Bool
    let set_number: Int?
    
    enum CodingKeys: String, CodingKey {
        case phase_type
        case duration_sec
        case cue
        case detail
        case countdown
        case set_number
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = UUID()
        self.phase_type = try container.decode(PhaseType.self, forKey: .phase_type)
        self.duration_sec = try container.decode(Int.self, forKey: .duration_sec)
        self.cue = try container.decode(String.self, forKey: .cue)
        self.detail = try container.decodeIfPresent(String.self, forKey: .detail)
        self.countdown = try container.decode(Bool.self, forKey: .countdown)
        self.set_number = try container.decodeIfPresent(Int.self, forKey: .set_number)
    }
    
    init(
        phase_type: PhaseType,
        duration_sec: Int,
        cue: String,
        detail: String? = nil,
        countdown: Bool = true,
        set_number: Int? = nil
    ) {
        self.id = UUID()
        self.phase_type = phase_type
        self.duration_sec = duration_sec
        self.cue = cue
        self.detail = detail
        self.countdown = countdown
        self.set_number = set_number
    }
}

// MARK: - Interval Timer Data

/// Complete interval timer data for an exercise
struct IntervalTimerData: Codable, Identifiable {
    let id: UUID
    let exercise_name: String
    let exercise_type: String
    let total_duration_sec: Int
    let phases: [IntervalPhase]
    
    enum CodingKeys: String, CodingKey {
        case exercise_name
        case exercise_type
        case total_duration_sec
        case phases
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = UUID()
        self.exercise_name = try container.decode(String.self, forKey: .exercise_name)
        self.exercise_type = try container.decode(String.self, forKey: .exercise_type)
        self.total_duration_sec = try container.decode(Int.self, forKey: .total_duration_sec)
        self.phases = try container.decode([IntervalPhase].self, forKey: .phases)
    }
    
    init(
        exercise_name: String,
        exercise_type: String,
        total_duration_sec: Int,
        phases: [IntervalPhase]
    ) {
        self.id = UUID()
        self.exercise_name = exercise_name
        self.exercise_type = exercise_type
        self.total_duration_sec = total_duration_sec
        self.phases = phases
    }
    
    /// Get the current phase at a given elapsed time
    func phase(at elapsedSeconds: Int) -> IntervalPhase? {
        var accumulated = 0
        for phase in phases {
            accumulated += phase.duration_sec
            if elapsedSeconds < accumulated {
                return phase
            }
        }
        return phases.last
    }
    
    /// Get the phase index at a given elapsed time
    func phaseIndex(at elapsedSeconds: Int) -> Int {
        var accumulated = 0
        for (index, phase) in phases.enumerated() {
            accumulated += phase.duration_sec
            if elapsedSeconds < accumulated {
                return index
            }
        }
        return phases.count - 1
    }
    
    /// Format total duration as mm:ss
    var formattedTotalDuration: String {
        let minutes = total_duration_sec / 60
        let seconds = total_duration_sec % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - API Response Models

/// Response from single exercise interval endpoint
struct IntervalResponse: Codable {
    let success: Bool
    let data: IntervalTimerData?
    let timestamp: String
    let error: String?
    let details: String?
}

/// Response from batch interval endpoint
struct BatchIntervalResponse: Codable {
    let success: Bool
    let data: BatchIntervalData?
    let metadata: BatchIntervalMetadata?
    let timestamp: String
    let error: String?
}

struct BatchIntervalData: Codable {
    let intervals: [IntervalTimerData]
    let failed: [FailedInterval]?
}

struct FailedInterval: Codable {
    let exercise_name: String
    let error: String
}

struct BatchIntervalMetadata: Codable {
    let total: Int
    let successful: Int
    let failed: Int
}


