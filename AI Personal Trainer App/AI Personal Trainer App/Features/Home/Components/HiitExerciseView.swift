//
//  HiitExerciseView.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 11/23/25.
//

import SwiftUI

struct HiitExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxl) {
            // Header Stats
            HStack(spacing: AppTheme.Spacing.xxxxl) {
                if let rounds = exercise.rounds {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("rounds")
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                        Text("\(rounds)")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
                
                if let duration = exercise.total_duration_min ?? exercise.duration_min {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("total time")
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                        Text("\(duration) min")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
            }
            .opacity(showContent ? 1 : 0)
            .animation(.easeOut(duration: 0.2), value: showContent)
            
            // Intervals List
            if let intervals = exercise.intervals, !intervals.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    Text("intervals")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                    
                    VStack(spacing: AppTheme.Spacing.sm) {
                        ForEach(Array(intervals.enumerated()), id: \.offset) { index, interval in
                            HStack(spacing: AppTheme.Spacing.sm) {
                                // Work
                                if let work = interval.work_sec {
                                    HStack(spacing: AppTheme.Spacing.sm) {
                                        Image(systemName: "flame.fill")
                                            .font(.system(size: 12))
                                            .foregroundColor(AppTheme.Colors.warmAccent)
                                        Text("Work")
                                            .font(.system(size: 13, weight: .medium, design: .rounded))
                                            .foregroundColor(AppTheme.Colors.primaryText)
                                        Spacer()
                                        Text("\(work)s")
                                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                                            .foregroundColor(AppTheme.Colors.primaryText)
                                    }
                                    .padding(.horizontal, AppTheme.Spacing.md)
                                    .padding(.vertical, AppTheme.Spacing.sm)
                                    .background(
                                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                            .fill(AppTheme.Colors.warmAccent.opacity(0.1))
                                    )
                                }
                                
                                // Rest
                                if let rest = interval.rest_sec {
                                    HStack(spacing: AppTheme.Spacing.sm) {
                                        Image(systemName: "pause.circle.fill")
                                            .font(.system(size: 12))
                                            .foregroundColor(AppTheme.Colors.accentSecondary)
                                        Text("Rest")
                                            .font(.system(size: 13, weight: .medium, design: .rounded))
                                            .foregroundColor(AppTheme.Colors.primaryText)
                                        Spacer()
                                        Text("\(rest)s")
                                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                                            .foregroundColor(AppTheme.Colors.primaryText)
                                    }
                                    .padding(.horizontal, AppTheme.Spacing.md)
                                    .padding(.vertical, AppTheme.Spacing.sm)
                                    .background(
                                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                            .fill(AppTheme.Colors.accentSecondary.opacity(0.1))
                                    )
                                }
                            }
                            .opacity(showContent ? 1 : 0)
                            .animation(.easeOut(duration: 0.2).delay(Double(index) * 0.05 + 0.1), value: showContent)
                        }
                    }
                }
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
                
                HiitExerciseView(
                    exercise: UIExercise(
                        exercise_name: "Tabata Sprints",
                        type: "hiit",
                        duration_min: 4,
                        intervals: [
                            ExerciseInterval(work_sec: 20, rest_sec: 10),
                            ExerciseInterval(work_sec: 20, rest_sec: 10),
                            ExerciseInterval(work_sec: 20, rest_sec: 10),
                            ExerciseInterval(work_sec: 20, rest_sec: 10)
                        ],
                        rounds: 8
                    ),
                    showContent: true
                )
            }
        }
        .padding(.horizontal, 20)
    }
}
