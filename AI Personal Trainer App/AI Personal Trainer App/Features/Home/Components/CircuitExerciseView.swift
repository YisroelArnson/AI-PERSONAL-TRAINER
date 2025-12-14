//
//  CircuitExerciseView.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 11/23/25.
//

import SwiftUI

struct CircuitExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxl) {
            // Header Stats
            HStack(spacing: AppTheme.Spacing.xxxxl) {
                if let circuits = exercise.circuits {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("circuits")
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                        Text("\(circuits)")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
                
                if let rest = exercise.rest_between_circuits_sec {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("rest between")
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                        Text("\(rest)s")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
            }
            .opacity(showContent ? 1 : 0)
            .animation(.easeOut(duration: 0.2), value: showContent)
            
            // Exercises List
            if let circuitExercises = exercise.exercises_in_circuit, !circuitExercises.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    Text("exercises")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                    
                    VStack(spacing: AppTheme.Spacing.sm) {
                        ForEach(Array(circuitExercises.enumerated()), id: \.offset) { index, item in
                            HStack {
                                Text("\(index + 1)")
                                    .font(.system(size: 14, weight: .medium, design: .rounded))
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                    .frame(width: 20)
                                
                                Text(item.name)
                                    .font(.system(size: 15, weight: .medium, design: .rounded))
                                    .foregroundColor(AppTheme.Colors.primaryText)
                                
                                Spacer()
                                
                                if let reps = item.reps {
                                    Text("\(reps) reps")
                                        .font(.system(size: 12, weight: .medium, design: .rounded))
                                        .padding(.horizontal, AppTheme.Spacing.sm)
                                        .padding(.vertical, AppTheme.Spacing.xs)
                                        .background(
                                            RoundedRectangle(cornerRadius: 6)
                                                .fill(AppTheme.Colors.backgroundGradientEnd.opacity(0.5))
                                        )
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                }
                                
                                if let duration = item.duration_sec {
                                    Text("\(duration)s")
                                        .font(.system(size: 12, weight: .medium, design: .rounded))
                                        .padding(.horizontal, AppTheme.Spacing.sm)
                                        .padding(.vertical, AppTheme.Spacing.xs)
                                        .background(
                                            RoundedRectangle(cornerRadius: 6)
                                                .fill(AppTheme.Colors.backgroundGradientEnd.opacity(0.5))
                                        )
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                }
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
                Text("Full Body Circuit")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                CircuitExerciseView(
                    exercise: UIExercise(
                        exercise_name: "Full Body Circuit",
                        type: "circuit",
                        circuits: 3,
                        exercises_in_circuit: [
                            CircuitExercise(name: "Push-ups", duration_sec: nil, reps: 15),
                            CircuitExercise(name: "Jump Squats", duration_sec: 30, reps: nil),
                            CircuitExercise(name: "Plank", duration_sec: 45, reps: nil)
                        ],
                        rest_between_circuits_sec: 90
                    ),
                    showContent: true
                )
            }
        }
        .padding(.horizontal, 20)
    }
}
