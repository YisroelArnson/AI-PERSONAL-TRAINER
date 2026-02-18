//
//  WorkoutStore.swift
//  AI Personal Trainer App
//
//  Single source of truth for workout state. Manages the full session lifecycle
//  from pre-workout → generation → execution → completion.
//  Replaces the deleted ExerciseStore + WorkoutSessionStore.
//

import SwiftUI

// MARK: - Enums

enum WorkoutSessionStatus: Equatable {
    case idle
    case preWorkout
    case generating
    case active
    case completing
    case completed
}

enum WorkoutPresentationMode: String, Codable {
    case workout
    case list
}

enum PreWorkoutPage: Equatable {
    case intent
    case review
}

// MARK: - Persistence Model

struct ActiveWorkoutState: Codable {
    let session: WorkoutSession
    let instance: WorkoutInstance

    var currentExerciseIndex: Int
    var completedSets: [String: [Int]]  // UUID string -> sorted set indices
    var skippedExercises: [String]       // UUID strings
    var painFlaggedExercises: [String]   // UUID strings

    var presentationMode: WorkoutPresentationMode

    var accumulatedSeconds: TimeInterval
    var lastActiveAt: Date
}

// MARK: - WorkoutStore

@Observable
@MainActor
class WorkoutStore {
    static let shared = WorkoutStore()

    // MARK: - Session State

    var currentSession: WorkoutSession?
    var currentInstance: WorkoutInstance?
    var sessionStatus: WorkoutSessionStatus = .idle
    var summary: WorkoutSessionSummary?
    var errorMessage: String?

    // MARK: - Exercise Execution State

    var currentExerciseIndex: Int = 0
    var completedSets: [UUID: Set<Int>] = [:] // exerciseId -> completed set indices
    var skippedExercises: Set<UUID> = []
    var painFlaggedExercises: Set<UUID> = []

    // MARK: - View State

    var presentationMode: WorkoutPresentationMode = .workout
    var showMidWorkoutActions: Bool = false
    var showPreWorkoutSheet: Bool = false

    // MARK: - Pre-Workout Inputs

    var selectedLocation: Location?
    var preWorkoutTitle: String = ""
    var preWorkoutDescription: String = ""
    var preWorkoutDurationMin: Int = 45

    var originalTitle: String = ""
    var originalDescription: String = ""
    var originalDurationMin: Int = 45

    var intentText: String = ""
    var isLoadingIntentPlan: Bool = false
    var intentPlanError: String?

    var preWorkoutPage: PreWorkoutPage = .intent
    var arrivedFromIntentPage: Bool = false
    var currentCalendarEventId: String?
    var currentPlannedSessionId: String?
    var latestGeneratedAdHocEventId: String?
    var timeAvailableMin: Int = 60

    // MARK: - Timing

    var accumulatedSeconds: TimeInterval = 0
    var currentSegmentStart: Date?

    // MARK: - Dependencies

    private let apiService = APIService()

    private init() {}

    // MARK: - Computed Properties

    var exercises: [UIExercise] {
        currentInstance?.exercises ?? []
    }

    var currentExercise: UIExercise? {
        guard currentExerciseIndex >= 0, currentExerciseIndex < exercises.count else { return nil }
        return exercises[currentExerciseIndex]
    }

    var totalExercises: Int {
        exercises.count
    }

    var totalSetsForCurrentExercise: Int {
        guard let exercise = currentExercise else { return 0 }
        return exercise.sets ?? 1
    }

    var completedSetsForCurrentExercise: Int {
        guard let exercise = currentExercise else { return 0 }
        return completedSets[exercise.id]?.count ?? 0
    }

    var isLastSetForCurrentExercise: Bool {
        completedSetsForCurrentExercise >= totalSetsForCurrentExercise - 1
    }

    var isLastExercise: Bool {
        currentExerciseIndex >= exercises.count - 1
    }

    var allExercisesComplete: Bool {
        guard !exercises.isEmpty else { return false }
        for exercise in exercises {
            if skippedExercises.contains(exercise.id) { continue }
            let sets = exercise.sets ?? 1
            let completed = completedSets[exercise.id]?.count ?? 0
            if completed < sets { return false }
        }
        return true
    }

