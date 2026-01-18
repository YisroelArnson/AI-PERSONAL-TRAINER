//
//  CollapsedStepsSummary.swift
//  AI Personal Trainer App
//
//  A tappable tile showing "X steps" that expands inline to reveal step details.
//  Used after agent processing completes to show what steps were executed.
//

import SwiftUI

struct CollapsedStepsSummary: View {
    let steps: [StepItem]
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Always visible: collapsed header/tile
            collapsedTile

            // Expandable: step list
            if isExpanded {
                expandedStepList
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isExpanded)
    }

    // MARK: - Subviews

    private var collapsedTile: some View {
        Button {
            isExpanded.toggle()
        } label: {
            HStack(spacing: 6) {
                // Checkmark icon
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.Colors.success)

                // Step count text
                Text(stepCountText)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundColor(AppTheme.Colors.secondaryText)

                // Expand/collapse chevron
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 10)
            .background(
                Capsule()
                    .fill(AppTheme.Colors.success.opacity(0.1))
                    .overlay(
                        Capsule()
                            .stroke(AppTheme.Colors.success.opacity(0.2), lineWidth: 0.5)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private var expandedStepList: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(steps) { step in
                stepRow(step)
            }
        }
        .padding(.top, 8)
        .padding(.leading, 4)
    }

    private func stepRow(_ step: StepItem) -> some View {
        HStack(spacing: 6) {
            // Checkmark for completed steps
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(AppTheme.Colors.success.opacity(0.7))
                .frame(width: 12, height: 12)

            Text(step.displayName)
                .font(.system(size: 12, weight: .regular, design: .rounded))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .lineLimit(1)

            Spacer()
        }
    }

    // MARK: - Computed Properties

    private var stepCountText: String {
        let count = steps.count
        return "\(count) step\(count == 1 ? "" : "s")"
    }
}

// MARK: - Preview

#Preview("Collapsed") {
    ZStack {
        AnimatedGradientBackground()

        VStack(spacing: 20) {
            CollapsedStepsSummary(steps: StepItem.samples)
        }
        .padding()
    }
}

#Preview("Expanded") {
    ZStack {
        AnimatedGradientBackground()

        VStack(alignment: .leading, spacing: 20) {
            // Simulate expanded state
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.Colors.success)

                    Text("3 steps")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.secondaryText)

                    Image(systemName: "chevron.up")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 10)
                .background(
                    Capsule()
                        .fill(AppTheme.Colors.success.opacity(0.1))
                )

                VStack(alignment: .leading, spacing: 4) {
                    ForEach(StepItem.samples) { step in
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(AppTheme.Colors.success.opacity(0.7))
                            Text(step.displayName)
                                .font(.system(size: 12, weight: .regular, design: .rounded))
                                .foregroundColor(AppTheme.Colors.tertiaryText)
                        }
                    }
                }
                .padding(.top, 8)
                .padding(.leading, 4)
            }
        }
        .padding()
    }
}
