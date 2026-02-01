//
//  SideDrawerView.swift
//  AI Personal Trainer App
//
//  A ChatGPT-style side drawer navigation that pushes content to the side.
//

import SwiftUI

// MARK: - Drawer Destination

enum DrawerDestination: Equatable {
    case home
    case stats
    case info
    case profile
    case coach
}

// MARK: - Side Drawer View

struct SideDrawerView: View {
    @Binding var currentPage: DrawerDestination
    let onNavigate: (DrawerDestination) -> Void
    let onProfileTap: () -> Void
    let userEmail: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top padding for safe area
            Spacer()
                .frame(height: AppTheme.Spacing.xxxxl)
            
            // Navigation items
            VStack(spacing: AppTheme.Spacing.xs) {
                DrawerNavItem(
                    icon: "house",
                    title: "Home",
                    isSelected: currentPage == .home,
                    onTap: { onNavigate(.home) }
                )
                
                DrawerNavItem(
                    icon: "chart.bar",
                    title: "Stats",
                    isSelected: currentPage == .stats,
                    onTap: { onNavigate(.stats) }
                )
                
                DrawerNavItem(
                    icon: "slider.horizontal.3",
                    title: "Preferences",
                    isSelected: currentPage == .info,
                    onTap: { onNavigate(.info) }
                )

                DrawerNavItem(
                    icon: "person.text.rectangle",
                    title: "Coach",
                    isSelected: currentPage == .coach,
                    onTap: { onNavigate(.coach) }
                )
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            
            Spacer()
            
            // Profile section at bottom
            profileButton
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.bottom, AppTheme.Spacing.xxxl)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(drawerBackground)
    }
    
    // MARK: - Profile Button
    
    private var profileButton: some View {
        Button(action: onProfileTap) {
            HStack(spacing: AppTheme.Spacing.md) {
                // Initials circle
                Circle()
                    .fill(AppTheme.Colors.surface)
                    .frame(width: 36, height: 36)
                    .overlay(
                        Text(userInitials)
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.primaryText)
                    )
                
                // User email/name
                Text(displayName)
                    .font(AppTheme.Typography.input)
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .lineLimit(1)
                
                Spacer()
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.md)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    
    // MARK: - Computed Properties
    
    private var userInitials: String {
        let email = userEmail.trimmingCharacters(in: .whitespaces)
        if email.isEmpty {
            return "?"
        }
        // Get first letter of email, capitalized
        return String(email.prefix(1)).uppercased()
    }
    
    private var displayName: String {
        let email = userEmail.trimmingCharacters(in: .whitespaces)
        if email.isEmpty {
            return "User"
        }
        // Show full email
        return email
    }
    
    private var drawerBackground: Color {
        AppTheme.Colors.background
    }
}

// MARK: - Drawer Navigation Item

struct DrawerNavItem: View {
    let icon: String
    let title: String
    let isSelected: Bool
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: AppTheme.Spacing.md) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(iconColor)
                    .frame(width: 24)
                
                Text(title)
                    .font(AppTheme.Typography.input)
                    .foregroundColor(textColor)
                
                Spacer()
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.md)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                    .fill(backgroundColor)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    
    // MARK: - Computed Properties
    
    private var backgroundColor: Color {
        if isSelected {
            return AppTheme.Colors.highlight
        }
        return Color.clear
    }
    
    private var iconColor: Color {
        if isSelected {
            return AppTheme.Colors.primaryText
        }
        return AppTheme.Colors.secondaryText
    }
    
    private var textColor: Color {
        if isSelected {
            return AppTheme.Colors.primaryText
        }
        return AppTheme.Colors.primaryText
    }
}

// MARK: - Preview

#Preview {
    HStack(spacing: 0) {
        SideDrawerView(
            currentPage: .constant(.home),
            onNavigate: { destination in
                print("Navigate to: \(destination)")
            },
            onProfileTap: {
                print("Profile tapped")
            },
            userEmail: "yisroelrnsn@gmail.com"
        )
        .frame(width: 280)
        
        Rectangle()
            .fill(AppTheme.Gradients.background)
    }
    .ignoresSafeArea()
}