    var totalCompletedExercises: Int {
        exercises.filter { exercise in
            let sets = exercise.sets ?? 1
            let completed = completedSets[exercise.id]?.count ?? 0
            return completed >= sets || skippedExercises.contains(exercise.id)
        }.count
    }

    var totalCompletedSets: Int {
        completedSets.values.reduce(0) { $0 + $1.count }
    }

    var elapsedMinutes: Int {
        var total = accumulatedSeconds
        if let segmentStart = currentSegmentStart {
            total += Date().timeIntervalSince(segmentStart)
        }
        return Int(total / 60)
    }

    /// The label for the Done button depending on context
    var doneButtonLabel: String {
        if allExercisesComplete || (isLastExercise && isLastSetForCurrentExercise) {
            return "Finish Workout"
        }
        if isLastSetForCurrentExercise {
            return "Next Exercise"
        }
        return "Done"
    }

    // MARK: - Session Lifecycle

    /// Start a planned session from a calendar event
    func startPlannedSession(calendarEvent: CalendarEvent) {
        reset()
        sessionStatus = .preWorkout
        currentCalendarEventId = calendarEvent.id
        currentPlannedSessionId = calendarEvent.plannedSession?.id

        let intent = calendarEvent.plannedSession?.intentJson ?? [:]
        preWorkoutTitle = intent["focus"]?.stringValue ?? calendarEvent.title ?? "Today's Workout"
        preWorkoutDescription = intent["notes"]?.stringValue ?? ""
        preWorkoutDurationMin = max(10, min(120, intent["duration_min"]?.intValue ?? 45))
        timeAvailableMin = preWorkoutDurationMin

        originalTitle = preWorkoutTitle
        originalDescription = preWorkoutDescription
        originalDurationMin = preWorkoutDurationMin

        selectedLocation = UserDataStore.shared.currentLocation
        preWorkoutPage = .review
        arrivedFromIntentPage = false
        showPreWorkoutSheet = true
    }

    /// Start a custom workout intent flow
    func startNewWorkout() {
        reset()
        sessionStatus = .preWorkout
        selectedLocation = UserDataStore.shared.currentLocation
        preWorkoutPage = .intent
        arrivedFromIntentPage = false
        showPreWorkoutSheet = true
    }

    /// Backwards-compatible alias while callers migrate
    func startCustomSession() {
        startNewWorkout()
    }

    func submitIntent() async {
        guard !intentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard !isLoadingIntentPlan else { return }

        arrivedFromIntentPage = true
        isLoadingIntentPlan = true
        intentPlanError = nil

        withAnimation(AppTheme.Animation.slow) {
            preWorkoutPage = .review
        }

        do {
            let planResponse = try await apiService.planIntent(intentText: intentText)

            if !showPreWorkoutSheet {
                isLoadingIntentPlan = false
                return
            }

            preWorkoutTitle = planResponse.plan.focus
            preWorkoutDescription = planResponse.plan.notes
            preWorkoutDurationMin = max(10, min(120, planResponse.plan.durationMin))
            timeAvailableMin = preWorkoutDurationMin

            originalTitle = preWorkoutTitle
            originalDescription = preWorkoutDescription
            originalDurationMin = preWorkoutDurationMin

            isLoadingIntentPlan = false
            intentPlanError = nil
        } catch {
            if !showPreWorkoutSheet {
                isLoadingIntentPlan = false
                return
            }
            isLoadingIntentPlan = false
            intentPlanError = "Something went wrong. Please try again."
        }
    }

    func retryIntentPlan() async {
        await submitIntent()
    }

