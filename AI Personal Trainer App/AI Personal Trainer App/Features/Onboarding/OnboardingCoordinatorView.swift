import SwiftUI

struct OnboardingCoordinatorView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    var body: some View {
        NavigationStack {
            currentPhaseView
                .animation(.easeInOut(duration: 0.3), value: onboardingStore.state.currentPhase)
        }
    }

    @ViewBuilder
    private var currentPhaseView: some View {
        switch onboardingStore.state.currentPhase {
        case .welcome:
            WelcomeView()

        case .auth:
            OnboardingAuthView()

        case .authVerification:
            OTPVerificationView()

        case .microphonePermission:
            MicrophonePermissionView()

        case .intake:
            IntakeView(configuration: IntakeViewConfiguration(
                context: .onboarding,
                onComplete: {
                    await OnboardingStore.shared.completeIntake()
                },
                isMicrophoneEnabled: onboardingStore.state.microphoneEnabled ?? false,
                sessionIdCallback: { sessionId in
                    OnboardingStore.shared.setIntakeSessionId(sessionId)
                }
            ))
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    OnboardingBackButton(
                        action: {
                            Task {
                                await OnboardingStore.shared.goToPreviousPhase()
                            }
                        },
                        requiresConfirmation: true,
                        confirmationTitle: "Leave Intake?",
                        confirmationMessage: "Your conversation progress will be saved."
                    )
                }
            }

        case .assessmentPrompt:
            AssessmentPromptView()

        case .assessment:
            OnboardingAssessmentView()

        case .nameCollection:
            NameCollectionView()

        case .goalDraft:
            GoalDraftView()

        case .goalReview:
            GoalFullReviewView()

        case .programDraft:
            ProgramDraftView()

        case .programReview:
            ProgramFullReviewView()

        case .notificationPermission:
            NotificationPermissionView()

        case .success:
            OnboardingSuccessView()

        case .complete:
            // This shouldn't be shown - routing should go to MainAppView
            EmptyView()
        }
    }
}

#Preview {
    OnboardingCoordinatorView()
}
