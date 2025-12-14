//
//  IntervalTimerViewModel.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 12/7/25.
//

import Foundation
import SwiftUI
import Combine
import AudioToolbox

/// ViewModel for managing interval timer state and logic
@MainActor
class IntervalTimerViewModel: ObservableObject {
    // MARK: - Published Properties
    
    /// The interval data for the current exercise
    @Published var intervalData: IntervalTimerData?
    
    /// Current phase index
    @Published var currentPhaseIndex: Int = 0
    
    /// Time remaining in current phase (seconds)
    @Published var timeRemaining: Int = 0
    
    /// Whether the timer is currently running
    @Published var isRunning: Bool = false
    
    /// Whether the timer has been started at least once
    @Published var hasStarted: Bool = false
    
    /// Whether the timer has completed all phases
    @Published var isComplete: Bool = false
    
    /// Loading state for fetching interval data
    @Published var isLoading: Bool = false
    
    /// Error message if something goes wrong
    @Published var error: String?
    
    // MARK: - Computed Properties
    
    /// The current phase being displayed
    var currentPhase: IntervalPhase? {
        guard let data = intervalData,
              currentPhaseIndex < data.phases.count else {
            return nil
        }
        return data.phases[currentPhaseIndex]
    }
    
    /// Progress through the current phase (0.0 to 1.0)
    var phaseProgress: Double {
        guard let phase = currentPhase, phase.duration_sec > 0 else { return 0 }
        return 1.0 - (Double(timeRemaining) / Double(phase.duration_sec))
    }
    
    /// Whether there are more phases after the current one
    var hasNextPhase: Bool {
        guard let data = intervalData else { return false }
        return currentPhaseIndex < data.phases.count - 1
    }
    
    // MARK: - Private Properties
    
    private var timer: Timer?
    private var exerciseStore = ExerciseStore.shared
    private var intervalService = IntervalService.shared
    private var userSettings = UserSettings.shared
    
    /// The exercise ID this timer is associated with
    private var exerciseId: UUID?
    
    /// Track which sets have been completed via the timer
    private var timerCompletedSets: Set<Int> = []
    
    /// Track the last set number we were working on (to detect set completion)
    private var lastWorkingSetNumber: Int?
    
    // MARK: - Callbacks
    
    /// Called when a set is completed via the timer (for auto-complete feature)
    var onSetCompleted: ((Int) -> Void)?
    
    /// Called when the entire interval timer completes
    var onTimerComplete: (() -> Void)?
    
    // MARK: - Initialization
    
    init() {}
    
    // MARK: - Public Methods
    
    /// Load interval data for an exercise
    /// - Parameters:
    ///   - exercise: The exercise to load intervals for
    ///   - exerciseId: The UUID of the exercise (for set tracking)
    func loadIntervals(for exercise: UIExercise, exerciseId: UUID) async {
        self.exerciseId = exerciseId
        isLoading = true
        error = nil
        
        // Reset state
        reset()
        
        do {
            let data = try await intervalService.fetchIntervals(for: exercise)
            intervalData = data
            
            // Set initial time remaining to first phase duration
            if let firstPhase = data.phases.first {
                timeRemaining = firstPhase.duration_sec
            }
            
            print("⏱️ IntervalTimerViewModel: Loaded \(data.phases.count) phases")
        } catch {
            self.error = error.localizedDescription
            print("❌ IntervalTimerViewModel: Failed to load intervals - \(error)")
        }
        
        isLoading = false
    }
    
    /// Start or resume the timer
    func start() {
        guard intervalData != nil, !isComplete else { return }
        
        isRunning = true
        hasStarted = true
        
        // Track the current working set if this is a work phase
        if let phase = currentPhase, phase.phase_type == .work || phase.phase_type == .hold {
            lastWorkingSetNumber = phase.set_number
        }
        
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.tick()
        }
        