    private func cleaned(_ value: String, fallback: String = "") -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }

    private func codableIntentPayload(title: String, description: String, duration: Int) -> [String: CodableValue] {
        [
            "focus": .string(cleaned(title, fallback: "Custom Workout")),
            "notes": .string(cleaned(description)),
            "duration_min": .int(max(10, min(120, duration)))
        ]
    }

    private func editedIntentPayload() -> [String: CodableValue]? {
        var edited: [String: CodableValue] = [:]

        let currentTitle = cleaned(preWorkoutTitle, fallback: "Custom Workout")
        let originalCleanTitle = cleaned(originalTitle, fallback: "Custom Workout")
        if currentTitle != originalCleanTitle {
            edited["focus"] = .string(currentTitle)
        }
        let currentDescription = cleaned(preWorkoutDescription)
        let originalCleanDescription = cleaned(originalDescription)
        if currentDescription != originalCleanDescription {
            edited["notes"] = .string(currentDescription)
        }
        let clampedDuration = max(10, min(120, preWorkoutDurationMin))
        let clampedOriginalDuration = max(10, min(120, originalDurationMin))
        if clampedDuration != clampedOriginalDuration {
            edited["duration_min"] = .int(clampedDuration)
        }

        return edited.isEmpty ? nil : edited
    }

    /// Generate the workout after pre-workout inputs confirmed
    func generateWorkout() async {
        sessionStatus = .generating
        errorMessage = nil

        // Dismiss the pre-workout sheet first so fullScreenCover presents cleanly
        showPreWorkoutSheet = false

        // Small delay to let the sheet dismiss animation complete
        try? await Task.sleep(nanoseconds: 300_000_000)

        isWorkoutViewPresented = true

        let effectiveTitle = cleaned(preWorkoutTitle, fallback: "Custom Workout")
        let effectiveDescription = cleaned(preWorkoutDescription)
        let effectiveDuration = max(10, min(120, preWorkoutDurationMin))
        let originalFocus = cleaned(originalTitle, fallback: effectiveTitle)
        let originalNotes = cleaned(originalDescription, fallback: effectiveDescription)
        let originalDuration = originalDurationMin == 0 ? effectiveDuration : max(10, min(120, originalDurationMin))
        let originalIntentPayload = codableIntentPayload(
            title: originalFocus,
            description: originalNotes,
            duration: originalDuration
        )
        let editedPayload = editedIntentPayload()
        var adHocEventIdForRollback: String?

        do {
            if arrivedFromIntentPage {
                let event = try await apiService.createCalendarEvent(
                    eventType: "workout",
                    startAt: Date(),
                    title: originalFocus,
                    status: "scheduled",
                    intentJson: originalIntentPayload
                )
                currentCalendarEventId = event.id
                currentPlannedSessionId = event.plannedSession?.id
                latestGeneratedAdHocEventId = event.id
                adHocEventIdForRollback = event.id
            }

            // 1. Create or resume session
            let sessionResponse = try await apiService.createOrResumeWorkoutSession(
                forceNew: true,
                calendarEventId: currentCalendarEventId,
                plannedSessionId: currentPlannedSessionId
            )
            currentSession = sessionResponse.session

            // 2. Build generate request
            let equipment = selectedLocation?.equipment.map { $0.name }
            let intent = arrivedFromIntentPage ? "user_specified" : "planned"
            let request = WorkoutGenerateRequest(
                intent: intent,
                requestText: arrivedFromIntentPage ? cleaned(intentText) : nil,
                timeAvailableMin: effectiveDuration,
                equipment: equipment,
                plannedIntentOriginal: originalIntentPayload,
                plannedIntentEdited: editedPayload,
                coachMode: nil
            )

            // 3. Generate workout instance
            let instanceResponse = try await apiService.generateWorkoutInstance(
                sessionId: currentSession!.id,
                request: request
            )
            currentInstance = instanceResponse.instance

            // 4. Transition to active
            sessionStatus = .active
            accumulatedSeconds = 0
            currentSegmentStart = Date()
            timeAvailableMin = effectiveDuration

        } catch {
            if let eventId = adHocEventIdForRollback {
                try? await apiService.deleteCalendarEvent(eventId: eventId, cascadePlanned: true)
                currentCalendarEventId = nil
                currentPlannedSessionId = nil
                latestGeneratedAdHocEventId = nil
            }
            currentSession = nil
            currentInstance = nil
            errorMessage = "Failed to generate workout. Please try again."
            sessionStatus = .preWorkout
            isWorkoutViewPresented = false
            showPreWorkoutSheet = true
            print("Workout generation failed: \(error)")
        }
    }

    // MARK: - Exercise Execution

    func completeCurrentSet() {
        guard let exercise = currentExercise else { return }
        let totalSets = exercise.sets ?? 1
        let completedCount = completedSets[exercise.id]?.count ?? 0

        // Already done — advance instead of over-counting
        if completedCount >= totalSets {
            if !isLastExercise {
                advanceToNextExercise()
            } else if allExercisesComplete {
                sessionStatus = .completing
            }
            return
        }

        if completedSets[exercise.id] == nil {
            completedSets[exercise.id] = []
        }
        completedSets[exercise.id]?.insert(completedCount)

        let newCompleted = completedSets[exercise.id]?.count ?? 0
        if newCompleted >= totalSets {
            if !isLastExercise {
                advanceToNextExercise()
            }
            if allExercisesComplete {
                sessionStatus = .completing
            }
        }
    }

    func advanceToNextExercise() {
        var nextIndex = currentExerciseIndex + 1
        // Skip over already-skipped exercises
        while nextIndex < exercises.count && skippedExercises.contains(exercises[nextIndex].id) {
            nextIndex += 1
        }
        if nextIndex < exercises.count {
            currentExerciseIndex = nextIndex
        }
    }

    func jumpToExercise(at index: Int) {
        guard index >= 0, index < exercises.count else { return }
        currentExerciseIndex = index
        presentationMode = .workout
    }

    func skipExercise() {
        guard let exercise = currentExercise else { return }
        skippedExercises.insert(exercise.id)

        if isLastExercise || allExercisesComplete {
            sessionStatus = .completing
        } else {
            advanceToNextExercise()
        }
    }

    // MARK: - Mid-Workout Actions

    func flagPain() async {
        guard let session = currentSession, let exercise = currentExercise else { return }
        painFlaggedExercises.insert(exercise.id)
        inFlightActionCount += 1
        defer { inFlightActionCount -= 1 }

        do {
            let payload: [String: CodableValue] = [
                "exercise_id": .string(exercise.id.uuidString),
                "exercise_name": .string(exercise.exercise_name)
            ]
            let response = try await apiService.sendWorkoutAction(
                sessionId: session.id,
                actionType: "flag_pain",
                payload: payload
            )
            if let updatedInstance = response.instance {
                currentInstance = updatedInstance
            }
        } catch {
            print("Pain flag failed: \(error)")
        }
    }

    func swapExercise() async {
        guard let session = currentSession, let exercise = currentExercise else { return }
        inFlightActionCount += 1
        defer { inFlightActionCount -= 1 }

        do {
            let payload: [String: CodableValue] = [
                "exercise_id": .string(exercise.id.uuidString),
                "exercise_name": .string(exercise.exercise_name)
            ]
            let response = try await apiService.sendWorkoutAction(
                sessionId: session.id,
                actionType: "swap_exercise",
                payload: payload
            )
            if let updatedInstance = response.instance {
                currentInstance = updatedInstance
            }
        } catch {
            errorMessage = "Failed to swap exercise."
            print("Swap exercise failed: \(error)")
        }
    }

    func adjustDifficulty() async {
        guard let session = currentSession, let exercise = currentExercise else { return }
        inFlightActionCount += 1
        defer { inFlightActionCount -= 1 }

        do {
            let payload: [String: CodableValue] = [
                "exercise_id": .string(exercise.id.uuidString),
                "exercise_name": .string(exercise.exercise_name)
            ]
            let response = try await apiService.sendWorkoutAction(
                sessionId: session.id,
                actionType: "adjust_prescription",
                payload: payload
            )
            if let updatedInstance = response.instance {
                currentInstance = updatedInstance
            }
        } catch {
            errorMessage = "Failed to adjust difficulty."
            print("Adjust difficulty failed: \(error)")
        }
    }

    func timeScale(targetMinutes: Int) async {
        guard let session = currentSession else { return }
        inFlightActionCount += 1
        defer { inFlightActionCount -= 1 }

        do {
            let payload: [String: CodableValue] = [
                "target_duration_min": .int(targetMinutes)
            ]
            let response = try await apiService.sendWorkoutAction(
                sessionId: session.id,
                actionType: "time_scale",
                payload: payload
            )
            if let updatedInstance = response.instance {
                currentInstance = updatedInstance
            }
        } catch {
            errorMessage = "Failed to adjust workout duration."
            print("Time scale failed: \(error)")
        }
    }

    // MARK: - Completion

    func completeWorkout(notes: String?) async {
        guard let session = currentSession else { return }

        let reflection = WorkoutReflection(
            rpe: nil,
            rir: nil,
            enjoyment: nil,
            pain: painFlaggedExercises.isEmpty ? nil : "Flagged \(painFlaggedExercises.count) exercise(s)",
            notes: notes
        )

        let log = WorkoutLogPayload(
            exercisesCompleted: totalCompletedExercises,
            setsCompleted: totalCompletedSets,
            totalDurationMin: elapsedMinutes
        )

        do {
            let response = try await apiService.completeWorkoutSession(
                sessionId: session.id,
                reflection: reflection,
                log: log
            )
            summary = response.summary
            sessionStatus = .completed
        } catch {
            // Server may have expired the session — still show completion with local data
            print("Complete workout failed: \(error)")
            summary = WorkoutSessionSummary(
                title: currentInstance?.title ?? "Workout",
                completion: WorkoutCompletion(
                    exercises: totalCompletedExercises,
                    totalSets: totalCompletedSets
                ),
                overallRpe: nil,
                painNotes: nil,
                wins: [],
                nextSessionFocus: ""
            )
            sessionStatus = .completed
        }
    }

    // MARK: - Agent Integration (temporary stubs for Phase 3 refactor)

    /// Get current workout context for agent conversations
    func getCurrentWorkoutPayload() -> CurrentWorkoutPayload? {
        guard !exercises.isEmpty else { return nil }
        let exercisePayloads = exercises.map { ex in
            WorkoutExercisePayload(
                name: ex.exercise_name,
                type: ex.type,
                completed: completedSets[ex.id]?.count ?? 0 >= (ex.sets ?? 1),
                sets: ex.sets,
                reps: ex.reps,
                loadEach: ex.load_each,
                loadUnit: ex.load_unit,
                holdSec: ex.hold_duration_sec,
                durationMin: ex.duration_min.map { Double($0) },
                distance: ex.distance_km,
                distanceUnit: ex.distance_unit,
                rounds: ex.rounds,
                workSec: ex.work_sec,
                restSec: ex.rest_seconds
            )
        }
        return CurrentWorkoutPayload(
            exercises: exercisePayloads,
            currentIndex: currentExerciseIndex,
            totalCompleted: totalCompletedExercises
        )
    }

    /// Load exercises from an agent artifact (no-op stub until Phase 3)
    func loadFromArtifact(_ artifact: Artifact) {
        // Phase 3 will unify agent workouts with the generation service
        print("WorkoutStore.loadFromArtifact called — Phase 3 will implement unified flow")
    }

    // MARK: - Persistence

    private static let persistenceURL: URL = {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return docs.appendingPathComponent("active_workout.json")
    }()

    private static let expiryInterval: TimeInterval = 6 * 60 * 60 // 6 hours

    var hasActivePersistedWorkout: Bool {
        sessionStatus == .active && currentInstance != nil
    }

    func persist() {
        guard sessionStatus == .active,
              let session = currentSession,
              let instance = currentInstance else { return }

        // Snapshot accumulated time including current segment
        var totalSeconds = accumulatedSeconds
        if let segmentStart = currentSegmentStart {
            totalSeconds += Date().timeIntervalSince(segmentStart)
        }

        let state = ActiveWorkoutState(
            session: session,
            instance: instance,
            currentExerciseIndex: currentExerciseIndex,
            completedSets: completedSets.reduce(into: [:]) { result, pair in
                result[pair.key.uuidString] = Array(pair.value).sorted()
            },
            skippedExercises: skippedExercises.map { $0.uuidString },
            painFlaggedExercises: painFlaggedExercises.map { $0.uuidString },
            presentationMode: presentationMode,
            accumulatedSeconds: totalSeconds,
            lastActiveAt: Date()
        )

        do {
            let data = try JSONEncoder().encode(state)
            try data.write(to: Self.persistenceURL, options: .atomic)
        } catch {
            print("WorkoutStore: Failed to persist state: \(error)")
        }
    }

    func loadPersistedState() -> Bool {
        guard FileManager.default.fileExists(atPath: Self.persistenceURL.path) else { return false }

        do {
            let data = try Data(contentsOf: Self.persistenceURL)
            let state = try JSONDecoder().decode(ActiveWorkoutState.self, from: data)

            // Check expiry
            if Date().timeIntervalSince(state.lastActiveAt) > Self.expiryInterval {
                discardPersistedState()
                return false
            }

            // Restore state
            currentSession = state.session
            currentInstance = state.instance
            sessionStatus = .active

            currentExerciseIndex = state.currentExerciseIndex
            completedSets = state.completedSets.reduce(into: [:]) { result, pair in
                if let uuid = UUID(uuidString: pair.key) {
                    result[uuid] = Set(pair.value)
                }
            }
            skippedExercises = Set(state.skippedExercises.compactMap { UUID(uuidString: $0) })
            painFlaggedExercises = Set(state.painFlaggedExercises.compactMap { UUID(uuidString: $0) })

            presentationMode = state.presentationMode
            accumulatedSeconds = state.accumulatedSeconds
            currentSegmentStart = nil // Timer is paused until resumeWorkout()

            return true
        } catch {
            print("WorkoutStore: Failed to load persisted state: \(error)")
            discardPersistedState()
            return false
        }
    }

    func discardPersistedState() {
        try? FileManager.default.removeItem(at: Self.persistenceURL)
    }

    // MARK: - Timer Control

    func pauseTimer() {
        if let segmentStart = currentSegmentStart {
            accumulatedSeconds += Date().timeIntervalSince(segmentStart)
            currentSegmentStart = nil
        }
    }

    func resumeTimer() {
        currentSegmentStart = Date()
    }

    // MARK: - In-Flight Action Tracking

    var inFlightActionCount: Int = 0

    func waitForInFlightActions(timeout: TimeInterval = 3.0) async {
        let deadline = Date().addingTimeInterval(timeout)
        while inFlightActionCount > 0 && Date() < deadline {
            try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
        }
    }

    // MARK: - Suspend / Resume

    var isWorkoutViewPresented: Bool = false

    func suspendWorkout() async {
        await waitForInFlightActions()
        pauseTimer()
        showMidWorkoutActions = false
        persist()
        isWorkoutViewPresented = false
    }

    func resumeWorkout() {
        resumeTimer()
        isWorkoutViewPresented = true
    }

    // MARK: - Reset

    func reset() {
        currentSession = nil
        currentInstance = nil
        sessionStatus = .idle
        summary = nil
        errorMessage = nil

        currentExerciseIndex = 0
        completedSets = [:]
        skippedExercises = []
        painFlaggedExercises = []

        presentationMode = .workout
        showMidWorkoutActions = false
        showPreWorkoutSheet = false

        selectedLocation = nil
        preWorkoutTitle = ""
        preWorkoutDescription = ""
        preWorkoutDurationMin = 45
        originalTitle = ""
        originalDescription = ""
        originalDurationMin = 45
        intentText = ""
        isLoadingIntentPlan = false
        intentPlanError = nil
        preWorkoutPage = .intent
        arrivedFromIntentPage = false
        currentCalendarEventId = nil
        currentPlannedSessionId = nil
        latestGeneratedAdHocEventId = nil
        timeAvailableMin = 60

        accumulatedSeconds = 0
        currentSegmentStart = nil
        inFlightActionCount = 0
        isWorkoutViewPresented = false
        discardPersistedState()
    }
}
