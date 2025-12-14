//
//  SportSpecificExerciseView.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 11/23/25.
//

import SwiftUI

struct SportSpecificExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxl) {
            // Sport & Drill Info
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                if let sport = exercise.sport {
                    Text(sport.lowercased())
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.accentSecondary)
                }
                
                if let drill = exercise.drill_name {
                    Text(drill)
                        .font(.system(size: 20, weight: .semibold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
            .opacity(showContent ? 1 : 0)
            .animation(.easeOut(duration: 0.2), value: showContent)
            
            // Skill Focus
            if let skill = exercise.skill_focus {
                HStack(spacing: AppTheme.Spacing.sm) {
                    Image(systemName: "target")
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.Colors.warmAccent)
                    Text("Focus: \(skill)")
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
                .padding(AppTheme.Spacing.md)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                        .fill(AppTheme.Colors.warmAccent.opacity(0.1))
                )
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.2).delay(0.05), value: showContent)
            }
            
            // Duration or Reps
            HStack(spacing: AppTheme.Spacing.xxxxl) {
                if let duration = exercise.duration_min {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("duration")
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                        Text("\(duration) min")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
                
                if let reps = exercise.rounds {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("repetitions")
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                        Text("\(reps)x")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
            }
            .opacity(showContent ? 1 : 0)
            .animation(.easeOut(duration: 0.2).delay(0.1), value: showContent)
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
                Text("Dribbling Drills")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                SportSpecificExerciseView(
                    exercise: UIExercise(
                        exercise_name: "Dribbling Drills",
                        type: "sport_specific",
                        duration_min: 15,
                        rounds: 50,
                        sport: "Basketball",
                        drill_name: "Crossover Practice",
                        skill_focus: "Ball Control"
                    ),
                    showContent: true
                )
            }
        }
        .padding(.horizontal, 20)
    }
}
