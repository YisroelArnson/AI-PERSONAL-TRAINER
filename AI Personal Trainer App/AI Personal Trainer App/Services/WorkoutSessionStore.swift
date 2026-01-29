import Foundation
import SwiftUI

@MainActor
final class WorkoutSessionStore: ObservableObject {
    static let shared = WorkoutSessionStore()

    @Published var activeSession: WorkoutSession?
    @Published var workoutInstance: WorkoutInstance?
    @Published var summary: WorkoutSessionSummary?
    @Published var isGenerating: Bool = false
    @Published var isCompleting: Bool = false
    @Published var errorMessage: String?

    private let apiService = APIService()
    private let exerciseStore = ExerciseStore.shared
    private let sessionIdKey = "ActiveWorkoutSessionId"

    private init() {
        restoreSessionIfNeeded()
    }

    var hasActiveWorkout: Bool {
        return activeSession != nil && workoutInstance != nil
    }

    func restoreSessionIfNeeded() {
        guard let sessionId = UserDefaults.standard.string(forKey: sessionIdKey) else { return }
        Task {
            do {
                let detail = try await apiService.fetchWorkoutSession(sessionId: sessionId)
                await MainActor.run {
                    if detail.session.status == "in_progress" {
                        self.activeSession = detail.session
                        self.workoutInstance = detail.instance
                        if let instance = detail.instance {
                            self.applyWorkoutInstance(instance, preserveProgress: true)
                        }
                    } else {
                        self.activeSession = nil
                        self.workoutInstance = nil
                        UserDefaults.standard.removeObject(forKey: self.sessionIdKey)
                    }
                }
            } catch {
                UserDefaults.standard.removeObject(forKey: sessionIdKey)
            }
        }
    }

    func startSession(
        intent: String,
        requestText: String? = nil,
        timeAvailableMin: Int? = nil,
        readiness: WorkoutReadiness? = nil,
        equipment: [String]? = nil,
        coachMode: String? = nil
    ) async {
        isGenerating = true
        errorMessage = nil
        summary = nil

        do {
            let sessionResponse = try await apiService.createOrResumeWorkoutSession(forceNew: true, coachMode: coachMode)
            let session = sessionResponse.session

            let request = WorkoutGenerateRequest(
                intent: intent,
                requestText: requestText,
                timeAvailableMin: timeAvailableMin,
                equipment: equipment,
                readiness: readiness,
                coachMode: coachMode
            )

            let instanceResponse = try await apiService.generateWorkoutInstance(sessionId: session.id, request: request)

            activeSession = session
            workoutInstance = instanceResponse.instance
            UserDefaults.standard.set(session.id, forKey: sessionIdKey)

            applyWorkoutInstance(instanceResponse.instance, preserveProgress: false)
        } catch {
            errorMessage = error.localizedDescription
        }

        isGenerating = false
    }

    func applyAction(actionType: String, payload: [String: CodableValue]) async {
        guard let sessionId = activeSession?.id else { return }
        do {
            let response = try await apiService.sendWorkoutAction(sessionId: sessionId, actionType: actionType, payload: payload)
            if let instance = response.instance {
                workoutInstance = instance
                applyWorkoutInstance(instance, preserveProgress: true)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logExerciseCompletion(index: Int, exercise: UIExercise, completedSets: Int) async {
        let payload: [String: CodableValue] = [
            "index": .int(index),
            "exercise_name": .string(exercise.exercise_name),
            "completed_sets": .int(completedSets)
        ]
        await applyAction(actionType: "log_set_result", payload: payload)
    }

    func completeSession(reflection: WorkoutReflection, logPayload: WorkoutLogPayload) async {
        guard let sessionId = activeSession?.id else { return }
        isCompleting = true

        do {
            let summaryResponse = try await apiService.completeWorkoutSession(sessionId: sessionId, reflection: reflection, log: logPayload)
            summary = summaryResponse.summary
            activeSession = nil
            workoutInstance = nil
            exerciseStore.clearExercises()
            UserDefaults.standard.removeObject(forKey: sessionIdKey)
        } catch {
            errorMessage = error.localizedDescription
        }

        isCompleting = false
    }

    private func applyWorkoutInstance(_ instance: WorkoutInstance, preserveProgress: Bool) {
        let existingExercises = exerciseStore.exercises
        let mappedExercises: [UIExercise] = instance.exercises.enumerated().map { index, exercise in
            if preserveProgress, index < existingExercises.count {
                let existingId = existingExercises[index].id
                return UIExercise(
                    id: existingId,
                    exercise_name: exercise.exercise_name,
                    type: exercise.type,
                    duration_min: exercise.duration_min,
                    reps: exercise.reps,
                    load_kg_each: exercise.load_kg_each,
                    load_unit: exercise.load_unit,
                    sets: exercise.sets,
                    distance_km: exercise.distance_km,
                    distance_unit: exercise.distance_unit,
                    rounds: exercise.rounds,
                    work_sec: exercise.work_sec,
                    total_duration_min: exercise.total_duration_min,
                    muscles_utilized: exercise.muscles_utilized,
                    rest_seconds: exercise.rest_seconds,
                    target_pace: exercise.target_pace,
                    hold_duration_sec: exercise.hold_duration_sec,
                    goals_addressed: exercise.goals_addressed,
                    reasoning: exercise.reasoning,
                    equipment: exercise.equipment,
                    exercise_description: exercise.exercise_description,
                    group: exercise.group
                )
            }
            return exercise
        }

        if !preserveProgress {
            exerciseStore.clearExercises()
            mappedExercises.forEach { exerciseStore.addExercise($0) }
            exerciseStore.markFetchStarted()
            return
        }

        exerciseStore.exercises = mappedExercises
        if mappedExercises.isEmpty {
            exerciseStore.setCurrentIndex(0)
        } else {
            exerciseStore.setCurrentIndex(min(exerciseStore.currentExerciseIndex, mappedExercises.count - 1))
        }
        let validIds = Set(mappedExercises.map { $0.id })
        exerciseStore.completedExerciseIds = exerciseStore.completedExerciseIds.filter { validIds.contains($0) }
        exerciseStore.completedSetsPerExercise = exerciseStore.completedSetsPerExercise.filter { validIds.contains($0.key) }
        exerciseStore.adjustedRepsPerExercise = exerciseStore.adjustedRepsPerExercise.filter { validIds.contains($0.key) }
        exerciseStore.adjustedWeightsPerExercise = exerciseStore.adjustedWeightsPerExercise.filter { validIds.contains($0.key) }
        exerciseStore.saveState()
    }
}
