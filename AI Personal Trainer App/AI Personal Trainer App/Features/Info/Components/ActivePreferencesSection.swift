//
//  ActivePreferencesSection.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct ActivePreferencesSection: View {
    @Binding var showingAddPreference: Bool
    @Binding var showingPreferencesManager: Bool
    @EnvironmentObject var userDataStore: UserDataStore
    
    var enabledPreferences: [UserPreference] {
        userDataStore.preferences.filter { $0.enabled }
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
                
                HStack(spacing: AppTheme.Spacing.md) {
                    // Add Preference Button
                    ActionButton(icon: "plus") {
                        showingPreferencesManager = true
                    }
                    
                    // AI Assist Button
                    ActionButton(icon: "sparkles") {
                        showingAddPreference = true
                    }
                }
            }
            
            // Body Content
            if enabledPreferences.isEmpty {
                // Empty State
                EmptyPreferencesState(showingAddPreference: $showingAddPreference)
            } else {
                // Display Preferences
                VStack(spacing: AppTheme.Spacing.md) {
                    ForEach(enabledPreferences) { preference in
                        PreferenceCard(preference: preference)
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
        .cornerRadius(AppTheme.CornerRadius.medium)
    }
}

#Preview {
    ActivePreferencesSection(
        showingAddPreference: .constant(false),
        showingPreferencesManager: .constant(false)
    )
    .environmentObject(UserDataStore.shared)
    .padding()
    .background(AppTheme.Colors.background)
}

