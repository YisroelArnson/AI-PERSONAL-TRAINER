import SwiftUI

struct OnboardingBackButton: View {
    let action: () -> Void
    var requiresConfirmation: Bool = false
    var confirmationTitle: String = "Go Back?"
    var confirmationMessage: String = "Your progress on this screen will not be saved."

    @State private var showConfirmation = false

    var body: some View {
        Button(action: handleTap) {
            HStack(spacing: 4) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                Text("Back")
                    .font(.system(size: 16, weight: .medium))
            }
            .foregroundColor(AppTheme.Colors.primaryText)
        }
        .alert(confirmationTitle, isPresented: $showConfirmation) {
            Button("Stay", role: .cancel) {}
            Button("Go Back", role: .destructive) {
                action()
            }
        } message: {
            Text(confirmationMessage)
        }
    }

    private func handleTap() {
        if requiresConfirmation {
            showConfirmation = true
        } else {
            action()
        }
    }
}

struct OnboardingBackButtonModifier: ViewModifier {
    @ObservedObject var onboardingStore: OnboardingStore
    var customAction: (() -> Void)?

    @State private var showConfirmation = false

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if !onboardingStore.state.currentPhase.hideBackButton {
                        Button(action: handleBack) {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 16, weight: .semibold))
                            }
                            .foregroundColor(AppTheme.Colors.primaryText)
                        }
                    }
                }
            }
            .alert("Go Back?", isPresented: $showConfirmation) {
                Button("Stay", role: .cancel) {}
                Button("Go Back", role: .destructive) {
                    performBack()
                }
            } message: {
                Text("Your progress on this screen will not be saved.")
            }
    }

    private func handleBack() {
        if onboardingStore.state.currentPhase.requiresBackConfirmation {
            showConfirmation = true
        } else {
            performBack()
        }
    }

    private func performBack() {
        if let customAction = customAction {
            customAction()
        } else {
            Task {
                await onboardingStore.goToPreviousPhase()
            }
        }
    }
}

extension View {
    func onboardingBackButton(store: OnboardingStore, customAction: (() -> Void)? = nil) -> some View {
        modifier(OnboardingBackButtonModifier(onboardingStore: store, customAction: customAction))
    }
}

#Preview {
    NavigationStack {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            Text("Content")
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                OnboardingBackButton {
                    print("Back tapped")
                }
            }
        }
    }
}
