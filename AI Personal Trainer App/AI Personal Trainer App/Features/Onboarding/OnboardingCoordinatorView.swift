import SwiftUI

struct OnboardingCoordinatorView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    @State private var showBackConfirmation = false

    // MARK: - Orb Config

    private var currentOrbConfig: OrbConfig {
        onboardingStore.state.currentPhase.orbConfig
    }

    private var orbFrameAlignment: Alignment {
        switch currentOrbConfig.alignment {
        case .center: return .center
        case .topCenter: return .top
        case .topLeading: return .topLeading
        case .hidden: return .center
        }
    }

    private var orbPadding: EdgeInsets {
        switch currentOrbConfig.alignment {
        case .topLeading:
            return EdgeInsets(top: AppTheme.Spacing.xl, leading: AppTheme.Spacing.xxl, bottom: 0, trailing: 0)
        case .topCenter:
            return EdgeInsets(top: 70, leading: 0, bottom: 0, trailing: 0)
        default:
            return EdgeInsets()
        }
    }

    // MARK: - Transitions

    private var phaseTransition: AnyTransition {
        switch onboardingStore.navigationDirection {
        case .forward:
            return .asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            )
        case .backward:
            return .asymmetric(
                insertion: .move(edge: .leading).combined(with: .opacity),
                removal: .move(edge: .trailing).combined(with: .opacity)
            )
        }
    }

    // MARK: - Top Bar / Progress

    private var shouldShowTopBar: Bool {
        let phase = onboardingStore.state.currentPhase
        return !phase.hideBackButton && phase.previousPhase != nil
    }

    private var shouldShowStepBar: Bool {
        switch onboardingStore.state.currentPhase {
        case .goalReview, .programReview, .notificationPermission, .success:
            return true
        default:
            return false
        }
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // ThinTopBar (only for post-intake phases that need it)
            if shouldShowTopBar {
                ThinTopBar(
                    title: onboardingStore.state.currentPhase.displayTitle,
                    onBack: handleBack
                )
            }

            // Step progress bar (Goals → Program → Ready)
            if shouldShowStepBar {
                StepProgressBar(currentPhase: onboardingStore.state.currentPhase)
            }

            ZStack {
                // Phase content
                currentPhaseView
                    .id(onboardingStore.state.currentPhase)
                    .transition(phaseTransition)

                // Persistent orb (only for post-intake phases)
                if currentOrbConfig.alignment != .hidden {
                    OnboardingOrbView(
                        size: currentOrbConfig.size,
                        icon: currentOrbConfig.icon,
                        isLoading: false
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity,
                           alignment: orbFrameAlignment)
                    .padding(orbPadding)
                    .animation(.spring(response: 0.5, dampingFraction: 0.8),
                              value: onboardingStore.state.currentPhase)
                    .allowsHitTesting(false)
                }
            }
        }
        .animation(.easeInOut(duration: 0.35), value: onboardingStore.state.currentPhase)
        .alert("Go Back?", isPresented: $showBackConfirmation) {
            Button("Stay", role: .cancel) {}
            Button("Go Back", role: .destructive) {
                Task { await onboardingStore.goToPreviousPhase() }
            }
        } message: {
            Text("Your progress on this screen may not be saved.")
        }
    }

    // MARK: - Actions

    private func handleBack() {
        Task { await onboardingStore.goToPreviousPhase() }
    }

    // MARK: - Phase Content

    @ViewBuilder
    private var currentPhaseView: some View {
        switch onboardingStore.state.currentPhase {
        case .intro, .intake, .intakeComplete:
            // Intro + intake + complete screens handled by IntakeCoordinatorView
            IntakeCoordinatorView()

        case .auth:
            OnboardingAuthView()

        case .authVerification:
            OTPVerificationView()

        case .processOverview:
            ProcessOverviewView()

        case .goalReview:
            GoalReviewView()

        case .programReview:
            ProgramReviewView()

        case .notificationPermission:
            NotificationPermissionView()

        case .success:
            OnboardingSuccessView()

        case .complete:
            EmptyView()
        }
    }
}

#Preview {
    OnboardingCoordinatorView()
}
