//
//  StreamingStepsLine.swift
//  AI Personal Trainer App
//
//  A single animated line showing the current agent step during streaming.
//  Displays animated dots and updates text as each step progresses.
//

import SwiftUI

struct StreamingStepsLine: View {
    let currentStep: StepItem?
    let completedCount: Int

    @State private var dotIndex = 0
    @State private var timer: Timer?

    var body: some View {
        HStack(spacing: 6) {
            // Animated dots (3 dots cycling)
            animatedDots

            // Current step text with animation
            Text(displayText)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .lineLimit(1)
                .animation(.easeInOut(duration: 0.2), value: displayText)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(
            Capsule()
                .fill(AppTheme.Colors.warmAccent.opacity(0.08))
        )
        .onAppear {
            startAnimation()
        }
        .onDisappear {
            stopAnimation()
        }
    }

    // MARK: - Subviews

    private var animatedDots: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(AppTheme.Colors.warmAccent)
                    .frame(width: 4, height: 4)
                    .scaleEffect(dotIndex == index ? 1.2 : 0.8)
                    .opacity(dotIndex == index ? 1.0 : 0.4)
            }
        }
    }

    // MARK: - Computed Properties

    private var displayText: String {
        if let step = currentStep {
            return step.displayName
        } else if completedCount > 0 {
            return "Preparing response..."
        } else {
            return "Thinking..."
        }
    }

    // MARK: - Animation

    private func startAnimation() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.35, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.2)) {
                dotIndex = (dotIndex + 1) % 3
            }
        }
    }

    private func stopAnimation() {
        timer?.invalidate()
        timer = nil
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        AnimatedGradientBackground()

        VStack(spacing: 20) {
            // Thinking state
            StreamingStepsLine(currentStep: nil, completedCount: 0)

            // With current step
            StreamingStepsLine(
                currentStep: StepItem(
                    tool: "fetch_workout_history",
                    displayName: "Fetching workout history",
                    status: .running
                ),
                completedCount: 0
            )

            // Preparing response
            StreamingStepsLine(currentStep: nil, completedCount: 3)
        }
        .padding()
    }
}
