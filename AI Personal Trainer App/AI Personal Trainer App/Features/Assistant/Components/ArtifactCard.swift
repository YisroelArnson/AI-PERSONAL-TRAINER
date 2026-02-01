//
//  ArtifactCard.swift
//  AI Personal Trainer App
//
//  Card component for displaying artifacts (workouts, reports, etc.) below chat messages.
//

import SwiftUI

struct ArtifactCard: View {
    let artifact: Artifact
    let onStartWorkout: () -> Void
    let onAddToCurrent: () -> Void
    let onReplaceCurrent: () -> Void

    // Animation state
    @State private var hasAppeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            // Header with icon and title
            headerSection

            // Summary pills
            summaryPills

            // Focus areas (if available)
            if let focus = artifact.summary.focus, !focus.isEmpty {
                focusSection(areas: focus)
            }

            // Action buttons
            actionButtons
        }
        .padding(AppTheme.Spacing.lg)
        .background(cardBackground)
        .opacity(hasAppeared ? 1 : 0)
        .offset(y: hasAppeared ? 0 : 20)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8).delay(0.1)) {
                hasAppeared = true
            }
        }
    }

    // MARK: - Subviews

    private var headerSection: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            // Icon
            ZStack {
                Circle()
                    .fill(AppTheme.Colors.surface)
                    .frame(width: 32, height: 32)

                Image(systemName: artifactIcon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }

            // Title
            Text(artifact.title)
                .font(AppTheme.Typography.cardTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
                .lineLimit(1)

            Spacer()
        }
    }

    private var summaryPills: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            if let duration = artifact.summary.durationMin {
                SummaryPill(icon: "clock", text: "\(duration) min")
            }

            if let count = artifact.summary.exerciseCount {
                SummaryPill(icon: "figure.strengthtraining.traditional", text: "\(count) exercises")
            }

            if let difficulty = artifact.summary.difficulty {
                SummaryPill(icon: "chart.bar", text: difficulty.capitalized)
            }
        }
    }

    private func focusSection(areas: [String]) -> some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            Text("Focus:")
                .font(AppTheme.Typography.label)
                .foregroundColor(AppTheme.Colors.secondaryText)

            ForEach(areas.prefix(3), id: \.self) { area in
                Text(area)
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(AppTheme.Colors.highlight)
                    )
            }
        }
    }

    private var actionButtons: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            // Start Workout (primary action)
            Button(action: onStartWorkout) {
                HStack(spacing: 4) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 12))
                    Text("Start")
                        .font(AppTheme.Typography.button)
                }
                .foregroundColor(AppTheme.Colors.background)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(
                    Capsule()
                        .fill(AppTheme.Colors.accent)
                )
            }

            // Add to Current (secondary action)
            Button(action: onAddToCurrent) {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                        .font(.system(size: 12))
                    Text("Add")
                        .font(AppTheme.Typography.button)
                }
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(
                    Capsule()
                        .fill(AppTheme.Colors.surface)
                )
            }

            Spacer()
        }
        .padding(.top, AppTheme.Spacing.xs)
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(AppTheme.Colors.surface)
    }

    private var artifactIcon: String {
        switch artifact.type {
        case .exerciseList:
            return "figure.run"
        }
    }
}

// MARK: - Summary Pill Component

private struct SummaryPill: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10))
            Text(text)
                .font(AppTheme.Typography.label)
        }
        .foregroundColor(AppTheme.Colors.secondaryText)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(AppTheme.Colors.highlight)
        )
    }
}

// MARK: - Preview

#Preview("Artifact Card") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(spacing: AppTheme.Spacing.lg) {
            ArtifactCard(
                artifact: Artifact.sample,
                onStartWorkout: { print("Start workout") },
                onAddToCurrent: { print("Add to current") },
                onReplaceCurrent: { print("Replace current") }
            )
            .padding(.horizontal)
        }
    }
}

#Preview("Full Width") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        ArtifactCard(
            artifact: Artifact(
                artifactId: "art_preview_123",
                type: .exerciseList,
                schemaVersion: "1.0",
                title: "Full Body HIIT Session",
                summary: ArtifactSummary(
                    durationMin: 45,
                    focus: ["Full Body", "Cardio", "Core"],
                    difficulty: "advanced",
                    exerciseCount: 8
                ),
                autoStart: false,
                payload: ArtifactPayload(exercises: nil, summary: nil)
            ),
            onStartWorkout: {},
            onAddToCurrent: {},
            onReplaceCurrent: {}
        )
        .padding()
    }
}
