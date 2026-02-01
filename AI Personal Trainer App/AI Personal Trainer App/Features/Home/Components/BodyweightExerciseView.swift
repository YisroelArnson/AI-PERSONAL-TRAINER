//
//  BodyweightExerciseView.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 11/23/25.
//

import SwiftUI

struct BodyweightExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    @Binding var completedSetIndices: Set<Int>
    @Binding var adjustedReps: [Int]
    
    // Picker state
    @State private var showRepsPicker = false
    @State private var editingSetIndex: Int = 0
    @State private var tempRepsValue: Int = 0
    
    var body: some View {
        let setCount = exercise.sets ?? 0
        let reps = exercise.reps ?? []
        let actualSetCount = min(setCount, reps.count)
        
        if actualSetCount > 0 {
            VStack(spacing: AppTheme.Spacing.sm) {
                ForEach(0..<actualSetCount, id: \.self) { index in
                    BodyweightSetCard(
                        reps: adjustedReps.indices.contains(index) ? adjustedReps[index] : reps[index],
                        isCompleted: completedSetIndices.contains(index),
                        onTap: {
                            withAnimation(AppTheme.Animation.gentle) {
                                if completedSetIndices.contains(index) {
                                    completedSetIndices.remove(index)
                                } else {
                                    completedSetIndices.insert(index)
                                }
                            }
                        },
                        onTapReps: {
                            editingSetIndex = index
                            tempRepsValue = adjustedReps.indices.contains(index) ? adjustedReps[index] : reps[index]
                            showRepsPicker = true
                        }
                    )
                    .emergingAnimation(isVisible: showContent, delay: 0.1 + Double(index) * 0.06)
                }
            }
            .sheet(isPresented: $showRepsPicker) {
                BodyweightRepsPickerSheet(
                    reps: $tempRepsValue,
                    onSave: {
                        adjustedReps[editingSetIndex] = tempRepsValue
                    }
                )
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
            }
        }
    }
}

// MARK: - Bodyweight Set Card

struct BodyweightSetCard: View {
    let reps: Int
    let isCompleted: Bool
    let onTap: () -> Void
    let onTapReps: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            HStack {
                Button(action: onTapReps) {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text("\(reps)")
                            .font(AppTheme.Typography.cardTitle)
                            .foregroundColor(isCompleted ? AppTheme.Colors.secondaryText : AppTheme.Colors.primaryText)
                        
                        Text("reps")
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                    }
                }
                .buttonStyle(.plain)
                
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

// MARK: - Bodyweight Reps Picker Sheet
struct BodyweightRepsPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var reps: Int
    let onSave: () -> Void
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                Picker("Reps", selection: $reps) {
                    ForEach(1...100, id: \.self) { value in
                        Text("\(value) reps").tag(value)
                    }
                }
                .pickerStyle(.wheel)
                .frame(height: 180)
            }
            .navigationTitle("Reps")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(AppTheme.Colors.secondaryText)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundColor(AppTheme.Colors.accent)
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    struct PreviewWrapper: View {
        @State private var completedSets: Set<Int> = [1]
        @State private var adjustedReps: [Int] = [15, 12, 10]
        
        var body: some View {
            ZStack {
                AppTheme.Gradients.background
                    .ignoresSafeArea()
                
                VStack(alignment: .leading, spacing: 20) {
                    Text("Push-ups")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .padding(.horizontal, 20)
                    
                    BodyweightExerciseView(
                        exercise: UIExercise(
                            exercise_name: "Push-ups",
                            type: "reps",
                            reps: [15, 12, 10],
                            sets: 3,
                            rest_seconds: 60
                        ),
                        showContent: true,
                        completedSetIndices: $completedSets,
                        adjustedReps: $adjustedReps
                    )
                    .padding(.horizontal, 20)
                }
            }
        }
    }
    
    return PreviewWrapper()
}
