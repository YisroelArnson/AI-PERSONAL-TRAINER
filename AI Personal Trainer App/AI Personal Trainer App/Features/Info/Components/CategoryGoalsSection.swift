//
//  CategoryGoalsSection.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct CategoryGoalsSection: View {
    @Binding var showingCategoryAIAssist: Bool
    @Binding var showingCategoryGoalSetter: Bool
    @EnvironmentObject var userDataStore: UserDataStore
    
    // What's Influencing Today data (TODO: fetch from backend)
    @State private var influences: [CategoryInfluence] = []
    @State private var showingInfluenceModal = false
    
    // Distribution tracking
    @State private var distributionMetrics: DistributionMetrics?
    @State private var isLoadingDistribution = false
    
    var enabledCategories: [CategoryGoalItem] {
        userDataStore.categoryGoals.filter { $0.enabled }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            // Section Header
            HStack(alignment: .center) {
                Text("Category Goals")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Spacer()
                
                HStack(spacing: AppTheme.Spacing.md) {
                    // AI Assist Button
                    ActionButton(icon: "sparkles") {
                        showingCategoryAIAssist = true
                    }
                    
                    // Edit Button
                    ActionButton(icon: "pencil") {
                        showingCategoryGoalSetter = true
                    }
                }
            }
            
            // Body Content
            if userDataStore.isLoadingAll || userDataStore.isLoadingCategories {
                ProgressView("Loading...")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, AppTheme.Spacing.xxxl)
            } else if userDataStore.categoryGoals.isEmpty {
                EmptyCategoryGoalsState(
                    showingCategoryAIAssist: $showingCategoryAIAssist,
                    showingCategoryGoalSetter: $showingCategoryGoalSetter
                )
            } else {
                VStack(spacing: AppTheme.Spacing.lg) {
                    // Category chips with percentage bars (only enabled ones)
                    VStack(spacing: AppTheme.Spacing.md) {
                        ForEach(enabledCategories) { category in
                            CategoryChip(
                                category: category,
                                distributionData: distributionMetrics?.categories[category.category]
                            )
                        }
                    }
                    
                    // View presets link
                    Button(action: {
                        showingCategoryGoalSetter = true
                    }) {
                        Text("View presets")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                    
                    // What's Influencing Today
                    if !influences.isEmpty {
                        Divider()
                            .padding(.vertical, AppTheme.Spacing.xs)
                        
                        InfluenceRow(
                            influences: influences,
                            onWhyTapped: {
                                showingInfluenceModal = true
                            }
                        )
                    }
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.cardBackground)
        .cornerRadius(AppTheme.CornerRadius.large)
        .shadow(
            color: AppTheme.Shadow.card,
            radius: AppTheme.Shadow.cardRadius,
            x: AppTheme.Shadow.cardOffset.width,
            y: AppTheme.Shadow.cardOffset.height
        )
        .sheet(isPresented: $showingInfluenceModal) {
            CategoryInfluenceModal(
                showingCategoryGoalSetter: $showingCategoryGoalSetter
            )
        }
        .onAppear {
            Task {
                await loadDistribution()
            }
        }
        .onChange(of: userDataStore.categoryGoals) {
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

// MARK: - Category Influence Model
struct CategoryInfluence {
    let name: String
    let change: Double
    let isIncrease: Bool
}

// MARK: - Category Chip
private struct CategoryChip: View {
    let category: CategoryGoalItem
    let distributionData: DistributionData?
    
    var categoryColor: Color {
        // Assign colors based on category name
        switch category.category.lowercased() {
        case let name where name.contains("strength"):
            return .orange
        case let name where name.contains("cardio") || name.contains("zone"):
            return .blue
        case let name where name.contains("stability") || name.contains("mobility"):
            return .purple
        case let name where name.contains("vo₂") || name.contains("vo2"):
            return .red
        default:
            return .green
        }
    }
    
    var actualColor: Color {
        guard let data = distributionData else { return categoryColor }
        return data.statusColor
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack(spacing: 6) {
                Text(category.category)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Spacer()
                
                // Show "actual vs goal" format if distribution data available
                if let data = distributionData {
                    HStack(spacing: 3) {
                        // Actual percentage (bold, primary)
                        Text("\(Int(data.actual * 100))%")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        
                        // Separator and goal percentage (lighter, secondary)
                        Text("/ \(Int(data.target * 100))% goal")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                    
                    // Status indicator
                    if !data.isOnTarget {
                        // Actual exceeds or falls short of goal - just show arrow
                        Image(systemName: data.debt > 0 ? "arrow.up" : "arrow.down")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(data.debt > 0 ? .green : .red)
                    } else {
                        // On target - show checkmark
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.green)
                    }
                } else {
                    // No distribution data - show target only
                    Text("\(Int(category.weight * 100))% goal")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(AppTheme.Colors.background.opacity(0.5))
        .cornerRadius(AppTheme.CornerRadius.small)
    }
}

// MARK: - Influence Row
private struct InfluenceRow: View {
    let influences: [CategoryInfluence]
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
                            .foregroundColor(influences[index].isIncrease ? .green : .red)
                        
                        Text(influences[index].name)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        
                        Text(String(format: "%+.2f", influences[index].change))
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                }
            }
            
            Text("·")
                .font(.system(size: 12))
                .foregroundColor(AppTheme.Colors.tertiaryText)
            
            Button(action: onWhyTapped) {
                Text("Why?")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.blue)
            }
        }
    }
}

