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
    }
}
