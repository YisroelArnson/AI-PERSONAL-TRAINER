//
//  YogaExerciseView.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 11/23/25.
//

import SwiftUI

struct YogaExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxl) {
            // Header Stats
            if let duration = exercise.total_duration_min {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    Text("total duration")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                    Text("\(duration) min")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
                .opacity(showContent ? 1 : 0)
                .animation(.easeOut(duration: 0.2), value: showContent)
            }
            
            // Sequence List
            if let sequence = exercise.sequence, !sequence.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    Text("flow sequence")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                    
                    VStack(spacing: 0) {
                        ForEach(Array(sequence.enumerated()), id: \.offset) { index, pose in
                            HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
                                // Timeline connector
                                VStack(spacing: 0) {
                                    Circle()
                                        .fill(AppTheme.Colors.yoga)
                                        .frame(width: 8, height: 8)
                                    
                                    if index < sequence.count - 1 {
                                        Rectangle()
                                            .fill(AppTheme.Colors.yoga.opacity(0.3))
                                            .frame(width: 2)
                                            .frame(maxHeight: .infinity)
                                    }
                                }
                                .padding(.top, 5)
                                
                                // Content
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(pose.pose)
                                        .font(.system(size: 15, weight: .medium, design: .rounded))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                    
                                    HStack(spacing: 4) {
                                        if let breaths = pose.breaths {
                                            Text("\(breaths) breaths")
                                                .font(.system(size: 12, weight: .regular, design: .rounded))
                                                .foregroundColor(AppTheme.Colors.secondaryText)
                                        }
                                        
                                        if let duration = pose.duration_sec {
                                            if pose.breaths != nil {
                                                Text("·")
                                                    .font(.system(size: 12))
                                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                            }
                                            Text("\(duration)s")
                                                .font(.system(size: 12, weight: .regular, design: .rounded))
                                                .foregroundColor(AppTheme.Colors.secondaryText)
                                        }
                                    }
                                }
                                .padding(.bottom, AppTheme.Spacing.lg)
                                
                                Spacer()
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
        
        ScrollView {
            ExerciseCard {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Sun Salutation A")
                        .font(.system(size: 26, weight: .bold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    
                    YogaExerciseView(
                        exercise: UIExercise(
                            exercise_name: "Sun Salutation A",
                            type: "yoga",
                            sequence: [
                                YogaPose(pose: "Mountain Pose", duration_sec: nil, breaths: 5),
                                YogaPose(pose: "Forward Fold", duration_sec: nil, breaths: 3),
                                YogaPose(pose: "Half Lift", duration_sec: nil, breaths: 1),
                                YogaPose(pose: "Plank", duration_sec: 30, breaths: nil),
                                YogaPose(pose: "Chaturanga", duration_sec: nil, breaths: 1),
                                YogaPose(pose: "Upward Dog", duration_sec: nil, breaths: 3),
                                YogaPose(pose: "Downward Dog", duration_sec: nil, breaths: 5)
                            ],
                            total_duration_min: 15
                        ),
                        showContent: true
                    )
                }
            }
            .padding(.horizontal, 20)
        }
    }
}
