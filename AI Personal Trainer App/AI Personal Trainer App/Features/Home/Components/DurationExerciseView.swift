//
//  DurationExerciseView.swift
//  AI Personal Trainer App
//
//  View for duration-based exercises (cardio, yoga flows, continuous effort).
//  Part of the 4-type exercise system: reps, hold, duration, intervals.
//

import SwiftUI

struct DurationExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool

    @StateObject private var userSettings = UserSettings.shared

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxl) {
            // Primary metric: Duration or Distance
            if let distance = exercise.distance_km {
                // Distance-based (e.g., 5K run)
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("distance")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .textCase(.lowercase)

                    HStack(alignment: .firstTextBaseline, spacing: AppTheme.Spacing.sm) {
                        Text(String(format: "%.1f", distance))
                            .font(.system(size: 64, weight: .bold, design: .rounded))
                            .foregroundColor(AppTheme.Colors.primaryText)

                        Text(userSettings.distanceUnitLabel)
                            .font(.system(size: 22, weight: .regular, design: .rounded))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                }
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.2), value: showContent)
            } else if let duration = exercise.duration_min {
                // Time-based (e.g., 30 min cycling)
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("duration")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .textCase(.lowercase)

                    HStack(alignment: .firstTextBaseline, spacing: AppTheme.Spacing.sm) {
                        Text("\(duration)")
                            .font(.system(size: 64, weight: .bold, design: .rounded))
                            .foregroundColor(AppTheme.Colors.primaryText)

                        Text("min")
                            .font(.system(size: 22, weight: .regular, design: .rounded))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                }
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.2), value: showContent)
            }

            // Target Pace (if available)
            if let pace = exercise.target_pace {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("target pace")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .textCase(.lowercase)

                    Text(pace)
                        .font(.system(size: 28, weight: .semibold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.2).delay(0.05), value: showContent)
            }

            // Duration Estimate (if distance-based and duration provided)
            if exercise.distance_km != nil, let duration = exercise.duration_min {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("est. duration")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .textCase(.lowercase)

                    Text("\(duration) min")
                        .font(.system(size: 20, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.2).delay(0.1), value: showContent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()

        VStack(spacing: 20) {
            // Time-based duration
            ExerciseCard {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Cycling")
                        .font(.system(size: 26, weight: .bold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    DurationExerciseView(
                        exercise: UIExercise(
                            exercise_name: "Cycling",
                            type: "duration",
                            duration_min: 30
                        ),
                        showContent: true
                    )
                }
            }
            .padding(.horizontal, 20)

            // Distance-based duration
            ExerciseCard {
                VStack(alignment: .leading, spacing: 16) {
                    Text("5K Run")
                        .font(.system(size: 26, weight: .bold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    DurationExerciseView(
                        exercise: UIExercise(
                            exercise_name: "5K Run",
                            type: "duration",
                            duration_min: 30,
                            distance_km: 5.0,
                            target_pace: "6:00/km"
                        ),
                        showContent: true
                    )
                }
            }
            .padding(.horizontal, 20)
        }
    }
}
