//
//  IsometricExerciseView.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 11/23/25.
//

import SwiftUI

struct IsometricExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    @State private var completedSets: Set<Int> = []
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.sm) {
            if let sets = exercise.sets,
               let holds = exercise.hold_duration_sec {
                
                ForEach(0..<min(sets, holds.count), id: \.self) { index in
                    IsometricSetCard(
                        holdSeconds: holds[index],
                        isCompleted: completedSets.contains(index),
                        onTap: {
                            withAnimation(AppTheme.Animation.gentle) {
                                if completedSets.contains(index) {
                                    completedSets.remove(index)
                                } else {
                                    completedSets.insert(index)
                                }
                            }
                        }
                    )
                    .opacity(showContent ? 1 : 0)
                    .animation(AppTheme.Animation.gentle.delay(0.1 + Double(index) * 0.06), value: showContent)
                }
            }
        }
    }
}

// MARK: - Isometric Set Card

struct IsometricSetCard: View {
    let holdSeconds: Int
    let isCompleted: Bool
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
                HStack {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text("Hold")
                            .font(AppTheme.Typography.cardSubtitle)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                        
                        Text("\(holdSeconds)")
                            .font(AppTheme.Typography.cardTitle)
                            .foregroundColor(isCompleted ? AppTheme.Colors.secondaryText : AppTheme.Colors.primaryText)
                        
                        Text("sec")
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                    }
                
                Spacer()
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.lg)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                    .fill(isCompleted ? AppTheme.Colors.highlight : AppTheme.Colors.surface)
            )
        }
        .buttonStyle(.plain)
        .animation(AppTheme.Animation.gentle, value: isCompleted)
    }
}

#Preview {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        VStack(alignment: .leading, spacing: 20) {
            Text("Plank")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.horizontal, 20)
            
            IsometricExerciseView(
                exercise: UIExercise(
                    exercise_name: "Plank",
                    type: "hold",
                    sets: 3,
                    rest_seconds: 60,
                    hold_duration_sec: [45, 60, 45]
                ),
                showContent: true
            )
            .padding(.horizontal, 20)
        }
    }
}
