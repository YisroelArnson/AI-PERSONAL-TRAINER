//
//  CardioTimeExerciseView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/11/25.
//

import SwiftUI

struct CardioTimeExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxl) {
            // Duration
            if let duration = exercise.duration_min {
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
                Text("Cycling")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                CardioTimeExerciseView(
                    exercise: UIExercise(
                        exercise_name: "Cycling",
                        type: "cardio_time",
                        duration_min: 30
                    ),
                    showContent: true
                )
            }
        }
        .padding(.horizontal, 20)
    }
}
