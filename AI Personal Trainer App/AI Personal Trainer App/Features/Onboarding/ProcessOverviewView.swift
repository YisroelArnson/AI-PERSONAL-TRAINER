import SwiftUI

/// One-time transition screen shown after auth.
/// Explains the 3-step process: Refine Goal → Build Program → Get Started.
struct ProcessOverviewView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    @State private var step1Visible = false
    @State private var step2Visible = false
    @State private var step3Visible = false
    @State private var buttonVisible = false

    private struct ProcessStep {
        let icon: String
        let title: String
        let subtitle: String
    }

    private let steps: [ProcessStep] = [
        ProcessStep(
            icon: "target",
            title: "Refine Your Goal",
            subtitle: "We'll help you zero in on a clear, actionable fitness goal."
        ),
        ProcessStep(
            icon: "doc.text",
            title: "Build Your Program",
            subtitle: "We'll create a personalized training plan just for you."
        ),
        ProcessStep(
            icon: "checkmark.circle",
            title: "Get Started",
            subtitle: "Review everything and begin your journey."
        )
    ]

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Header
                VStack(spacing: 10) {
                    Text("Here's what's next")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Text("Three quick steps to your personalized plan.")
                        .font(.system(size: 16))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .padding(.horizontal, 32)
                .opacity(step1Visible ? 1 : 0)
                .offset(y: step1Visible ? 0 : 12)

                Spacer()
                    .frame(height: 48)

                // Steps
                VStack(spacing: 28) {
                    stepRow(steps[0], number: 1)
                        .opacity(step1Visible ? 1 : 0)
                        .offset(y: step1Visible ? 0 : 16)

                    stepRow(steps[1], number: 2)
                        .opacity(step2Visible ? 1 : 0)
                        .offset(y: step2Visible ? 0 : 16)

                    stepRow(steps[2], number: 3)
                        .opacity(step3Visible ? 1 : 0)
                        .offset(y: step3Visible ? 0 : 16)
                }
                .padding(.horizontal, 32)

                Spacer()

                // "Let's Go" button
                Button(action: proceed) {
                    Text("Let's Go")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.background)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(AppTheme.Colors.primaryText)
                        .cornerRadius(AppTheme.CornerRadius.large)
                }
                .padding(.horizontal, AppTheme.Spacing.xxl)
                .padding(.bottom, 40)
                .opacity(buttonVisible ? 1 : 0)
                .offset(y: buttonVisible ? 0 : 10)
            }
        }
        .onAppear {
            startAnimations()
        }
    }

    // MARK: - Step Row

    private func stepRow(_ step: ProcessStep, number: Int) -> some View {
        HStack(spacing: 16) {
            // Icon circle
            ZStack {
                Circle()
                    .fill(AppTheme.Colors.orbSkyMid.opacity(0.15))
                    .frame(width: 48, height: 48)

                Image(systemName: step.icon)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(AppTheme.Colors.orbSkyDeep)
            }

            // Text
            VStack(alignment: .leading, spacing: 4) {
                Text(step.title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text(step.subtitle)
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
    }

    // MARK: - Animations

    private func startAnimations() {
        withAnimation(.easeOut(duration: 0.4).delay(0.2)) {
            step1Visible = true
        }
        withAnimation(.easeOut(duration: 0.4).delay(0.5)) {
            step2Visible = true
        }
        withAnimation(.easeOut(duration: 0.4).delay(0.8)) {
            step3Visible = true
        }
        withAnimation(.easeOut(duration: 0.3).delay(1.1)) {
            buttonVisible = true
        }
    }

    // MARK: - Actions

    private func proceed() {
        Haptic.medium()
        Task {
            await onboardingStore.completeProcessOverview()
        }
    }
}

#Preview {
    ProcessOverviewView()
}