        print("▶️ Timer started")
    }
    
    /// Pause the timer
    func pause() {
        isRunning = false
        timer?.invalidate()
        timer = nil
        
        print("⏸️ Timer paused")
    }
    
    /// Toggle between play and pause
    func toggle() {
        if isRunning {
            pause()
        } else {
            start()
        }
    }
    
    /// Reset the timer to the beginning
    func reset() {
        pause()
        currentPhaseIndex = 0
        hasStarted = false
        isComplete = false
        timerCompletedSets = []
        lastWorkingSetNumber = nil
        
        if let firstPhase = intervalData?.phases.first {
            timeRemaining = firstPhase.duration_sec
        } else {
            timeRemaining = 0
        }
        
        print("🔄 Timer reset")
    }
    
    /// Skip to the next phase
    func skipToNextPhase() {
        guard hasNextPhase else {
            completeTimer()
            return
        }
        
        // Note: We don't auto-complete sets when skipping (per user preference)
        advancePhase()
    }
    
    /// Skip to a specific phase
    func skipToPhase(_ index: Int) {
        guard let data = intervalData,
              index >= 0 && index < data.phases.count else {
            return
        }
        
        currentPhaseIndex = index
        timeRemaining = data.phases[index].duration_sec
        
        // Update last working set
        let phase = data.phases[index]
        if phase.phase_type == .work || phase.phase_type == .hold {
            lastWorkingSetNumber = phase.set_number
        }
    }
    
    // MARK: - Private Methods
    
    /// Called every second when timer is running
    private func tick() {
        guard timeRemaining > 0 else {
            advancePhase()
            return
        }
        
        timeRemaining -= 1
        
        // Play feedback at specific moments
        if timeRemaining == 3 {
            // 3-2-1 countdown feedback
            playTickFeedback()
        } else if timeRemaining == 0 {
            // Phase complete
            advancePhase()
        }
    }
    
    /// Advance to the next phase
    private func advancePhase() {
        guard let data = intervalData else { return }
        
        let previousPhase = currentPhase
        
        // Check for set completion - if we were on a work phase and moving to rest
        if let prevPhase = previousPhase,
           let setNumber = prevPhase.set_number,
           (prevPhase.phase_type == .work || prevPhase.phase_type == .hold) {
            
            // Check if next phase is rest (or we're at the end of a set)
            let nextIndex = currentPhaseIndex + 1
            let nextPhase = nextIndex < data.phases.count ? data.phases[nextIndex] : nil
            
            // Auto-complete set if:
            // 1. Moving from work/hold to rest
            // 2. Or moving to a different set number
            // 3. Or reaching the end
            let shouldCompleteSet = nextPhase?.phase_type == .rest ||
                                    nextPhase?.set_number != setNumber ||
                                    nextPhase == nil
            
            if shouldCompleteSet && !timerCompletedSets.contains(setNumber) {
                completeSet(setNumber)
            }
        }
        
        // Advance to next phase
        if currentPhaseIndex < data.phases.count - 1 {
            currentPhaseIndex += 1
            timeRemaining = data.phases[currentPhaseIndex].duration_sec
            
            // Update last working set
            if let phase = currentPhase,
               (phase.phase_type == .work || phase.phase_type == .hold) {
                lastWorkingSetNumber = phase.set_number
            }
            
            // Play phase transition feedback
            playPhaseFeedback()
            
            print("➡️ Advanced to phase \(currentPhaseIndex + 1)/\(data.phases.count)")
        } else {
            // Timer complete
            completeTimer()
        }
    }
    
    /// Mark a set as completed via the timer
    private func completeSet(_ setNumber: Int) {
        guard let exerciseId = exerciseId else { return }
        
        timerCompletedSets.insert(setNumber)
        
        // Convert to 0-indexed for the store
        let setIndex = setNumber - 1
        
        // Get current completed sets and add this one
        var completedSets = exerciseStore.completedSetsPerExercise[exerciseId] ?? []
        completedSets.insert(setIndex)
        exerciseStore.updateCompletedSets(exerciseId: exerciseId, sets: completedSets)
        
        // Notify callback
        onSetCompleted?(setIndex)
        
        print("✅ Auto-completed set \(setNumber) (index \(setIndex))")
    }
    
    /// Called when all phases are complete
    private func completeTimer() {
        pause()
        isComplete = true
        
        // Play completion feedback
        playCompletionFeedback()
        
        onTimerComplete?()
        
        print("🏁 Timer complete!")
    }
    
    // MARK: - Feedback
    
    /// Play haptic/audio feedback for countdown tick
    private func playTickFeedback() {
        if userSettings.isIntervalHapticEnabled {
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()
        }
    }
    
    /// Play haptic/audio feedback for phase transitions
    private func playPhaseFeedback() {
        if userSettings.isIntervalHapticEnabled {
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
        }
        
        if userSettings.isIntervalAudioEnabled {
            AudioServicesPlaySystemSound(1057) // Short tick sound
        }
    }
    
    /// Play haptic/audio feedback for timer completion
    private func playCompletionFeedback() {
        if userSettings.isIntervalHapticEnabled {
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        }
        
        if userSettings.isIntervalAudioEnabled {
            AudioServicesPlaySystemSound(1025) // Success sound
        }
    }
    
    // MARK: - Cleanup
    
    deinit {
        timer?.invalidate()
    }
}


