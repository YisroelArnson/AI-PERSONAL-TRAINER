//
//  EmptyPreferencesState.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct EmptyPreferencesState: View {
    @Binding var showingAddPreference: Bool
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            Text("No active preferences.")
                .font(.body)
                .foregroundColor(AppTheme.Colors.secondaryText)
            
            Text("Try: ")
                .font(.body)
                .foregroundColor(AppTheme.Colors.secondaryText)
            + Text("'I only have 20 minutes'")
                .font(.body)
                .italic()
                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.8))
            + Text(", ")
                .font(.body)
                .foregroundColor(AppTheme.Colors.secondaryText)
            + Text("'Avoid burpees'")
                .font(.body)
                .italic()
                .foregroundColor(AppTheme.Colors.primaryText.opacity(0.8))
            
            Button(action: {
                showingAddPreference = true
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Add with AI")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(AppTheme.Colors.cardBackground)
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, 10)
                .background(AppTheme.Colors.primaryText)
                .cornerRadius(AppTheme.CornerRadius.small)
            }
            .padding(.top, AppTheme.Spacing.sm)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppTheme.Spacing.xxxl)
    }
}

#Preview {
    EmptyPreferencesState(showingAddPreference: .constant(false))
        .padding()
        .background(AppTheme.Colors.cardBackground)
}

