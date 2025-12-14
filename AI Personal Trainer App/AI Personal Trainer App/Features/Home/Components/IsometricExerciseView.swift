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
                    .emergingAnimation(isVisible: showContent, delay: 0.1 + Double(index) * 0.06)
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
                        .font(.system(size: 14, weight: .regular, design: .rounded))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    
                    Text("\(holdSeconds)")
                        .font(.system(size: 18, weight: .semibold, design: .rounded))
                        .foregroundColor(isCompleted ? AppTheme.Colors.secondaryText : AppTheme.Colors.primaryText)
                    
                    Text("sec")
                        .font(.system(size: 12, weight: .regular, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                }
                
                Spacer()
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.lg)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                    .fill(isCompleted ? AppTheme.Colors.backgroundGradientEnd : Color.white)
            )
            .shadow(
                color: isCompleted ? Color.clear : Color.black.opacity(0.06),
                radius: isCompleted ? 0 : 8,
                x: 0,
                y: isCompleted ? 0 : 4
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
                    type: "isometric",
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
