//
//  WorkoutBottomBar.swift
//  AI Personal Trainer App
//
//  Bottom bar with set completion and AI orb.
//

import SwiftUI

@MainActor
struct WorkoutBottomBar: View {
    @State var workoutStore = WorkoutStore.shared
    @Environment(\.assistantManager) private var assistantManager

    var body: some View {
        VStack(spacing: 10) {
            if let exerciseName = workoutStore.pendingRpeExerciseName {
                rpeQuickCapture(for: exerciseName)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            HStack(spacing: 10) {
                VStack(spacing: 8) {
                    // Set completion button
                    Button {
                        handleDoneTap()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: buttonIcon)
                                .font(.system(size: 16, weight: .medium))
                            Text(buttonLabel)
                                .font(.system(size: 15, weight: .semibold))
                        }
                        .foregroundStyle(AppTheme.Colors.background)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(AppTheme.Colors.accent)
                        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.pill))
                    }
                    .disabled(isSetButtonDisabled)

                    if workoutStore.isLastExercise {
                        Button {
                            handleCompleteWorkoutTap()
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "flag.checkered")
                                    .font(.system(size: 14, weight: .medium))
                                Text("Complete Workout")
                                    .font(.system(size: 14, weight: .semibold))
                            }
                            .foregroundStyle(AppTheme.Colors.primaryText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(AppTheme.Colors.surface)
                            .overlay(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.pill)
                                    .stroke(AppTheme.Colors.highlight, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.pill))
                        }
                    }
                }

                // AI orb
                FloatingAIButton {
                    assistantManager.open()
                }
            }
        }
        .padding(.top, 10)
        .padding(.horizontal, 20)
        .padding(.bottom, 24)
        .animation(AppTheme.Animation.gentle, value: workoutStore.pendingRpeExerciseIndex)
        .task(id: workoutStore.pendingRpeExerciseIndex) {
            guard let pendingIndex = workoutStore.pendingRpeExerciseIndex else { return }
            try? await Task.sleep(nanoseconds: 3_500_000_000)
            if workoutStore.pendingRpeExerciseIndex == pendingIndex {
                workoutStore.dismissPendingRpePrompt()
            }
        }
    }

    private func rpeQuickCapture(for exerciseName: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("How hard was \(exerciseName)?")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
                    .lineLimit(1)
                Spacer()
                Button("Skip") {
                    workoutStore.dismissPendingRpePrompt()
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(AppTheme.Colors.tertiaryText)
            }

            HStack(spacing: 6) {
                rpeOptionButton(label: "Easy", value: 6)
                rpeOptionButton(label: "Solid", value: 7)
                rpeOptionButton(label: "Hard", value: 8)
                rpeOptionButton(label: "Max", value: 9)
            }
        }
        .padding(12)
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
    }

    private func rpeOptionButton(label: String, value: Int) -> some View {
        Button {
            workoutStore.captureExerciseRpe(value)
        } label: {
            Text("\(label) \(value)")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.primaryText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(AppTheme.Colors.highlight)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Button State

    private var buttonLabel: String {
        let completed = workoutStore.completedSetsForCurrentExercise
        let total = workoutStore.totalSetsForCurrentExercise

        // Exercise already fully completed
        if completed >= total {
            if workoutStore.isLastExercise { return "Set Complete" }
            return "Next Exercise"
        }

        return "Complete Set \(completed + 1) of \(total)"
    }

    private var buttonIcon: String {
        let completed = workoutStore.completedSetsForCurrentExercise
        let total = workoutStore.totalSetsForCurrentExercise

        if workoutStore.isLastExercise && completed >= total { return "checkmark.circle.fill" }
        if completed >= total {
            return "forward.fill"
        }
        return "checkmark"
    }

    private var isSetButtonDisabled: Bool {
        let completed = workoutStore.completedSetsForCurrentExercise
        let total = workoutStore.totalSetsForCurrentExercise
        guard total > 0 else { return true }
        return workoutStore.isLastExercise && completed >= total && !workoutStore.allExercisesComplete
    }

    private func handleDoneTap() {
        workoutStore.completeCurrentSet()
    }

    private func handleCompleteWorkoutTap() {
        workoutStore.completeWorkoutFromCurrentState()
    }
}
