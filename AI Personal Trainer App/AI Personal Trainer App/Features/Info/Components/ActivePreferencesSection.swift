//
//  ActivePreferencesSection.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct ActivePreferencesSection: View {
    @Binding var showingAddPreference: Bool
    @Binding var selectedPreference: UserPreference?
    @EnvironmentObject var userDataStore: UserDataStore
    
    // Delete state
    @State private var showDeleteError: Bool = false
    @State private var deleteErrorMessage: String = ""
    
    var enabledPreferences: [UserPreference] {
        userDataStore.preferences
    }
    
    // Group and sort preferences
    var groupedAndSortedPreferences: [(String, [UserPreference])] {
        let grouped = Dictionary(grouping: enabledPreferences) { $0.type }
        
        // Sort each group
        return grouped.map { (type, preferences) in
            let sorted = preferences.sorted { pref1, pref2 in
                // Delete after call comes first
                if pref1.deleteAfterCall && !pref2.deleteAfterCall {
                    return true
                } else if !pref1.deleteAfterCall && pref2.deleteAfterCall {
                    return false
                }
                
                // Then permanent (no expireTime) comes before temporary
                let isPerm1 = pref1.expireTime == nil && !pref1.deleteAfterCall
                let isPerm2 = pref2.expireTime == nil && !pref2.deleteAfterCall
                
                if isPerm1 && !isPerm2 {
                    return true
                } else if !isPerm1 && isPerm2 {
                    return false
                }
                
                // Among temporary, sort by expiration (earlier expires first)
                if let exp1 = pref1.expireTime, let exp2 = pref2.expireTime {
                    return exp1 < exp2
                }
                
                return false
            }
            return (type, sorted)
        }.sorted { $0.0 < $1.0 } // Sort groups alphabetically by type
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            // Section Header
            HStack(alignment: .center) {
                Text("Active Preferences")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Spacer()
                
                // Add Preference Button
                ActionButton(icon: "plus") {
                    showingAddPreference = true
                }
            }
            
            // Body Content
            if enabledPreferences.isEmpty {
                // Empty State
                EmptyPreferencesState(showingAddPreference: $showingAddPreference)
            } else {
                // Display Preferences grouped by type
                VStack(spacing: AppTheme.Spacing.lg) {
                    ForEach(groupedAndSortedPreferences, id: \.0) { (type, preferences) in
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            // Type header
                            Text(type.capitalized.replacingOccurrences(of: "_", with: " "))
                                .font(.headline)
                                .fontWeight(.semibold)
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .padding(.horizontal, AppTheme.Spacing.sm)
                            
                            // Preferences in this type
                            ForEach(preferences) { preference in
                                PreferenceCard(preference: preference)
                                    .onTapGesture {
                                        selectedPreference = preference
                                    }
                                    .contextMenu {
                                        Button(action: {
                                            selectedPreference = preference
                                        }) {
                                            Label("Edit", systemImage: "pencil")
                                        }
                                        
                                        Button(role: .destructive, action: {
                                            deletePreference(preference)
                                        }) {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                            }
                        }
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
        .alert("Error", isPresented: $showDeleteError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(deleteErrorMessage)
        }
    }
    
    // MARK: - Delete Preference
    private func deletePreference(_ preference: UserPreference) {
        Task {
            do {
                // Delete from Supabase
                try await supabase
                    .from("preferences")
                    .delete()
                    .eq("id", value: preference.id)
                    .execute()
                
                // Update local state
                await MainActor.run {
                    userDataStore.removePreference(id: preference.id)
                }
                
                print("✅ Preference deleted successfully")
                
            } catch {
                await MainActor.run {
                    deleteErrorMessage = "Failed to delete preference: \(error.localizedDescription)"
                    showDeleteError = true
                }
                print("❌ Error deleting preference: \(error)")
            }
        }
    }
}

// MARK: - Action Button
private struct ActionButton: View {
    let icon: String
    var label: String? = nil
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                
                if let label = label {
                    Text(label)
                        .font(.system(size: 14, weight: .semibold))
                }
            }
            .foregroundColor(AppTheme.Colors.primaryText)
            .padding(.horizontal, label != nil ? 12 : 0)
            .frame(height: 36)
            .frame(minWidth: label != nil ? nil : 36)
            .background(AppTheme.Colors.cardBackground)
            .cornerRadius(AppTheme.CornerRadius.small)
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                    .stroke(AppTheme.Colors.border, lineWidth: 1)
            )
        }
    }
}

// MARK: - Preference Card
private struct PreferenceCard: View {
    let preference: UserPreference
    
    var typeIcon: String {
        switch preference.type.lowercased() {
        case "workout": return "figure.run"
        case "injury": return "cross.case.fill"
        case "time": return "clock.fill"
        case "equipment": return "dumbbell.fill"
        case "intensity": return "bolt.fill"
        case "muscle_group": return "figure.arms.open"
        case "exercise": return "figure.strengthtraining.traditional"
        case "goal": return "target"
        case "recovery": return "moon.stars.fill"
        default: return "star.fill"
        }
    }
    
    var typeColor: Color {
        switch preference.type.lowercased() {
        case "injury": return .red
        case "goal": return .blue
        case "equipment": return .purple
        case "intensity": return .orange
        case "workout": return .green
        case "time": return .cyan
        case "muscle_group": return .indigo
        case "recovery": return .mint
        default: return .blue
        }
    }
    
    var body: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
            // Icon
            Image(systemName: typeIcon)
                .font(.system(size: 18))
                .foregroundColor(typeColor)
                .frame(width: 32, height: 32)
                .background(typeColor.opacity(0.1))
                .cornerRadius(AppTheme.CornerRadius.small)
            
            // Content
            VStack(alignment: .leading, spacing: 4) {
                // Type Badge
                Text(preference.type.capitalized.replacingOccurrences(of: "_", with: " "))
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(typeColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(typeColor.opacity(0.1))
                    .cornerRadius(AppTheme.CornerRadius.small)
                
                // Description
                Text(preference.description)
                    .font(.body)
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                // Expiration info
                if let expireTime = preference.expireTime {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.caption2)
                        Text("Expires: \(expireTime.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption)
                    }
                    .foregroundColor(AppTheme.Colors.secondaryText)
                } else if preference.deleteAfterCall {
                    HStack(spacing: 4) {
                        Image(systemName: "hourglass")
                            .font(.caption2)
                        Text("One-time use")
                            .font(.caption)
                    }
                    .foregroundColor(AppTheme.Colors.secondaryText)
                }
            }
            
            Spacer()
        }
        .padding(AppTheme.Spacing.md)
        .background(AppTheme.Colors.background)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
    }
}

#Preview {
    ActivePreferencesSection(
        showingAddPreference: .constant(false),
        selectedPreference: .constant(nil)
    )
    .environmentObject(UserDataStore.shared)
    .padding()
    .background(AppTheme.Colors.background)
}

