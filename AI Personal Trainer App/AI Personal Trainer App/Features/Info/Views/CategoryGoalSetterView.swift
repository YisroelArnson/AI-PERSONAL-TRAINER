//
//  CategoryGoalSetterView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct CategoryGoalSetterView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var userDataStore: UserDataStore
    
    // Local editable copy of category goals
    @State private var categoryGoals: [CategoryGoalItem] = []
    @State private var showingAddCategory = false
    @State private var showingPresets = false
    
    var enabledGoals: [CategoryGoalItem] {
        categoryGoals.filter { $0.enabled }
    }
    
    var disabledGoals: [CategoryGoalItem] {
        categoryGoals.filter { !$0.enabled }
    }
    
    var totalWeight: Double {
        enabledGoals.reduce(0) { $0 + $1.weight }
    }
    
    var isValidTotal: Bool {
        abs(totalWeight - 1.0) < 0.001
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                if userDataStore.isLoadingAll || userDataStore.isLoadingCategories {
                    ProgressView("Loading goals...")
                        .foregroundColor(AppTheme.Colors.secondaryText)
                } else {
                    ScrollView {
                        VStack(spacing: AppTheme.Spacing.xl) {
                            // Total indicator (only show if there are goals)
                            if !categoryGoals.isEmpty {
                                TotalIndicator(total: totalWeight, isValid: isValidTotal)
                            }
                            
                            // Add new category button
                            Button(action: { showingAddCategory = true }) {
                                HStack(spacing: 6) {
                                    Image(systemName: "plus.circle.fill")
                                        .font(.system(size: 16, weight: .semibold))
                                    Text("Add Category")
                                        .font(.system(size: 15, weight: .semibold))
                                }
                                .foregroundColor(.blue)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(AppTheme.Colors.cardBackground)
                                .cornerRadius(AppTheme.CornerRadius.small)
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                        .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                                )
                            }
                            .padding(.horizontal, AppTheme.Spacing.xl)
                            
                            // Categories section or empty state
                            if categoryGoals.isEmpty {
                                // Inline empty state (not full screen)
                                VStack(spacing: AppTheme.Spacing.lg) {
                                    Image(systemName: "chart.bar.doc.horizontal")
                                        .font(.system(size: 50, weight: .light))
                                        .foregroundColor(AppTheme.Colors.tertiaryText)
                                    
                                    VStack(spacing: AppTheme.Spacing.sm) {
                                        Text("No Category Goals")
                                            .font(.headline)
                                            .foregroundColor(AppTheme.Colors.primaryText)
                                        
                                        Text("Add a category above or choose from presets below")
                                            .font(.subheadline)
                                            .foregroundColor(AppTheme.Colors.secondaryText)
                                            .multilineTextAlignment(.center)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, AppTheme.Spacing.xxxl)
                                .padding(.horizontal, AppTheme.Spacing.xl)
                            } else {
                                // Enabled category sliders
                                if !enabledGoals.isEmpty {
                                    VStack(spacing: AppTheme.Spacing.lg) {
                                        ForEach(enabledGoals) { goal in
                                            CategoryGoalRow(
                                                goal: binding(for: goal.id),
                                                onEdit: { editCategory(goal) },
                                                onDelete: { deleteCategory(goal.id) }
                                            )
                                        }
                                    }
                                    .padding(.horizontal, AppTheme.Spacing.xl)
                                }
                                
                                // Disabled category sliders (dimmed)
                                if !disabledGoals.isEmpty {
                                    VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                                        Text("Disabled Categories")
                                            .font(.subheadline)
                                            .foregroundColor(AppTheme.Colors.tertiaryText)
                                            .padding(.horizontal, AppTheme.Spacing.xl)
                                        
                                        VStack(spacing: AppTheme.Spacing.lg) {
                                            ForEach(disabledGoals) { goal in
                                                CategoryGoalRow(
                                                    goal: binding(for: goal.id),
                                                    onEdit: { editCategory(goal) },
                                                    onDelete: { deleteCategory(goal.id) }
                                                )
                                                .opacity(0.5)
                                            }
                                        }
                                        .padding(.horizontal, AppTheme.Spacing.xl)
                                    }
                                }
                                
                                // Normalize button (only show if there are goals)
                                Button(action: normalize) {
                                    HStack(spacing: 6) {
                                        Image(systemName: "equal.circle")
                                            .font(.system(size: 14, weight: .semibold))
                                        Text("Normalize to 100%")
                                            .font(.system(size: 15, weight: .semibold))
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
                                .padding(.horizontal, AppTheme.Spacing.xl)
                            }
                            
                            // Presets section (always visible)
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                                Text("Presets")
                                    .font(.headline)
                                    .foregroundColor(AppTheme.Colors.primaryText)
                                
                                Text("Presets will replace your current goals")
                                    .font(.caption)
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                
                                VStack(spacing: AppTheme.Spacing.sm) {
                                    PresetButton(
                                        title: "Balanced",
                                        description: "Equal focus on all categories"
                                    ) {
                                        applyPreset(.balanced)
                                    }
                                    
                                    PresetButton(
                                        title: "Peter Attia Style",
                                        description: "Stability, Strength, Zone 2, VO₂ max"
                                    ) {
                                        applyPreset(.peterAttia)
                                    }
                                    
                                    PresetButton(
                                        title: "Strength-Focused",
                                        description: "70% Strength, 20% Cardio, 10% Stability"
                                    ) {
                                        applyPreset(.strengthFocused)
                                    }
                                }
                            }
                            .padding(.horizontal, AppTheme.Spacing.xl)
                            .padding(.top, AppTheme.Spacing.lg)
                        }
                        .padding(.top, AppTheme.Spacing.xl)
                        .padding(.bottom, 100)
                    }
                }
                
                // Save button (fixed at bottom)
                VStack {
                    Spacer()
                    
                    Button(action: saveGoals) {
                        Text("Save Goals")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(AppTheme.Colors.cardBackground)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background((isValidTotal || categoryGoals.isEmpty) ? AppTheme.Colors.primaryText : AppTheme.Colors.border)
                            .cornerRadius(AppTheme.CornerRadius.small)
                    }
                    .disabled(!isValidTotal && !categoryGoals.isEmpty)
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.bottom, AppTheme.Spacing.xl)
                    .background(
                        LinearGradient(
                            gradient: Gradient(colors: [
                                AppTheme.Colors.background.opacity(0),
                                AppTheme.Colors.background
                            ]),
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(height: 100)
                    )
                }
            }
            .navigationTitle("Category Goals")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .onAppear {
            // Load from data store (instant!)
            categoryGoals = userDataStore.categoryGoals
        }
        .sheet(isPresented: $showingAddCategory) {
            AddCategorySheet(onSave: { newGoal in
                categoryGoals.append(newGoal)
            })
        }
    }
    
    private func binding(for id: UUID) -> Binding<CategoryGoalItem> {
        Binding(
            get: {
                categoryGoals.first(where: { $0.id == id }) ?? CategoryGoalItem(category: "", description: "", weight: 0.0)
            },
            set: { newValue in
                if let index = categoryGoals.firstIndex(where: { $0.id == id }) {
                    categoryGoals[index] = newValue
                }
            }
        )
    }
    
    private func editCategory(_ goal: CategoryGoalItem) {
        // Will be implemented with edit sheet
    }
    
    private func deleteCategory(_ id: UUID) {
        categoryGoals.removeAll { $0.id == id }
    }
    
    private func normalize() {
        let total = totalWeight
        if total > 0 {
            for index in categoryGoals.indices where categoryGoals[index].enabled {
                categoryGoals[index].weight /= total
            }
        }
    }
    
    private func applyPreset(_ preset: CategoryPreset) {
        switch preset {
        case .balanced:
            // Equal weight for all enabled categories
            let equalWeight = 1.0 / Double(max(enabledGoals.count, 1))
            for index in categoryGoals.indices where categoryGoals[index].enabled {
                categoryGoals[index].weight = equalWeight
            }
            
        case .peterAttia:
            // Peter Attia's longevity-focused approach
            categoryGoals = [
                CategoryGoalItem(category: "Stability & Mobility", description: "Foundation exercises that make you hard to injure by improving joint control and usable range", weight: 0.15),
                CategoryGoalItem(category: "Strength", description: "Compound lifts across hinge/squat/push/pull/carry/lunge patterns with progressive overload", weight: 0.45),
                CategoryGoalItem(category: "Zone 2 Cardio", description: "Steady, easy-to-moderate work that builds mitochondrial/metabolic health", weight: 0.20),
                CategoryGoalItem(category: "VO₂ Max Training", description: "Short, very hard intervals to raise your ceiling for work and longevity markers", weight: 0.20)
            ]
            
        case .strengthFocused:
            categoryGoals = [
                CategoryGoalItem(category: "Strength", description: "Build muscle mass and power", weight: 0.70),
                CategoryGoalItem(category: "Cardio", description: "Improve cardiovascular endurance", weight: 0.20),
                CategoryGoalItem(category: "Stability", description: "Build balance and core stability", weight: 0.10)
            ]
        }
    }
    
    private func saveGoals() {
        Task {
            do {
                // Save each goal to database individually
                guard let userId = try? await supabase.auth.session.user.id else {
                    print("❌ User not authenticated")
                    return
                }
                
                // Delete all existing goals first
                try await supabase
                    .from("user_category_and_weight")
                    .delete()
                    .eq("user_id", value: userId.uuidString)
                    .execute()
                
                // Insert new goals
                if !categoryGoals.isEmpty {
                    struct CategoryGoalInsert: Encodable {
                        let id: UUID
                        let user_id: UUID
                        let category: String
                        let description: String
                        let weight: Double
                        let enabled: Bool
                    }
                    
                    let dbGoals = categoryGoals.map { goal in
                        CategoryGoalInsert(
                            id: goal.id,
                            user_id: userId,
                            category: goal.category,
                            description: goal.description,
                            weight: goal.weight,
                            enabled: goal.enabled
                        )
                    }
                    
                    try await supabase
                        .from("user_category_and_weight")
                        .insert(dbGoals)
                        .execute()
                }
                
                // Refresh the data store
                await userDataStore.refreshCategoryGoals()
                
                print("✅ Category goals saved successfully")
                dismiss()
            } catch {
                print("❌ Error saving goals: \(error)")
            }
        }
    }
}

