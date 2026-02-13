import SwiftUI

/// Routes intro screens, intake questions, and intake complete screen.
/// Each screen is rendered based on `OnboardingStore.currentScreen.type`.
struct IntakeCoordinatorView: View {
    @StateObject private var store = OnboardingStore.shared

    @State private var previousLabel: String? = nil
    @State private var isMovingForward: Bool = true

    private var currentScreen: OnboardingScreen {
        store.currentScreen
    }

    private var showTopBar: Bool {
        // Show top bar for intake screens (not intro, not complete)
        currentScreen.label != nil
    }

    private var showProgress: Bool {
        currentScreen.label != nil
    }

    // MARK: - Transitions

    private var slideTransition: AnyTransition {
        if isMovingForward {
            return .asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            )
        } else {
            return .asymmetric(
                insertion: .move(edge: .leading).combined(with: .opacity),
                removal: .move(edge: .trailing).combined(with: .opacity)
            )
        }
    }

    // MARK: - Navigation Helpers
    // Set direction BEFORE the Task so it's guaranteed to be
    // applied before SwiftUI evaluates the transition.

    private func goForward() {
        isMovingForward = true
        Task { await store.goToNextStep() }
    }

    private func goBack() {
        isMovingForward = false
        Task { await store.goToPreviousStep() }
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top bar with section label and back button
                if showTopBar {
                    OnboardingTopBar(
                        label: currentScreen.label?.rawValue,
                        previousLabel: previousLabel,
                        showBack: store.state.currentStep > OnboardingScreens.introCount,
                        onBack: { goBack() }
                    )
                }

                // Segmented progress bar
                if showProgress {
                    SegmentedProgressBar(currentStep: store.state.currentStep)
                        .padding(.horizontal, 20)
                        .padding(.top, 4)
                }

                // Screen content
                currentScreenView
                    .id(store.state.currentStep)
                    .transition(slideTransition)
            }
        }
        .animation(.easeInOut(duration: 0.35), value: store.state.currentStep)
        .onChange(of: currentScreen.label?.rawValue) { oldLabel, _ in
            previousLabel = oldLabel
        }
    }

    // MARK: - Screen Router

    @ViewBuilder
    private var currentScreenView: some View {
        let screen = currentScreen

        switch screen.type {
        case .introHero:
            IntroHeroView {
                goForward()
            }

        case .introNarration:
            IntroNarrationView {
                goForward()
            }

        case .introCTA:
            IntroCTAView(
                onNext: {
                    goForward()
                },
                onLogin: {
                    Task { await store.startReturningLogin() }
                }
            )

        case .textInput:
            TextInputScreenView(
                screen: screen,
                value: store.state.intakeData.stringValue(for: screen.field ?? "") ?? "",
                onChange: { field, value in
                    store.setIntakeStringField(field, value: value)
                },
                onNext: {
                    goForward()
                }
            )

        case .birthdayPicker:
            BirthdayPickerScreenView(
                screen: screen,
                value: store.state.intakeData.birthday,
                onChange: { date in
                    store.setIntakeBirthday(date)
                },
                onNext: {
                    goForward()
                }
            )

        case .heightPicker:
            HeightPickerScreenView(
                screen: screen,
                valueInches: store.state.intakeData.heightInches,
                onChange: { inches in
                    store.setIntakeHeight(inches)
                },
                onNext: {
                    goForward()
                }
            )

        case .weightPicker:
            WeightPickerScreenView(
                screen: screen,
                valueLbs: store.state.intakeData.weightLbs,
                onChange: { lbs in
                    store.setIntakeWeight(lbs)
                },
                onNext: {
                    goForward()
                }
            )

        case .simpleSelect:
            SimpleSelectScreenView(
                screen: screen,
                value: store.state.intakeData.stringValue(for: screen.field ?? ""),
                onChange: { field, value in
                    store.setIntakeStringField(field, value: value)
                },
                onNext: {
                    goForward()
                }
            )

        case .voice:
            VoiceScreenView(
                screen: screen,
                value: store.state.intakeData.stringValue(for: screen.field ?? "") ?? "",
                onChange: { field, value in
                    store.setIntakeStringField(field, value: value)
                },
                onNext: {
                    goForward()
                }
            )

        case .guidedVoice:
            GuidedVoiceScreenView(
                screen: screen,
                value: store.state.intakeData.stringValue(for: screen.field ?? "") ?? "",
                onChange: { field, value in
                    store.setIntakeStringField(field, value: value)
                },
                onNext: {
                    goForward()
                }
            )

        case .complete:
            IntakeCompleteScreenView(
                userName: store.state.intakeData.name,
                isEditing: store.state.isEditingIntake,
                onCreateProgram: {
                    Task { await store.completeIntake() }
                }
            )
        }
    }
}
