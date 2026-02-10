import SwiftUI

/// Routes intro screens, intake questions, and intake complete screen.
/// Each screen is rendered based on `OnboardingStore.currentScreen.type`.
struct IntakeCoordinatorView: View {
    @StateObject private var store = OnboardingStore.shared

    @State private var previousLabel: String? = nil

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
        switch store.navigationDirection {
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
                        onBack: {
                            Task { await store.goToPreviousStep() }
                        }
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
                Task { await store.goToNextStep() }
            }

        case .introNarration:
            IntroNarrationView {
                Task { await store.goToNextStep() }
            }

        case .introCTA:
            IntroCTAView(
                onNext: {
                    Task { await store.goToNextStep() }
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
                    Task { await store.goToNextStep() }
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
                    Task { await store.goToNextStep() }
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
                    Task { await store.goToNextStep() }
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
                    Task { await store.goToNextStep() }
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
                    Task { await store.goToNextStep() }
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
                    Task { await store.goToNextStep() }
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
                    Task { await store.goToNextStep() }
                }
            )

        case .complete:
            IntakeCompleteScreenView(
                userName: store.state.intakeData.name,
                onCreateProgram: {
                    Task { await store.completeIntake() }
                }
            )
        }
    }
}
