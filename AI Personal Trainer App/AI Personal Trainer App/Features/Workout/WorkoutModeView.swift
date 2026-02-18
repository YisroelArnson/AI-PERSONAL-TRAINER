//
//  WorkoutModeView.swift
//  AI Personal Trainer App
//
//  Swipeable exercise-by-exercise view using TabView with page style.
//  Each exercise renders as a flowing paragraph with inline stat highlights.
//

import SwiftUI

// MARK: - Workout Mode View

@MainActor
struct WorkoutModeView: View {
    @State var workoutStore = WorkoutStore.shared

    var body: some View {
        TabView(selection: $workoutStore.currentExerciseIndex) {
            ForEach(Array(workoutStore.exercises.enumerated()), id: \.element.id) { index, exercise in
                ExercisePageView(exercise: exercise, store: workoutStore)
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .animation(AppTheme.Animation.slow, value: workoutStore.currentExerciseIndex)
    }
}

// MARK: - Exercise Page

@MainActor
private struct ExercisePageView: View {
    let exercise: UIExercise
    let store: WorkoutStore

    private var currentSet: Int {
        let completed = store.completedSets[exercise.id]?.count ?? 0
        let total = exercise.sets ?? 1
        return min(completed + 1, total)
    }

    private var totalSets: Int {
        exercise.sets ?? 1
    }

    var body: some View {
        ScrollView {
            Text(exerciseAttributedString)
                .lineSpacing(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: - Build Paragraph as AttributedString

    private var exerciseAttributedString: AttributedString {
        switch exercise.type {
        case "reps":
            return repsParagraph
        case "hold":
            return holdParagraph
        case "duration":
            return durationParagraph
        case "intervals":
            return intervalsParagraph
        default:
            return repsParagraph
        }
    }

    // MARK: - Reps

    private var repsParagraph: AttributedString {
        var s = chip(exercise.exercise_name)
        s += plain(" \u{2014} Set ")
        s += chip("\(currentSet)")
        s += plain(" of ")
        s += chip("\(totalSets)")
        s += plain(". Aim for ")
        s += chip(repsLabel)

        if let loadText = loadLabel {
            s += plain(" at ")
            s += chip(loadText)
        }
        s += plain(".")

        if let rest = exercise.rest_seconds, rest > 0 {
            s += plain(" Rest ")
            s += chip("\(rest)s")
            s += plain(" between sets.")
        }

        if let desc = exercise.exercise_description, !desc.isEmpty {
            s += plain(" \(desc)")
        }

        return s
    }

    // MARK: - Hold

    private var holdParagraph: AttributedString {
        var s = chip(exercise.exercise_name)
        s += plain(" \u{2014} Set ")
        s += chip("\(currentSet)")
        s += plain(" of ")
        s += chip("\(totalSets)")
        s += plain(". Hold for ")
        s += chip("\(holdDurationLabel) seconds")
        s += plain(".")

        if let rest = exercise.rest_seconds, rest > 0 {
            s += plain(" Rest ")
            s += chip("\(rest)s")
            s += plain(" between sets.")
        }

        if let desc = exercise.exercise_description, !desc.isEmpty {
            s += plain(" \(desc)")
        }

        return s
    }

    // MARK: - Duration

    private var durationParagraph: AttributedString {
        var s = chip(exercise.exercise_name)

        if let dur = exercise.duration_min {
            s += plain(" \u{2014} ")
            s += chip("\(dur) minutes")
        }
        s += plain(".")

        if let dist = exercise.distance_km {
            let unit = exercise.distance_unit ?? "km"
            s += plain(" Distance: ")
            s += chip(String(format: "%.1f %@", dist, unit))
            s += plain(".")
        }

        if let pace = exercise.target_pace, !pace.isEmpty {
            s += plain(" Target pace: ")
            s += chip(pace)
            s += plain(".")
        }

        if let desc = exercise.exercise_description, !desc.isEmpty {
            s += plain(" \(desc)")
        }

        return s
    }

    // MARK: - Intervals

    private var intervalsParagraph: AttributedString {
        let currentRound = currentSet
        let totalRounds = exercise.rounds ?? totalSets

        var s = chip(exercise.exercise_name)
        s += plain(" \u{2014} Round ")
        s += chip("\(currentRound)")
        s += plain(" of ")
        s += chip("\(totalRounds)")
        s += plain(".")

        if let work = exercise.work_sec {
            s += plain(" ")
            s += chip("\(work)s work")
            if let rest = exercise.rest_seconds, rest > 0 {
                s += plain(", ")
                s += chip("\(rest)s rest")
            }
            s += plain(".")
        }

        if let desc = exercise.exercise_description, !desc.isEmpty {
            s += plain(" \(desc)")
        }

        return s
    }

    // MARK: - Text Primitives

    private func chip(_ string: String) -> AttributedString {
        var attr = AttributedString(" \(string) ")
        attr.font = .system(size: 18, weight: .semibold)
        attr.backgroundColor = AppTheme.Colors.highlight
        return attr
    }

    private func plain(_ string: String) -> AttributedString {
        var attr = AttributedString(string)
        attr.font = .system(size: 18, weight: .regular)
        return attr
    }

    // MARK: - Value Helpers

    private var repsLabel: String {
        guard let reps = exercise.reps, !reps.isEmpty else { return "?" }
        let setIdx = currentSet - 1
        if reps.count == 1 {
            return "\(reps[0]) reps"
        }
        let minReps = reps.min() ?? reps[0]
        let maxReps = reps.max() ?? reps[0]
        if minReps == maxReps {
            return "\(minReps) reps"
        }
        if setIdx < reps.count {
            return "\(reps[setIdx]) reps"
        }
        return "\(minReps)-\(maxReps) reps"
    }

    private var loadLabel: String? {
        guard let loads = exercise.load_each, !loads.isEmpty else { return nil }
        let unit = exercise.load_unit ?? "kg"
        let setIdx = currentSet - 1
        let load = setIdx < loads.count ? loads[setIdx] : loads.last ?? 0
        if load == 0 { return nil }
        let formatted = load.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", load)
            : String(format: "%.1f", load)
        return "\(formatted) \(unit)"
    }

    private var holdDurationLabel: String {
        guard let durations = exercise.hold_duration_sec, !durations.isEmpty else { return "?" }
        let setIdx = currentSet - 1
        if setIdx < durations.count {
            return "\(durations[setIdx])"
        }
        return "\(durations.last ?? 0)"
    }
}
