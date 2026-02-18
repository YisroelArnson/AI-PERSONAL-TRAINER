//
//  MidWorkoutActionSheet.swift
//  AI Personal Trainer App
//
//  Action menu for modifying the workout in progress.
//

import SwiftUI

struct MidWorkoutActionSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var workoutStore = WorkoutStore.shared
    @State private var isLoading = false

    var body: some View {
        VStack(spacing: 4) {
            // Title
            Text("Actions")
                .font(AppTheme.Typography.screenTitle)
                .foregroundStyle(AppTheme.Colors.primaryText)
                .padding(.top, 24)
                .padding(.bottom, 16)

            // Action rows
            VStack(spacing: 4) {
                actionRow(
                    icon: "arrow.triangle.2.circlepath",
                    title: "Swap Exercise",
                    subtitle: "Replace with an alternative"
                ) {
                    await workoutStore.swapExercise()
                }

                actionRow(
                    icon: "slider.horizontal.3",
                    title: "Adjust Difficulty",
                    subtitle: "Change weight, reps, or intensity"
                ) {
                    await workoutStore.adjustDifficulty()
                }

                actionRow(
                    icon: "clock.arrow.2.circlepath",
                    title: "Time Scale",
                    subtitle: "Compress or extend workout"
                ) {
                    await workoutStore.timeScale(targetMinutes: workoutStore.timeAvailableMin)
                }

                actionRow(
                    icon: "exclamationmark.triangle",
                    title: "Flag Pain",
                    subtitle: "Flag discomfort on this exercise"
                ) {
                    await workoutStore.flagPain()
                }

                actionRow(
                    icon: "forward.fill",
                    title: "Skip Exercise",
                    subtitle: "Move past without replacement"
                ) {
                    workoutStore.skipExercise()
                }
            }
            .padding(.horizontal, 20)

            Spacer()
        }
        .background(AppTheme.Colors.background)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .overlay {
            if isLoading {
                ZStack {
                    Color.black.opacity(0.3)
                        .ignoresSafeArea()
                    ProgressView()
                        .tint(AppTheme.Colors.primaryText)
                }
            }
        }
    }

    private func actionRow(
        icon: String,
        title: String,
        subtitle: String,
        action: @escaping () async -> Void
    ) -> some View {
        Button {
            isLoading = true
            Task {
                await action()
                isLoading = false
                dismiss()
            }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.primaryText)

                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(AppTheme.Colors.secondaryText)
                }

                Spacer()
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .background(AppTheme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
}
