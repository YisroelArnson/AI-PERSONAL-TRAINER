//
//  WorkoutBottomBar.swift
//  AI Personal Trainer App
//
//  Bottom bar with edit, set completion with fill progress, and AI orb.
//

import SwiftUI

@MainActor
struct WorkoutBottomBar: View {
    @State var workoutStore = WorkoutStore.shared
    @Environment(\.assistantManager) private var assistantManager

    var body: some View {
        HStack(spacing: 10) {
            // Edit button
            Button {
                workoutStore.showMidWorkoutActions = true
            } label: {
                Image(systemName: "pencil")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .frame(width: 44, height: 44)
                    .background(AppTheme.Colors.surface)
                    .clipShape(Circle())
            }

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

            // AI orb
            FloatingAIButton {
                assistantManager.open()
            }
        }
        .padding(.top, 10)
        .padding(.horizontal, 20)
        .padding(.bottom, 24)
        .sheet(isPresented: $workoutStore.showMidWorkoutActions) {
            MidWorkoutActionSheet()
        }
    }

    // MARK: - Button State

    private var buttonLabel: String {
        let completed = workoutStore.completedSetsForCurrentExercise
        let total = workoutStore.totalSetsForCurrentExercise

        // Exercise already fully completed
        if completed >= total {
            if workoutStore.isLastExercise {
                return "Finish Workout"
            }
            return "Next Exercise"
        }

        // Last set of last exercise
        if workoutStore.isLastExercise && completed >= total - 1 {
            return "Finish Workout"
        }

        return "Complete Set \(completed + 1) of \(total)"
    }

    private var buttonIcon: String {
        let completed = workoutStore.completedSetsForCurrentExercise
        let total = workoutStore.totalSetsForCurrentExercise

        if workoutStore.isLastExercise && completed >= total - 1 {
            return "flag.checkered"
        }
        if completed >= total {
            return "forward.fill"
        }
        return "checkmark"
    }

    private func handleDoneTap() {
        workoutStore.completeCurrentSet()
    }
}
