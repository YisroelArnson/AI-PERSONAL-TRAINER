//
//  IntervalsExerciseView.swift
//  AI Personal Trainer App
//
//  View for interval-based exercises (HIIT, tabata, sprint work).
//  Part of the 4-type exercise system: reps, hold, duration, intervals.
//

import SwiftUI

struct IntervalsExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxl) {
            // Header Stats
            HStack(spacing: AppTheme.Spacing.xxxxl) {
                if let rounds = exercise.rounds {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("rounds")
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                        Text("\(rounds)")
                            .font(AppTheme.Typography.statNumber)
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }

                if let duration = exercise.total_duration_min ?? exercise.duration_min {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("total time")
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                        Text("\(duration) min")
                            .font(AppTheme.Typography.statNumber)
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
            }
            .opacity(showContent ? 1 : 0)
            .animation(.easeOut(duration: 0.2), value: showContent)

            // Work/Rest Display (new format using work_sec and rest_seconds)
            if let workSec = exercise.work_sec {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    Text("interval")
                        .font(AppTheme.Typography.label)
                        .foregroundColor(AppTheme.Colors.tertiaryText)

                    HStack(spacing: AppTheme.Spacing.sm) {
                        // Work
                        HStack(spacing: AppTheme.Spacing.sm) {
                            Image(systemName: "flame.fill")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.Colors.primaryText)
                            Text("Work")
                                .font(AppTheme.Typography.cardSubtitle)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            Spacer()
                            Text("\(workSec)s")
                                .font(AppTheme.Typography.caption)
                                .foregroundColor(AppTheme.Colors.primaryText)
                        }
                        .padding(.horizontal, AppTheme.Spacing.md)
                        .padding(.vertical, AppTheme.Spacing.sm)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                    .fill(AppTheme.Colors.highlight)
                            )

                        // Rest
                        if let restSec = exercise.rest_seconds {
                            HStack(spacing: AppTheme.Spacing.sm) {
                                Image(systemName: "pause.circle.fill")
                                    .font(.system(size: 12))
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                                Text("Rest")
                                    .font(AppTheme.Typography.cardSubtitle)
                                    .foregroundColor(AppTheme.Colors.primaryText)
                                Spacer()
                                Text("\(restSec)s")
                                    .font(AppTheme.Typography.caption)
                                    .foregroundColor(AppTheme.Colors.primaryText)
                            }
                            .padding(.horizontal, AppTheme.Spacing.md)
                            .padding(.vertical, AppTheme.Spacing.sm)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                    .fill(AppTheme.Colors.highlight)
                            )
                        }
                    }
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

        ExerciseCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("Tabata Sprints")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)

                IntervalsExerciseView(
                    exercise: UIExercise(
                        exercise_name: "Tabata Sprints",
                        type: "intervals",
                        duration_min: 4,
                        rounds: 8,
                        work_sec: 20,
                        rest_seconds: 10
                    ),
                    showContent: true
                )
            }
        }
        .padding(.horizontal, 20)
    }
}
