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
        VStack(spacing: 40) {
            // Duration
            if let duration = exercise.duration_min {
                VStack(spacing: 8) {
                    Text("DURATION")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.gray)
                        .tracking(2)
                    
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(duration)")
                            .font(.system(size: 96, weight: .bold))
                            .foregroundColor(.primary)
                        
                        Text("min")
                            .font(.system(size: 28, weight: .regular))
                            .foregroundColor(.gray)
                    }
                }
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.15), value: showContent)
            }
            
            // Intensity
            if let intensity = exercise.target_intensity {
                VStack(spacing: 8) {
                    Text("INTENSITY")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.gray)
                        .tracking(2)
                    
                    Text(intensity.capitalized)
                        .font(.system(size: 36, weight: .semibold))
                        .foregroundColor(.primary)
                }
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.15).delay(0.03), value: showContent)
            }
        }
        .padding(.horizontal, 32)
    }
}

#Preview {
    CardioTimeExerciseView(
        exercise: UIExercise(
            exercise_name: "Cycling",
            type: "cardio_time",
            duration_min: 30,
            target_intensity: "moderate"
        ),
        showContent: true
    )
}