// MARK: - Empty State
private struct EmptyCategoryGoalsState: View {
    @Binding var showingCategoryAIAssist: Bool
    @Binding var showingCategoryGoalSetter: Bool
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            Text("No goals yet.")
                .font(.body)
                .foregroundColor(AppTheme.Colors.secondaryText)
            
            Text("Pick a preset or use AI Assist.")
                .font(.body)
                .foregroundColor(AppTheme.Colors.secondaryText)
            
            HStack(spacing: AppTheme.Spacing.md) {
                Button(action: {
                    showingCategoryAIAssist = true
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                        Text("AI Assist")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(AppTheme.Colors.cardBackground)
                    .padding(.horizontal, AppTheme.Spacing.lg)
                    .padding(.vertical, 10)
                    .background(AppTheme.Colors.primaryText)
                    .cornerRadius(AppTheme.CornerRadius.small)
                }
                
                Button(action: {
                    showingCategoryGoalSetter = true
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Set Goals")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.horizontal, AppTheme.Spacing.lg)
                    .padding(.vertical, 10)
                    .background(AppTheme.Colors.background)
                    .cornerRadius(AppTheme.CornerRadius.small)
                    .overlay(
                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                            .stroke(AppTheme.Colors.border, lineWidth: 1)
                    )
                }
            }
            .padding(.top, AppTheme.Spacing.sm)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppTheme.Spacing.xxxl)
    }
}

// MARK: - Category Influence Modal
private struct CategoryInfluenceModal: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var showingCategoryGoalSetter: Bool
    
    var body: some View {
        NavigationView {
            VStack(spacing: AppTheme.Spacing.xl) {
                Text("What's Influencing Your Categories")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.top, AppTheme.Spacing.xl)
                
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    InfluenceDriverRow(
                        icon: "figure.strengthtraining.traditional",
                        title: "Strength under-target",
                        description: "You've completed only 35% strength this week vs. 50% goal",
                        change: "+0.25"
                    )
                    
                    InfluenceDriverRow(
                        icon: "figure.run",
                        title: "Cardio over-target",
                        description: "You've completed 48% cardio this week vs. 40% goal",
                        change: "-0.10"
                    )
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                
                Spacer()
                
                Button(action: {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        showingCategoryGoalSetter = true
                    }
                }) {
                    Text("Adjust Category Goals")
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

// MARK: - Influence Driver Row
private struct InfluenceDriverRow: View {
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
                .background(AppTheme.Colors.background)
                .cornerRadius(AppTheme.CornerRadius.small)
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    
                    Spacer()
                    
                    Text(change)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(change.hasPrefix("+") ? .green : .red)
                }
                
                Text(description)
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .lineLimit(2)
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(AppTheme.Colors.cardBackground)
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
                .background(AppTheme.Colors.cardBackground)
                .cornerRadius(AppTheme.CornerRadius.small)
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                        .stroke(AppTheme.Colors.border, lineWidth: 1)
                )
        }
    }
}

#Preview {
    CategoryGoalsSection(
        showingCategoryAIAssist: .constant(false),
        showingCategoryGoalSetter: .constant(false)
    )
    .padding()
    .background(AppTheme.Colors.background)
}