// MARK: - Category Preset
enum CategoryPreset {
    case balanced
    case peterAttia
    case strengthFocused
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

// MARK: - Category Slider
private struct CategorySlider: View {
    let name: String
    let description: String
    @Binding var weight: Double
    let color: Color
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                
                Spacer()
                
                Text("\(Int(weight * 100))%")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(color)
                    .frame(minWidth: 60, alignment: .trailing)
            }
            
            Slider(value: $weight, in: 0...1, step: 0.01)
                .tint(color)
        }
        .padding(AppTheme.Spacing.lg)
        .background(AppTheme.Colors.cardBackground)
        .cornerRadius(AppTheme.CornerRadius.medium)
        .shadow(
            color: AppTheme.Shadow.card,
            radius: AppTheme.Shadow.cardRadius,
            x: AppTheme.Shadow.cardOffset.width,
            y: AppTheme.Shadow.cardOffset.height
        )
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

// MARK: - Category Goal Row
private struct CategoryGoalRow: View {
    @Binding var goal: CategoryGoalItem
    let onEdit: () -> Void
    let onDelete: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(goal.category)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    
                    Text(goal.description)
                        .font(.system(size: 13))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .lineLimit(2)
                }
                
                Spacer()
                
                Text("\(Int(goal.weight * 100))%")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(minWidth: 60, alignment: .trailing)
            }
            
            Slider(value: $goal.weight, in: 0...1, step: 0.01)
                .tint(.blue)
                .disabled(!goal.enabled)
            
            HStack(spacing: AppTheme.Spacing.md) {
                Toggle("Enabled", isOn: $goal.enabled)
                    .labelsHidden()
                
                Text(goal.enabled ? "Enabled" : "Disabled")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(goal.enabled ? .green : AppTheme.Colors.tertiaryText)
                
                Spacer()
                
                Button(action: onDelete) {
                    Image(systemName: "trash")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.red)
                }
            }
        }
        .padding(AppTheme.Spacing.lg)
        .background(AppTheme.Colors.cardBackground)
        .cornerRadius(AppTheme.CornerRadius.medium)
        .shadow(
            color: AppTheme.Shadow.card,
            radius: AppTheme.Shadow.cardRadius,
            x: AppTheme.Shadow.cardOffset.width,
            y: AppTheme.Shadow.cardOffset.height
        )
    }
}

