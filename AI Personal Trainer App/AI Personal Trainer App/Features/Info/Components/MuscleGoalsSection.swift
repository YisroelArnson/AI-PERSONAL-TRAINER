//
//  MuscleGoalsSection.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct MuscleGoalsSection: View {
    @Binding var showingMuscleAIAssist: Bool
    @Binding var showingMuscleGoalSetter: Bool
    @EnvironmentObject var userDataStore: UserDataStore
    
    // Distribution tracking
    @State private var distributionMetrics: DistributionMetrics?
    @State private var isLoadingDistribution = false
    
    // Define the same muscle order as MuscleGoalSetterView
    private let muscleOrder = [
        "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Abs", "Lower Back", "Quadriceps",
        "Hamstrings", "Glutes", "Calves", "Trapezius", "Abductors", "Adductors", "Forearms", "Neck"
    ]
    
    // Convert userDataStore.muscleGoals to display format and sort by muscleOrder
    var muscles: [MuscleGoal] {
        let muscleGoals = userDataStore.muscleGoals.map { item in
            MuscleGoal(name: item.muscle, weight: item.weight)
        }
        
        // Sort by the predefined muscle order
        return muscleGoals.sorted { muscle1, muscle2 in
            let index1 = muscleOrder.firstIndex(of: muscle1.name) ?? Int.max
            let index2 = muscleOrder.firstIndex(of: muscle2.name) ?? Int.max
            return index1 < index2
        }
    }
    
    // What's Influencing Today data
    let muscleInfluences: [MuscleInfluence] = [
        MuscleInfluence(name: "Glutes", change: 0.20, isIncrease: true),
        MuscleInfluence(name: "Shoulders", change: -0.45, isIncrease: false)
    ]
    
    @State private var showingInfluenceModal = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            // Section Header
            HStack(alignment: .center) {
                Text("Muscle Goals")
                    .font(AppTheme.Typography.screenTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Spacer()
                
                HStack(spacing: AppTheme.Spacing.md) {
                    // AI Assist Button
                    ActionButton(icon: "sparkles") {
                        showingMuscleAIAssist = true
                    }
                    
                    // Edit Button
                    ActionButton(icon: "pencil") {
                        showingMuscleGoalSetter = true
                    }
                }
            }
            
            // Body Content
            if muscles.isEmpty {
                EmptyMuscleGoalsState(
                    showingMuscleAIAssist: $showingMuscleAIAssist,
                    showingMuscleGoalSetter: $showingMuscleGoalSetter
                )
            } else {
                VStack(spacing: AppTheme.Spacing.lg) {
                    // Muscle grid - display all muscles
                    LazyVGrid(columns: [
                        GridItem(.flexible(), spacing: AppTheme.Spacing.sm),
                        GridItem(.flexible(), spacing: AppTheme.Spacing.sm),
                        GridItem(.flexible(), spacing: AppTheme.Spacing.sm)
                    ], spacing: AppTheme.Spacing.sm) {
                        ForEach(muscles) { muscle in
                            MuscleCell(
                                muscle: muscle,
                                distributionData: distributionMetrics?.muscles[muscle.name]
                            )
                        }
                    }
                    
                    // What's Influencing Today
                    if !muscleInfluences.isEmpty {
                        Divider()
                            .padding(.vertical, AppTheme.Spacing.xs)
                        
                        MuscleInfluenceRow(
                            influences: muscleInfluences,
                            onWhyTapped: {
                                showingInfluenceModal = true
                            }
                        )
                    }
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
        .sheet(isPresented: $showingInfluenceModal) {
            MuscleInfluenceModal(
                showingMuscleGoalSetter: $showingMuscleGoalSetter
            )
        }
        .onAppear {
            Task {
                await loadDistribution()
            }
        }
        .onChange(of: userDataStore.muscleGoals) { _ in
            // Reload when goals change
            Task {
                await loadDistribution()
            }
        }
    }
    
    @MainActor
    private func loadDistribution() async {
        isLoadingDistribution = true
        defer { isLoadingDistribution = false }
        
        do {
            distributionMetrics = try await APIService().fetchDistributionMetrics()
        } catch {
            print("Failed to load distribution: \(error)")
            // Silently fail - show goals without distribution
        }
    }
}

// MARK: - Muscle Goal Model
struct MuscleGoal: Identifiable {
    let id = UUID()
    let name: String
    let weight: Double
}

// MARK: - Muscle Influence Model
struct MuscleInfluence {
    let name: String
    let change: Double
    let isIncrease: Bool
}

// MARK: - Muscle Cell
private struct MuscleCell: View {
    let muscle: MuscleGoal
    let distributionData: DistributionData?
    
    var actualColor: Color {
        AppTheme.Colors.primaryText
    }
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.xs) {
            // Enhanced circular progress indicator
            ZStack {
                // Background circle (target)
                Circle()
                    .stroke(AppTheme.Colors.divider, lineWidth: 4)
                    .frame(width: 44, height: 44)
                
                if let data = distributionData {
                    // Target ring (lighter)
                    Circle()
                        .trim(from: 0, to: data.target)
                        .stroke(
                            AppTheme.Colors.highlight,
                            style: StrokeStyle(lineWidth: 4, lineCap: .round)
                        )
                        .frame(width: 44, height: 44)
                        .rotationEffect(.degrees(-90))
                    
                    // Actual ring (overlay)
                    Circle()
                        .trim(from: 0, to: min(data.actual, 1.0))
                        .stroke(
                            AppTheme.Colors.primaryText,
                            style: StrokeStyle(lineWidth: 4, lineCap: .round)
                        )
                        .frame(width: 44, height: 44)
                        .rotationEffect(.degrees(-90))
                    
                    // Show target percentage in center (not actual)
                    VStack(spacing: 0) {
                        Text("\(Int(data.target * 100))")
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                } else {
                    // No distribution data - show target only
                    Circle()
                        .trim(from: 0, to: muscle.weight)
                        .stroke(
                            AppTheme.Colors.primaryText,
                            style: StrokeStyle(lineWidth: 4, lineCap: .round)
                        )
                        .frame(width: 44, height: 44)
                        .rotationEffect(.degrees(-90))
                    
                    Text("\(Int(muscle.weight * 100))")
                        .font(AppTheme.Typography.label)
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
            
            // Muscle name
            Text(muscle.name)
                .font(AppTheme.Typography.label)
                .foregroundColor(muscle.weight > 0 ? AppTheme.Colors.primaryText : AppTheme.Colors.tertiaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            
            // Debt indicator (NEW)
            if let data = distributionData, !data.isOnTarget {
                Text(data.debtText)
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            } else if let data = distributionData, data.isOnTarget {
                Image(systemName: "checkmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppTheme.Spacing.md)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.small)
        .opacity(muscle.weight > 0 ? 1.0 : 0.5)
    }
}

// MARK: - Muscle Influence Row
private struct MuscleInfluenceRow: View {
    let influences: [MuscleInfluence]
    let onWhyTapped: () -> Void
    
    var body: some View {
        HStack(spacing: 4) {
            HStack(spacing: 6) {
                ForEach(influences.indices, id: \.self) { index in
                    if index > 0 {
                        Text(",")
                            .font(.system(size: 12))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                    }
                    
                    HStack(spacing: 3) {
                        Image(systemName: influences[index].isIncrease ? "arrow.up" : "arrow.down")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                        
                        Text(influences[index].name)
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.primaryText)
                        
                        Text(String(format: "%+.2f", influences[index].change))
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                }
            }
            
            Text("·")
                .font(.system(size: 12))
                .foregroundColor(AppTheme.Colors.tertiaryText)
            
            Button(action: onWhyTapped) {
                Text("Why?")
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
        }
    }
}

// MARK: - Empty State
private struct EmptyMuscleGoalsState: View {
    @Binding var showingMuscleAIAssist: Bool
    @Binding var showingMuscleGoalSetter: Bool
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            Text("Start from equal weights or use AI Assist.")
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)
            
            HStack(spacing: AppTheme.Spacing.md) {
                Button(action: {
                    showingMuscleAIAssist = true
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                        Text("AI Assist")
                            .font(AppTheme.Typography.button)
                    }
                    .foregroundColor(AppTheme.Colors.background)
                    .padding(.horizontal, AppTheme.Spacing.lg)
                    .padding(.vertical, 10)
                    .background(AppTheme.Colors.accent)
                    .cornerRadius(AppTheme.CornerRadius.small)
                }
                
                Button(action: {
                    showingMuscleGoalSetter = true
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Set Goals")
                            .font(AppTheme.Typography.button)
                    }
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.horizontal, AppTheme.Spacing.lg)
                    .padding(.vertical, 10)
                    .background(AppTheme.Colors.surface)
                    .cornerRadius(AppTheme.CornerRadius.small)
                }
            }
            .padding(.top, AppTheme.Spacing.sm)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppTheme.Spacing.xxxl)
    }
}

// MARK: - Muscle Influence Modal
private struct MuscleInfluenceModal: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var showingMuscleGoalSetter: Bool
    
    var body: some View {
        NavigationView {
            VStack(spacing: AppTheme.Spacing.xl) {
                Text("What's Influencing Your Muscles")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.top, AppTheme.Spacing.xl)
                
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    MuscleInfluenceDriverRow(
                        icon: "figure.strengthtraining.traditional",
                        title: "Glutes under-target",
                        description: "You've worked glutes 8% this week vs. 15% goal",
                        change: "+0.20"
                    )
                    
                    MuscleInfluenceDriverRow(
                        icon: "figure.arms.open",
                        title: "Shoulders over-target",
                        description: "You've worked shoulders 18% this week vs. 10% goal",
                        change: "-0.45"
                    )
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                
                Spacer()
                
                Button(action: {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        showingMuscleGoalSetter = true
                    }
                }) {
                    Text("Adjust Muscle Goals")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.cardBackground)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(AppTheme.Colors.primaryText)
                        .cornerRadius(AppTheme.CornerRadius.small)
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.bottom, AppTheme.Spacing.xl)
            }
            .background(AppTheme.Colors.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Muscle Influence Driver Row
private struct MuscleInfluenceDriverRow: View {
    let icon: String
    let title: String
    let description: String
    let change: String
    
    var body: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .medium))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 32, height: 32)
                .background(AppTheme.Colors.surface)
                .cornerRadius(AppTheme.CornerRadius.small)
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(title)
                        .font(AppTheme.Typography.cardTitle)
                        .foregroundColor(AppTheme.Colors.primaryText)
                    
                    Spacer()
                    
                    Text(change)
                        .font(AppTheme.Typography.caption)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                
                Text(description)
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .lineLimit(2)
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.medium)
    }
}

// MARK: - Action Button
private struct ActionButton: View {
    let icon: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 36, height: 36)
                .background(AppTheme.Colors.surface)
                .cornerRadius(AppTheme.CornerRadius.small)
        }
    }
}

#Preview {
    MuscleGoalsSection(
        showingMuscleAIAssist: .constant(false),
        showingMuscleGoalSetter: .constant(false)
    )
    .padding()
    .background(AppTheme.Colors.background)
}
