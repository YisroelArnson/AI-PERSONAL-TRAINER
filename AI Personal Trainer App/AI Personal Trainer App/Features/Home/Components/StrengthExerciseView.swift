//
//  StrengthExerciseView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/11/25.
//

import SwiftUI

// MARK: - Main View
struct StrengthExerciseView: View {
    let exercise: UIExercise
    let showContent: Bool
    @Binding var completedSetIndices: Set<Int>
    @Binding var adjustedReps: [Int]
    @Binding var adjustedWeights: [Int]
    
    // Picker state
    @State private var showRepsPicker = false
    @State private var showWeightPicker = false
    @State private var editingSetIndex: Int = 0
    @State private var tempRepsValue: Int = 0
    @State private var tempWeightValue: Int = 0
    
    var body: some View {
        let setCount = exercise.sets ?? 0
        let reps = exercise.reps ?? []
        let loads = exercise.load_kg_each ?? []
        let actualSetCount = min(setCount, reps.count, loads.count)
        
        if actualSetCount > 0 {
            VStack(spacing: AppTheme.Spacing.sm) {
                ForEach(0..<actualSetCount, id: \.self) { index in
                    SetCard(
                        reps: adjustedReps.indices.contains(index) ? adjustedReps[index] : reps[index],
                        weight: adjustedWeights.indices.contains(index) ? adjustedWeights[index] : Int(loads[index]),
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
                        },
                        onTapWeight: {
                            editingSetIndex = index
                            tempWeightValue = adjustedWeights.indices.contains(index) ? adjustedWeights[index] : Int(loads[index])
                            showWeightPicker = true
                        }
                    )
                    .emergingAnimation(isVisible: showContent, delay: 0.1 + Double(index) * 0.06)
                }
            }
            .sheet(isPresented: $showRepsPicker) {
                RepsPickerSheet(
                    reps: $tempRepsValue,
                    onSave: {
                        adjustedReps[editingSetIndex] = tempRepsValue
                    }
                )
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showWeightPicker) {
                WeightPickerSheet(
                    weight: $tempWeightValue,
                    onSave: {
                        adjustedWeights[editingSetIndex] = tempWeightValue
                    }
                )
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
            }
        }
    }
}

// MARK: - Set Card

struct SetCard: View {
    let reps: Int
    let weight: Int
    let isCompleted: Bool
    let onTap: () -> Void
    let onTapReps: () -> Void
    let onTapWeight: () -> Void
    
    @StateObject private var userSettings = UserSettings.shared
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: AppTheme.Spacing.lg) {
                // Reps
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
                
                // Weight
                Button(action: onTapWeight) {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text("\(weight)")
                            .font(AppTheme.Typography.cardTitle)
                            .foregroundColor(isCompleted ? AppTheme.Colors.secondaryText : AppTheme.Colors.primaryText)
                        
                        Text(userSettings.weightUnitLabel)
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                    }
                }
                .buttonStyle(.plain)
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

// MARK: - Reps Picker Sheet
struct RepsPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var reps: Int
    let onSave: () -> Void
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                Picker("Reps", selection: $reps) {
                    ForEach(1...50, id: \.self) { value in
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

// MARK: - Weight Picker Sheet
struct WeightPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var weight: Int
    let onSave: () -> Void
    
    @StateObject private var userSettings = UserSettings.shared
    
    // Weight values: 0, 5, 10, 15... up to 500
    private let weightValues = Array(stride(from: 0, through: 500, by: 5))
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                Picker("Weight", selection: $weight) {
                    ForEach(weightValues, id: \.self) { value in
                        Text("\(value) \(userSettings.weightUnitLabel)").tag(value)
                    }
                }
                .pickerStyle(.wheel)
                .frame(height: 180)
            }
            .navigationTitle("Weight")
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
        @State private var adjustedReps: [Int] = [10, 8, 8, 6]
        @State private var adjustedWeights: [Int] = [135, 155, 155, 175]
        
        var body: some View {
            ZStack {
                AppTheme.Gradients.background
                    .ignoresSafeArea()
                
                VStack(alignment: .leading, spacing: 20) {
                    Text("Barbell Bench Press")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .padding(.horizontal, 20)
                    
                    StrengthExerciseView(
                        exercise: UIExercise(
                            exercise_name: "Barbell Bench Press",
                            type: "reps",
                            reps: [10, 8, 8, 6],
                            load_kg_each: [61.2, 70.3, 70.3, 79.4],
                            sets: 4,
                            rest_seconds: 90
                        ),
                        showContent: true,
                        completedSetIndices: $completedSets,
                        adjustedReps: $adjustedReps,
                        adjustedWeights: $adjustedWeights
                    )
                    .padding(.horizontal, 20)
                }
            }
        }
    }
    
    return PreviewWrapper()
}
