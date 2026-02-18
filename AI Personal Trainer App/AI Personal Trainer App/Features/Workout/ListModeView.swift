//
//  ListModeView.swift
//  AI Personal Trainer App
//
//  Compact checklist of all exercises in the workout.
//

import SwiftUI

@MainActor
struct ListModeView: View {
    @State var workoutStore = WorkoutStore.shared

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 6) {
                    ForEach(Array(workoutStore.exercises.enumerated()), id: \.element.id) { index, exercise in
                        ExerciseRow(
                            index: index,
                            exercise: exercise,
                            isCurrent: index == workoutStore.currentExerciseIndex,
                            isCompleted: isExerciseCompleted(exercise),
                            isSkipped: workoutStore.skippedExercises.contains(exercise.id)
                        )
                        .id(index)
                        .onTapGesture {
                            workoutStore.jumpToExercise(at: index)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 8)
            }
            .onChange(of: workoutStore.currentExerciseIndex) { _, newIndex in
                withAnimation(AppTheme.Animation.slow) {
                    proxy.scrollTo(newIndex, anchor: .center)
                }
            }
        }
    }

    private func isExerciseCompleted(_ exercise: UIExercise) -> Bool {
        let sets = exercise.sets ?? 1
        let completed = workoutStore.completedSets[exercise.id]?.count ?? 0
        return completed >= sets
    }
}

// MARK: - Exercise Row

private struct ExerciseRow: View {
    let index: Int
    let exercise: UIExercise
    let isCurrent: Bool
    let isCompleted: Bool
    let isSkipped: Bool

    var body: some View {
        HStack(spacing: 12) {
            // Index circle
            Text("\(index + 1)")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isCurrent ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryText)
                .frame(width: 24, height: 24)
                .background(isCurrent ? AppTheme.Colors.highlight : AppTheme.Colors.surface)
                .clipShape(Circle())

            // Exercise info
            VStack(alignment: .leading, spacing: 2) {
                Text(exercise.exercise_name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.primaryText)

                Text(detailLine)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
            }

            Spacer()

            // Checkmark for completed
            if isCompleted || isSkipped {
                Image(systemName: isSkipped ? "forward.fill" : "checkmark")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
        .opacity(isCompleted || isSkipped ? 0.6 : 1.0)
    }

    private var detailLine: String {
        switch exercise.type {
        case "reps":
            return repsDetail
        case "hold":
            return holdDetail
        case "duration":
            return durationDetail
        case "intervals":
            return intervalsDetail
        default:
            return ""
        }
    }

    private var repsDetail: String {
        let sets = exercise.sets ?? 1
        let repsText: String
        if let reps = exercise.reps, !reps.isEmpty {
            let minR = reps.min() ?? 0
            let maxR = reps.max() ?? 0
            repsText = minR == maxR ? "\(minR)" : "\(minR)-\(maxR)"
        } else {
            repsText = "?"
        }

        var result = "\(sets) x \(repsText) reps"

        if let loads = exercise.load_each, let load = loads.first, load > 0 {
            let unit = exercise.load_unit ?? "kg"
            let formatted = load.truncatingRemainder(dividingBy: 1) == 0
                ? String(format: "%.0f", load)
                : String(format: "%.1f", load)
            result += " \u{00B7} \(formatted) \(unit)"
        }

        return result
    }

    private var holdDetail: String {
        let sets = exercise.sets ?? 1
        if let durations = exercise.hold_duration_sec, let first = durations.first {
            return "\(sets) x \(first)s hold"
        }
        return "\(sets) sets"
    }

    private var durationDetail: String {
        var parts: [String] = []
        if let dur = exercise.duration_min {
            parts.append("\(dur) min")
        }
        if let dist = exercise.distance_km {
            let unit = exercise.distance_unit ?? "km"
            parts.append(String(format: "%.1f %@", dist, unit))
        }
        return parts.joined(separator: " \u{00B7} ")
    }

    private var intervalsDetail: String {
        var parts: [String] = []
        if let rounds = exercise.rounds {
            parts.append("\(rounds) rounds")
        }
        if let work = exercise.work_sec {
            parts.append("\(work)s work")
        }
        return parts.joined(separator: " \u{00B7} ")
    }
}
