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
}

// MARK: - Side Drawer View

struct SideDrawerView: View {
    @Environment(\.colorScheme) private var colorScheme
    
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
                    .fill(initialsBackgroundColor)
                    .frame(width: 36, height: 36)
                    .overlay(
                        Text(userInitials)
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundColor(.white)
                    )
                
                // User email/name
                Text(displayName)
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundColor(textColor)
                    .lineLimit(1)
                
                Spacer()
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.md)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                    .fill(Color.clear)
            )
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
    
    private var initialsBackgroundColor: Color {
        // Warm accent color that works in both light and dark mode
        AppTheme.Colors.warmAccent
    }
    
    private var drawerBackground: Color {
        colorScheme == .dark
            ? Color(UIColor.systemBackground)
            : Color.white
    }
    
    private var textColor: Color {
        colorScheme == .dark
            ? Color.white
            : AppTheme.Colors.primaryText
    }
}

// MARK: - Drawer Navigation Item

struct DrawerNavItem: View {
    @Environment(\.colorScheme) private var colorScheme
    
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
                    .font(.system(size: 16, weight: .medium, design: .rounded))
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
            return colorScheme == .dark
                ? Color.white.opacity(0.1)
                : Color.black.opacity(0.05)
        }
        return Color.clear
    }
    
    private var iconColor: Color {
        if isSelected {
            return colorScheme == .dark
                ? Color.white
                : AppTheme.Colors.primaryText
        }
        return AppTheme.Colors.secondaryText
    }
    
    private var textColor: Color {
        if isSelected {
            return colorScheme == .dark
                ? Color.white
                : AppTheme.Colors.primaryText
        }
        return colorScheme == .dark
            ? Color.white.opacity(0.8)
            : AppTheme.Colors.primaryText
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
