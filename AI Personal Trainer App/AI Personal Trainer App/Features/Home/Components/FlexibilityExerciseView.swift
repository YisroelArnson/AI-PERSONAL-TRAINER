//
//  FlexibilityExerciseView.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 11/23/25.
//

import SwiftUI

struct FlexibilityExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxl) {
            // Header Stats
            if let reps = exercise.repetitions {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    Text("repetitions")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                    Text("\(reps)x")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.2), value: showContent)
            }
            
            // Holds List
            if let holds = exercise.holds, !holds.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    Text("positions")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                    
                    VStack(spacing: AppTheme.Spacing.sm) {
                        ForEach(Array(holds.enumerated()), id: \.offset) { index, hold in
                            HStack {
                                Text(hold.position)
                                    .font(.system(size: 15, weight: .medium, design: .rounded))
                                    .foregroundColor(AppTheme.Colors.primaryText)
                                
                                Spacer()
                                
                                HStack(spacing: 4) {
                                    Image(systemName: "clock")
                                        .font(.system(size: 10))
                                    Text("\(hold.duration_sec)s")
                                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                                }
                                .padding(.horizontal, AppTheme.Spacing.md)
                                .padding(.vertical, AppTheme.Spacing.xs)
                                .background(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                        .fill(AppTheme.Colors.success.opacity(0.1))
                                )
                                .foregroundColor(AppTheme.Colors.success)
                            }
                            .padding(AppTheme.Spacing.md)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                    .fill(AppTheme.Colors.backgroundGradientEnd.opacity(0.5))
                            )
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
                Text("Morning Stretch")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                FlexibilityExerciseView(
                    exercise: UIExercise(
                        exercise_name: "Morning Stretch",
                        type: "flexibility",
                        holds: [
                            FlexibilityHold(position: "Forward Fold", duration_sec: 30),
                            FlexibilityHold(position: "Cat-Cow", duration_sec: 60),
                            FlexibilityHold(position: "Child's Pose", duration_sec: 45)
                        ],
                        repetitions: 1
                    ),
                    showContent: true
                )
            }
        }
        .padding(.horizontal, 20)
    }
}
