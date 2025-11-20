//
//  MuscleGoalSetterView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct MuscleGoalSetterView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var userDataStore: UserDataStore
    @StateObject private var apiService = APIService()
    
    // All 16 muscles with initial weights
    @State private var muscleWeights: [String: Double] = [
        "Chest": 0.0625,
        "Back": 0.0625,
        "Shoulders": 0.0625,
        "Biceps": 0.0625,
        "Triceps": 0.0625,
        "Abs": 0.0625,
        "Lower Back": 0.0625,
        "Quadriceps": 0.0625,
        "Hamstrings": 0.0625,
        "Glutes": 0.0625,
        "Calves": 0.0625,
        "Trapezius": 0.0625,
        "Abductors": 0.0625,
        "Adductors": 0.0625,
        "Forearms": 0.0625,
        "Neck": 0.0625
    ]
    
    private let muscleOrder = [
        "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Abs", "Lower Back", "Quadriceps",
        "Hamstrings", "Glutes", "Calves", "Trapezius", "Abductors", "Adductors", "Forearms", "Neck"
    ]
    
    // AI State variables
    @State private var aiInputText: String = ""
    @State private var isProcessingAI: Bool = false
    
    // UI State
    @State private var errorMessage: String?
    @State private var showError: Bool = false
    
    var totalWeight: Double {
        muscleWeights.values.reduce(0, +)
    }
    
    var isValidTotal: Bool {
        abs(totalWeight - 1.0) < 0.001
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.xl) {
                        // Total indicator
                        TotalIndicator(total: totalWeight, isValid: isValidTotal)
                        
                        // Muscle sliders
                        VStack(spacing: AppTheme.Spacing.md) {
                            ForEach(muscleOrder, id: \.self) { muscle in
                                MuscleSliderRow(
                                    name: muscle,
                                    weight: binding(for: muscle)
                                )
                            }
                        }
                        .padding(.horizontal, AppTheme.Spacing.xl)
                        
                        // Action buttons
                        HStack(spacing: AppTheme.Spacing.md) {
                            Button(action: equalize) {
                                HStack(spacing: 6) {
                                    Image(systemName: "equal.square")
                                        .font(.system(size: 14, weight: .semibold))
                                    Text("Equalize")
                                        .font(.system(size: 14, weight: .semibold))
                                }
                                .foregroundColor(AppTheme.Colors.primaryText)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(AppTheme.Colors.cardBackground)
                                .cornerRadius(AppTheme.CornerRadius.small)
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                        .stroke(AppTheme.Colors.border, lineWidth: 1)
                                )
                            }
                            
                            Button(action: normalize) {
                                HStack(spacing: 6) {
                                    Image(systemName: "equal.circle")
                                        .font(.system(size: 14, weight: .semibold))
                                    Text("Normalize")
                                        .font(.system(size: 14, weight: .semibold))
                                }
                                .foregroundColor(AppTheme.Colors.primaryText)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(AppTheme.Colors.cardBackground)
                                .cornerRadius(AppTheme.CornerRadius.small)
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                        .stroke(AppTheme.Colors.border, lineWidth: 1)
                                )
                            }
                        }
                        .padding(.horizontal, AppTheme.Spacing.xl)
                        
                        // Presets section
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                            Text("Presets")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            VStack(spacing: AppTheme.Spacing.sm) {
                                PresetButton(
                                    title: "Even Distribution",
                                    description: "Equal focus on all muscles (6.25% each)"
                                ) {
                                    applyPreset(.even)
                                }
                                
                                PresetButton(
                                    title: "Upper Push Bias",
                                    description: "Focus on chest, shoulders, and triceps"
                                ) {
                                    applyPreset(.upperPush)
                                }
                                
                                PresetButton(
                                    title: "Lower Hinge Bias",
                                    description: "Focus on glutes, hamstrings, and lower back"
                                ) {
                                    applyPreset(.lowerHinge)
                                }
                                
                                PresetButton(
                                    title: "Balanced Upper/Lower",
                                    description: "50% upper body, 50% lower body"
                                ) {
                                    applyPreset(.balancedUpperLower)
                                }
                            }
                        }
                        .padding(.horizontal, AppTheme.Spacing.xl)
                        .padding(.top, AppTheme.Spacing.lg)
                    }
                    .padding(.top, AppTheme.Spacing.xl)
                    .padding(.bottom, 80)
                }
                .simultaneousGesture(
                    DragGesture().onChanged { _ in
                        hideKeyboard()
                    }
                )
                
                // Floating AI Input Field
                VStack {
                    Spacer()
                    
                    HStack(spacing: AppTheme.Spacing.md) {
                        TextField("Describe your muscle focus...", text: $aiInputText)
                            .textFieldStyle(PlainTextFieldStyle())
                            .padding(AppTheme.Spacing.md)
                            .background(AppTheme.Colors.cardBackground)
                            .cornerRadius(AppTheme.CornerRadius.medium)
                            .disabled(isProcessingAI)
                        
                        SendButton(
                            isProcessing: isProcessingAI,
                            isEnabled: !aiInputText.isEmpty,
                            action: handleSendTap
                        )
                    }
                    .padding(AppTheme.Spacing.md)
                    .background(AppTheme.Colors.background)
                    .shadow(color: AppTheme.Shadow.card, radius: 8, x: 0, y: -2)
                }
            }
            .navigationTitle("Muscle Goals")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { 
                        dismiss() 
                    }
                    .disabled(isProcessingAI)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        saveGoals()
                    }
                    .disabled(!isValidTotal || isProcessingAI)
                }
            }
            .alert("Error", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "An unknown error occurred")
            }
        }
        .onAppear {
            loadExistingGoals()
        }
    }
    
    private func binding(for muscle: String) -> Binding<Double> {
        Binding(
            get: { muscleWeights[muscle] ?? 0.0 },
            set: { muscleWeights[muscle] = $0 }
        )
    }
    
    private func loadExistingGoals() {
        // Load existing muscle goals from userDataStore
        if !userDataStore.muscleGoals.isEmpty {
            for goal in userDataStore.muscleGoals {
                muscleWeights[goal.muscle] = goal.weight
            }
        }
    }
    
    private func equalize() {
        let equalWeight = 1.0 / Double(muscleWeights.count)
        for muscle in muscleWeights.keys {
            muscleWeights[muscle] = equalWeight
        }
    }
    
    private func normalize() {
        let total = totalWeight
        if total > 0 {
            for muscle in muscleWeights.keys {
                muscleWeights[muscle]? /= total
            }
        }
    }
    
    private func applyPreset(_ preset: MusclePreset) {
        // Reset all to 0
        for muscle in muscleWeights.keys {
            muscleWeights[muscle] = 0.0
        }
        
        switch preset {
        case .even:
            equalize()
            
        case .upperPush:
            muscleWeights["Chest"] = 0.25
            muscleWeights["Shoulders"] = 0.20
            muscleWeights["Triceps"] = 0.15
            muscleWeights["Back"] = 0.15
            muscleWeights["Abs"] = 0.10
            muscleWeights["Quadriceps"] = 0.08
            muscleWeights["Glutes"] = 0.07
            
        case .lowerHinge:
            muscleWeights["Glutes"] = 0.30
            muscleWeights["Hamstrings"] = 0.25
            muscleWeights["Lower Back"] = 0.15
            muscleWeights["Abs"] = 0.10
            muscleWeights["Quadriceps"] = 0.10
            muscleWeights["Back"] = 0.10
            
        case .balancedUpperLower:
            // Upper body (50%)
            muscleWeights["Chest"] = 0.10
            muscleWeights["Back"] = 0.12
            muscleWeights["Shoulders"] = 0.10
            muscleWeights["Biceps"] = 0.06
            muscleWeights["Triceps"] = 0.06
            muscleWeights["Abs"] = 0.06
            
            // Lower body (50%)
            muscleWeights["Quadriceps"] = 0.15
            muscleWeights["Hamstrings"] = 0.15
            muscleWeights["Glutes"] = 0.15
            muscleWeights["Calves"] = 0.05
        }
    }
    
    private func saveGoals() {
        Task {
            do {
                // Get authenticated user
                guard let userId = try? await supabase.auth.session.user.id else {
                    print("❌ User not authenticated")
                    return
                }
                
                // Delete all existing muscle goals first
                try await supabase
                    .from("user_muscle_and_weight")
                    .delete()
                    .eq("user_id", value: userId.uuidString)
                    .execute()
                
                // Insert new muscle goals
                struct MuscleGoalInsert: Encodable {
                    let id: UUID
                    let user_id: UUID
                    let muscle: String
                    let weight: Double
                }
                
                let dbGoals = muscleWeights.map { (muscle, weight) in
                    MuscleGoalInsert(
                        id: UUID(),
                        user_id: userId,
                        muscle: muscle,
                        weight: weight
                    )
                }
                
                try await supabase
                    .from("user_muscle_and_weight")
                    .insert(dbGoals)
                    .execute()
                
                // Refresh the data store
                await userDataStore.refreshMuscleGoals()
                
                // Reset distribution tracking since goals have changed
                do {
                    try await APIService().resetDistributionTracking()
                } catch {
                    print("⚠️ Warning: Failed to reset distribution tracking: \(error)")
                    // Don't fail the goal save if tracking reset fails
                }
                
                print("✅ Muscle goals saved successfully")
                dismiss()
            } catch {
                print("❌ Error saving muscle goals: \(error)")
                errorMessage = "Failed to save muscle goals: \(error.localizedDescription)"
                showError = true
            }
        }
    }
    
    private func handleSendTap() {
        guard !aiInputText.isEmpty else { return }
        processWithAI()
    }
    
    private func processWithAI() {
        isProcessingAI = true
        errorMessage = nil
        showError = false
        
        let inputText = aiInputText
        let currentGoalsContext = muscleWeights
        
        Task {
            do {
                // Call the API to parse muscle goals
                let parsedGoals = try await apiService.parseMuscleGoals(
                    goalsText: inputText,
                    currentGoals: currentGoalsContext
                )
                
                await MainActor.run {
                    // Update muscle weights with AI-generated values
                    // Create a new dictionary to avoid inout issues with @State
                    var updatedWeights = muscleWeights
                    for (muscle, weight) in parsedGoals.weights {
                        updatedWeights[muscle] = weight
                    }
                    muscleWeights = updatedWeights
                    
                    // Clear the input after successful processing
                    aiInputText = ""
                    isProcessingAI = false
                }
                
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to parse muscle goals: \(error.localizedDescription)"
                    showError = true
                    isProcessingAI = false
                }
            }
        }
    }
}

