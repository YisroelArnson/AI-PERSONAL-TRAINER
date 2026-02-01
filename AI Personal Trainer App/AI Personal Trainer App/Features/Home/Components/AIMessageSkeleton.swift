//
//  AIMessageSkeleton.swift
//  AI Personal Trainer App
//
//  Skeleton placeholder for AI message while loading.
//  Displays text-like lines with a shimmer animation.
//

import SwiftUI

/// Skeleton placeholder that mimics the AI message layout while loading
struct AIMessageSkeleton: View {
    // Line configuration: (width ratio, delay offset)
    private let lineConfigs: [(widthRatio: CGFloat, delay: Double)] = [
        (0.95, 0.0),
        (0.80, 0.1),
        (0.45, 0.2)
    ]

    private let lineHeight: CGFloat = 22
    private let lineSpacing: CGFloat = 16

    var body: some View {
        VStack(alignment: .leading, spacing: lineSpacing) {
            ForEach(0..<lineConfigs.count, id: \.self) { index in
                skeletonLine(
                    widthRatio: lineConfigs[index].widthRatio,
                    delay: lineConfigs[index].delay
                )
            }
        }
    }

    private func skeletonLine(widthRatio: CGFloat, delay: Double) -> some View {
        GeometryReader { geometry in
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                .fill(AppTheme.Colors.surface)
                .frame(width: geometry.size.width * widthRatio, height: lineHeight)
                .shimmer(duration: 1.5, delay: delay)
        }
        .frame(height: lineHeight)
    }
}

// MARK: - Preview

#Preview("AI Message Skeleton") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(alignment: .leading, spacing: 32) {
            Text("Skeleton Loading:")
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.secondaryText)

            AIMessageSkeleton()

            Divider()

            Text("Loaded State:")
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.secondaryText)

            AIMessageView("You've completed **3 workouts** this week. Your push strength is up **12%** from last month. Day **12** of your streak. Let's keep building.")
        }
        .padding(.horizontal, 20)
    }
}
