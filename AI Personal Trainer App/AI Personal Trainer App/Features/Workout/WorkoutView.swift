//
//  WorkoutView.swift
//  AI Personal Trainer App
//
//  Container view for the workout execution screen.
//

import SwiftUI

struct WorkoutView: View {
    @State var workoutStore = WorkoutStore.shared
    @Environment(\.dismiss) var dismiss
    @State private var isProcessingMenuAction = false

    var body: some View {
        VStack(spacing: 0) {
            // MARK: - Top Bar
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .frame(width: 44, height: 44)
                }

                Spacer()

                Text("\(workoutStore.currentExerciseIndex + 1) of \(workoutStore.totalExercises)")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)

                Spacer()

                HStack(spacing: 2) {
                    Button {
                        withAnimation(AppTheme.Animation.slow) {
                            workoutStore.presentationMode = workoutStore.presentationMode == .workout ? .list : .workout
                        }
                    } label: {
                        Image(systemName: workoutStore.presentationMode == .workout ? "list.bullet" : "square.grid.2x2")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.primaryText)
                            .frame(width: 44, height: 44)
                    }
                    .disabled(isProcessingMenuAction)

                    Menu {
                        Button {
                            performMenuAction {
                                await workoutStore.swapExercise()
                            }
                        } label: {
                            Label("Swap Exercise", systemImage: "arrow.triangle.2.circlepath")
                        }

                        Button {
                            performMenuAction {
                                await workoutStore.adjustDifficulty()
                            }
                        } label: {
                            Label("Adjust Difficulty", systemImage: "slider.horizontal.3")
                        }

                        Button {
                            performMenuAction {
                                await workoutStore.timeScale(targetMinutes: workoutStore.timeAvailableMin)
                            }
                        } label: {
                            Label("Time Scale", systemImage: "clock.arrow.2.circlepath")
                        }

                        Button {
                            performMenuAction {
                                await workoutStore.flagPain()
                            }
                        } label: {
                            Label("Flag Pain", systemImage: "exclamationmark.triangle")
                        }

                        Divider()

                        Button(role: .destructive) {
                            performMenuAction {
                                workoutStore.skipExercise()
                            }
                        } label: {
                            Label("Skip Exercise", systemImage: "forward.fill")
                        }
                    } label: {
                        Image(systemName: "pencil")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.primaryText)
                            .frame(width: 44, height: 44)
                    }
                    .disabled(isProcessingMenuAction)
                }
            }
            .padding(.horizontal, 4)

            // MARK: - Progress Bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(AppTheme.Colors.surface)
                        .frame(height: 3)

                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(AppTheme.Colors.primaryText)
                        .frame(
                            width: workoutStore.totalExercises > 0
                                ? geo.size.width * CGFloat(workoutStore.currentExerciseIndex + 1) / CGFloat(workoutStore.totalExercises)
                                : 0,
                            height: 3
                        )
                        .animation(AppTheme.Animation.slow, value: workoutStore.currentExerciseIndex)
                }
            }
            .frame(height: 3)
            .padding(.horizontal, 20)
            .padding(.top, 4)

            // MARK: - Exercise Content
            if workoutStore.presentationMode == .workout {
                WorkoutModeView()
            } else {
                ListModeView()
            }

            // MARK: - Bottom Bar
            WorkoutBottomBar()
        }
        .background(AppTheme.Colors.background)
        .overlay {
            if isProcessingMenuAction {
                ZStack {
                    Color.black.opacity(0.25)
                        .ignoresSafeArea()
                    ProgressView()
                        .tint(AppTheme.Colors.primaryText)
                }
            }
        }
    }

    private func performMenuAction(_ action: @escaping () async -> Void) {
        guard !isProcessingMenuAction else { return }
        isProcessingMenuAction = true
        Task { @MainActor in
            await action()
            isProcessingMenuAction = false
        }
    }
}
