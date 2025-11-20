//
//  StrengthExerciseView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/11/25.
//

import SwiftUI

struct StrengthExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let sets = exercise.sets,
               let reps = exercise.reps,
               let loads = exercise.load_kg_each {
                
                ForEach(0..<min(sets, reps.count, loads.count), id: \.self) { index in
                    HStack(spacing: 16) {
                        Text("\(index + 1)")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.gray.opacity(0.6))
                            .frame(width: 20, alignment: .leading)
                        
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(reps[index])")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.primary)
                            
                            Text("reps")
                                .font(.system(size: 14, weight: .regular))
                                .foregroundColor(.gray)
                        }
                        
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(Int(loads[index]))")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.primary)
                            
                            Text("lbs")
                                .font(.system(size: 14, weight: .regular))
                                .foregroundColor(.gray)
                        }
                    }
                    .padding(.horizontal, 32)
                    .opacity(showContent ? 1 : 0)
                    .animation(.easeOut(duration: 0.15).delay(Double(index) * 0.03), value: showContent)
                }
            }
        }
    }
}

#Preview {
    StrengthExerciseView(
        exercise: UIExercise(
            exercise_name: "Barbell Bench Press",
            type: "strength",
            reps: [10, 8, 8, 6],
            load_kg_each: [61.2, 83.9, 83.9, 92.9],
            sets: 4
        ),
        showContent: true
    )
}

