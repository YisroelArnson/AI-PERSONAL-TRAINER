import SwiftUI

/// Horizontal step progress indicator for post-auth onboarding phases.
/// Shows 3 steps: Goals → Program → Ready
struct StepProgressBar: View {
    let currentPhase: OnboardingPhase

    private enum Step: Int, CaseIterable {
        case goals = 0
        case program = 1
        case ready = 2

        var label: String {
            switch self {
            case .goals: return "Goals"
            case .program: return "Program"
            case .ready: return "Ready"
            }
        }

        var icon: String {
            switch self {
            case .goals: return "target"
            case .program: return "doc.text"
            case .ready: return "checkmark.circle"
            }
        }
    }

    private var activeStepIndex: Int {
        switch currentPhase {
        case .goalReview:
            return 0
        case .programReview:
            return 1
        case .notificationPermission, .success:
            return 2
        default:
            return 0
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Step.allCases, id: \.rawValue) { step in
                stepView(step)

                if step.rawValue < Step.allCases.count - 1 {
                    connector(after: step)
                }
            }
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 12)
    }

    // MARK: - Step Dot + Label

    private func stepView(_ step: Step) -> some View {
        let isActive = step.rawValue == activeStepIndex
        let isCompleted = step.rawValue < activeStepIndex

        return VStack(spacing: 6) {
            ZStack {
                Circle()
                    .fill(fillColor(isActive: isActive, isCompleted: isCompleted))
                    .frame(width: 28, height: 28)

                if isCompleted {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                } else {
                    Image(systemName: step.icon)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(isActive ? .white : AppTheme.Colors.tertiaryText)
                }
            }

            Text(step.label)
                .font(.system(size: 11, weight: isActive ? .semibold : .medium))
                .foregroundColor(isActive ? AppTheme.Colors.primaryText : AppTheme.Colors.tertiaryText)
        }
    }

    // MARK: - Connector Line

    private func connector(after step: Step) -> some View {
        let isCompleted = step.rawValue < activeStepIndex

        return Rectangle()
            .fill(isCompleted ? AppTheme.Colors.orbSkyDeep : AppTheme.Colors.tertiaryText.opacity(0.3))
            .frame(height: 2)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 4)
            .offset(y: -10) // Align with center of dots
    }

    // MARK: - Colors

    private func fillColor(isActive: Bool, isCompleted: Bool) -> Color {
        if isCompleted {
            return AppTheme.Colors.orbSkyDeep
        } else if isActive {
            return AppTheme.Colors.orbSkyMid
        } else {
            return AppTheme.Colors.surface
        }
    }
}

#Preview {
    VStack(spacing: 40) {
        StepProgressBar(currentPhase: .goalReview)
        StepProgressBar(currentPhase: .programReview)
        StepProgressBar(currentPhase: .success)
    }
    .padding()
    .background(AppTheme.Colors.background)
}
