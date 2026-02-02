//
//  ThinTopBar.swift
//  AI Personal Trainer App
//
//  Consistent thin top bar component matching the design schema.
//  Supports left icon, optional center text, and optional right icon.
//

import SwiftUI

struct ThinTopBar: View {
    // Left side (required)
    let leftIcon: String
    let leftAction: () -> Void

    // Center (optional)
    let centerText: String?

    // Right side (optional)
    let rightIcon: String?
    let rightAction: (() -> Void)?

    // MARK: - Initializers

    /// Full customization initializer
    init(
        leftIcon: String,
        leftAction: @escaping () -> Void,
        centerText: String? = nil,
        rightIcon: String? = nil,
        rightAction: (() -> Void)? = nil
    ) {
        self.leftIcon = leftIcon
        self.leftAction = leftAction
        self.centerText = centerText
        self.rightIcon = rightIcon
        self.rightAction = rightAction
    }

    /// Convenience initializer for back navigation pattern
    init(
        title: String,
        onBack: @escaping () -> Void
    ) {
        self.leftIcon = "chevron.left"
        self.leftAction = onBack
        self.centerText = title
        self.rightIcon = nil
        self.rightAction = nil
    }

    /// Convenience initializer for back navigation with right action
    init(
        title: String,
        onBack: @escaping () -> Void,
        rightIcon: String,
        rightAction: @escaping () -> Void
    ) {
        self.leftIcon = "chevron.left"
        self.leftAction = onBack
        self.centerText = title
        self.rightIcon = rightIcon
        self.rightAction = rightAction
    }

    var body: some View {
        HStack {
            // Left button
            Button(action: leftAction) {
                Group {
                    if leftIcon == "custom.menu.2lines" {
                        TwoLineMenuIcon()
                    } else {
                        Image(systemName: leftIcon)
                            .font(.system(size: 20, weight: .semibold))
                    }
                }
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Spacer()

            // Center text (optional)
            if let centerText = centerText {
                Text(centerText)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }

            Spacer()

            // Right button or spacer for balance
            if let rightIcon = rightIcon, let rightAction = rightAction {
                Button(action: rightAction) {
                    Image(systemName: rightIcon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Color.clear
                    .frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.xl)
        .padding(.top, 4)
        .padding(.bottom, 12)
        .frame(height: 60)
    }
}

// MARK: - Two-Line Menu Icon

struct TwoLineMenuIcon: View {
    var body: some View {
        VStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 1)
                .frame(width: 22, height: 2)
            RoundedRectangle(cornerRadius: 1)
                .frame(width: 22, height: 2)
        }
    }
}

// MARK: - Preview

#Preview("Back Bar") {
    VStack {
        ThinTopBar(title: "History", onBack: {})
        Spacer()
    }
    .background(AppTheme.Colors.background)
}

#Preview("Home Bar") {
    VStack {
        ThinTopBar(
            leftIcon: "custom.menu.2lines",
            leftAction: {},
            rightIcon: "plus",
            rightAction: {}
        )
        Spacer()
    }
    .background(AppTheme.Colors.background)
}

#Preview("With Center Text") {
    VStack {
        ThinTopBar(
            leftIcon: "chevron.left",
            leftAction: {},
            centerText: "1 of 4",
            rightIcon: "pencil",
            rightAction: {}
        )
        Spacer()
    }
    .background(AppTheme.Colors.background)
}