// MARK: - Muscle Preset
enum MusclePreset {
    case even
    case upperPush
    case lowerHinge
    case balancedUpperLower
}

// MARK: - Total Indicator
private struct TotalIndicator: View {
    let total: Double
    let isValid: Bool
    
    var body: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            Image(systemName: isValid ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(isValid ? .green : .orange)
            
            VStack(alignment: .leading, spacing: 2) {
                Text("Total: \(Int(total * 100))%")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Text(isValid ? "Perfect! Sum equals 100%" : "Adjust to reach 100% total")
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            
            Spacer()
        }
        .padding(AppTheme.Spacing.lg)
        .background(isValid ? Color.green.opacity(0.1) : Color.orange.opacity(0.1))
        .cornerRadius(AppTheme.CornerRadius.medium)
        .padding(.horizontal, AppTheme.Spacing.xl)
    }
}

// MARK: - Muscle Slider Row
private struct MuscleSliderRow: View {
    let name: String
    @Binding var weight: Double
    
    var body: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            Text(name)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 100, alignment: .leading)
            
            Slider(value: $weight, in: 0...0.5, step: 0.01)
                .tint(AppTheme.Colors.primaryText)
            
            Text("\(Int(weight * 100))%")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 45, alignment: .trailing)
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.vertical, AppTheme.Spacing.md)
        .background(AppTheme.Colors.cardBackground)
        .cornerRadius(AppTheme.CornerRadius.small)
    }
}

// MARK: - Preset Button
private struct PresetButton: View {
    let title: String
    let description: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: AppTheme.Spacing.md) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
            }
            .padding(AppTheme.Spacing.lg)
            .background(AppTheme.Colors.cardBackground)
            .cornerRadius(AppTheme.CornerRadius.medium)
        }
    }
}

// MARK: - Send Button
private struct SendButton: View {
    let isProcessing: Bool
    let isEnabled: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            ZStack {
                // Background circle
                Circle()
                    .fill(isEnabled && !isProcessing ? Color.blue : AppTheme.Colors.secondaryText)
                    .frame(width: 44, height: 44)
                
                // Icon
                if isProcessing {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.9)
                } else {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
        }
        .disabled(!isEnabled || isProcessing)
    }
}

#Preview {
    MuscleGoalSetterView()
}

