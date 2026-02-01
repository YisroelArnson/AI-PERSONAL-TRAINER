//
//  InlineStepsView.swift
//  AI Personal Trainer App
//
//  Container that switches between streaming and collapsed step displays.
//  Shows StreamingStepsLine during processing, CollapsedStepsSummary after completion.
//

import SwiftUI

struct InlineStepsView: View {
    let steps: [StepItem]
    let isStreaming: Bool
    let currentStep: StepItem?

    var body: some View {
        Group {
            if isStreaming {
                // During streaming: show animated single line
                StreamingStepsLine(
                    currentStep: currentStep,
                    completedCount: completedStepCount
                )
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
            } else if !steps.isEmpty {
                // After completion: show collapsible summary
                CollapsedStepsSummary(steps: steps)
                    .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }
        }
        .padding(.top, 8)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isStreaming)
    }

    // MARK: - Computed Properties

    private var completedStepCount: Int {
        steps.filter { $0.status == .done }.count
    }
}

// MARK: - Preview

#Preview("Streaming") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(alignment: .leading, spacing: 20) {
            // Simulated message bubble with streaming steps
            VStack(alignment: .leading, spacing: 0) {
                Text("Let me analyze your workout history and create a personalized plan...")
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)

                InlineStepsView(
                    steps: [
                        StepItem(tool: "fetch_workout_history", displayName: "Fetched workout history", status: .done)
                    ],
                    isStreaming: true,
                    currentStep: StepItem(
                        tool: "fetch_preferences",
                        displayName: "Loading preferences",
                        status: .running
                    )
                )
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(AppTheme.Colors.surface)
            )
            .padding()
        }
    }
}

#Preview("Completed") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(alignment: .leading, spacing: 20) {
            // Simulated message bubble with completed steps
            VStack(alignment: .leading, spacing: 0) {
                Text("Great choice! Based on your recent workouts, I'll focus on upper body strength.")
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)

                InlineStepsView(
                    steps: StepItem.samples,
                    isStreaming: false,
                    currentStep: nil
                )
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(AppTheme.Colors.surface)
            )
            .padding()
        }
    }
}
