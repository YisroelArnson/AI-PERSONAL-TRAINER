//
//  CurrentLocationPill.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct CurrentLocationPill: View {
    @EnvironmentObject var userDataStore: UserDataStore
    @Binding var showingLocationsList: Bool
    
    var body: some View {
        Button(action: {
            showingLocationsList = true
        }) {
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: "location.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.7))
                
                Text(currentLocationText)
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                if userDataStore.currentLocation != nil {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(AppTheme.Colors.surface)
            .cornerRadius(AppTheme.CornerRadius.large)
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    private var currentLocationText: String {
        if let location = userDataStore.currentLocation {
            return location.name
        } else {
            return "No location set"
        }
    }
}

#Preview {
    CurrentLocationPill(showingLocationsList: .constant(false))
        .environmentObject(UserDataStore.shared)
        .padding()
        .background(AppTheme.Colors.background)
}
