import SwiftUI

struct OnboardingCoordinatorView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var intakeStore = IntakeSessionStore.shared
    @StateObject private var assessmentStore = AssessmentSessionStore.shared

    @State private var showBackConfirmation = false

    // MARK: - Orb Config

    private var currentOrbConfig: OrbConfig {
        onboardingStore.state.currentPhase.orbConfig
    }

    private var orbIsLoading: Bool {
        switch onboardingStore.state.currentPhase {
        case .intake:
            return intakeStore.isLoading || intakeStore.isConfirming
        case .assessment:
            return assessmentStore.isLoading && assessmentStore.baseline == nil
        case .nameCollection:
            return onboardingStore.isGoalLoading
        default:
            return false
        }
    }

    private var effectiveOrbIcon: String? {
        if onboardingStore.state.currentPhase == .assessment, assessmentStore.baseline != nil {
            return "checkmark"
        }
        return currentOrbConfig.icon
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

    private var showProgressBar: Bool {
        ![OnboardingPhase.welcome, .complete, .intake, .assessment].contains(onboardingStore.state.currentPhase)
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // ThinTopBar (always reserves height to prevent vertical reflow)
            ThinTopBar(
                title: onboardingStore.state.currentPhase.displayTitle,
                onBack: handleBack
            )
            .opacity(shouldShowTopBar ? 1 : 0)
            .allowsHitTesting(shouldShowTopBar)

            // Global progress bar (always reserves height/padding to prevent vertical reflow)
            OnboardingProgressBar(
                progress: onboardingStore.state.currentPhase.progressPercent
            )
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .opacity(showProgressBar ? 1 : 0)
            .accessibilityHidden(!showProgressBar)

            ZStack {
                // Phase content (below)
                currentPhaseView
                    .id(onboardingStore.state.currentPhase)
                    .transition(phaseTransition)

                // Persistent orb (above, animates between phases)
                if currentOrbConfig.alignment != .hidden {
                    OnboardingOrbView(
                        size: currentOrbConfig.size,
                        icon: effectiveOrbIcon,
                        isLoading: orbIsLoading
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
        if onboardingStore.state.currentPhase.requiresBackConfirmation {
            showBackConfirmation = true
        } else {
            Task { await onboardingStore.goToPreviousPhase() }
        }
    }

    // MARK: - Phase Content

    @ViewBuilder
    private var currentPhaseView: some View {
        switch onboardingStore.state.currentPhase {
        case .welcome:
            WelcomeView()

        case .auth:
            OnboardingAuthView()

        case .authVerification:
            OTPVerificationView()

        case .intake:
            IntakeView(configuration: IntakeViewConfiguration(
                context: .onboarding,
                onComplete: {
                    await OnboardingStore.shared.completeIntake(withAssessment: false)
                },
                onAssessment: {
                    await OnboardingStore.shared.completeIntake(withAssessment: true)
                },
                sessionIdCallback: { sessionId in
                    OnboardingStore.shared.setIntakeSessionId(sessionId)
                }
            ))

        case .assessment:
            OnboardingAssessmentView()

        case .nameCollection:
            NameCollectionView()

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