// MARK: - Empty State for Setter
private struct EmptyCategoryGoalsSetterState: View {
    @Binding var showingAddCategory: Bool
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Image(systemName: "chart.bar.doc.horizontal")
                .font(.system(size: 60, weight: .light))
                .foregroundColor(AppTheme.Colors.tertiaryText)
            
            VStack(spacing: AppTheme.Spacing.sm) {
                Text("No Category Goals")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Text("Add your first category goal or choose from presets below")
                    .font(.body)
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
            }
            
            Button(action: { showingAddCategory = true }) {
                HStack(spacing: 8) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Add Category Goal")
                        .font(.system(size: 16, weight: .semibold))
                }
                .foregroundColor(AppTheme.Colors.cardBackground)
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.vertical, 14)
                .background(AppTheme.Colors.primaryText)
                .cornerRadius(AppTheme.CornerRadius.small)
            }
        }
        .padding(AppTheme.Spacing.xxxl)
    }
}

// MARK: - Add Category Sheet
private struct AddCategorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (CategoryGoalItem) -> Void
    
    @State private var category: String = ""
    @State private var description: String = ""
    @State private var weight: Double = 0.0
    @State private var enabled: Bool = true
    
    var isValid: Bool {
        !category.isEmpty && !description.isEmpty
    }
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Category Details")) {
                    TextField("Category Name", text: $category)
                    TextField("Description", text: $description)
                }
                
                Section(header: Text("Weight")) {
                    HStack {
                        Text("Weight: \(Int(weight * 100))%")
                        Spacer()
                    }
                    Slider(value: $weight, in: 0...1, step: 0.01)
                }
                
                Section {
                    Toggle("Enabled", isOn: $enabled)
                }
            }
            .navigationTitle("Add Category")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        let newGoal = CategoryGoalItem(
                            category: category,
                            description: description,
                            weight: weight,
                            enabled: enabled
                        )
                        onSave(newGoal)
                        dismiss()
                    }
                    .disabled(!isValid)
                }
            }
        }
    }
}

#Preview {
    CategoryGoalSetterView()
}

