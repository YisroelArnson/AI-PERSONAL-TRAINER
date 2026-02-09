import SwiftUI

struct WelcomeView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    @State private var showCTA = false
    @State private var textOpacity: Double = 0

    private let welcomeMessage = "I'm your AI personal trainer. Together, we'll build a program designed specifically for you."

    var body: some View {
        ZStack {
            // Background
            backgroundGradient

            VStack(spacing: AppTheme.Spacing.xxxl) {
                Spacer()

                // Space for the shared orb (rendered by coordinator)
                Color.clear
                    .frame(width: 120, height: 120)

                // Typewriter Text
                VStack(spacing: AppTheme.Spacing.lg) {
                    if textOpacity > 0 {
                        TypewriterTextView(
                            text: welcomeMessage,
                            font: .system(size: 22, weight: .medium),
                            color: AppTheme.Colors.primaryText,
                            wordDelay: 0.08
                        ) {
                            // Animation complete - show CTA
                            withAnimation(.easeInOut(duration: 0.5)) {
                                showCTA = true
                            }
                        }
                        .opacity(textOpacity)
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                    }
                }
                .frame(minHeight: 100)

                Spacer()

                // CTA Button
                if showCTA {
                    ctaButton
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                Spacer()
                    .frame(height: 60)
            }
        }
        .onAppear {
            startAnimations()
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            gradient: Gradient(colors: [
                AppTheme.Colors.background,
                AppTheme.Colors.surface.opacity(0.3),
                AppTheme.Colors.background
            ]),
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - CTA Button

    private var ctaButton: some View {
        Button(action: beginJourney) {
            Text("Begin Your Journey")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
                .background(AppTheme.Colors.primaryText)
                .cornerRadius(AppTheme.CornerRadius.large)
        }
        .padding(.horizontal, AppTheme.Spacing.xxl)
    }

    // MARK: - Animations

    private func startAnimations() {
        // Text fade in
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.easeIn(duration: 0.3)) {
                textOpacity = 1
            }
        }
    }

    // MARK: - Actions

    private func beginJourney() {
        Task {
            await onboardingStore.startOnboarding()
        }
    }
}

#Preview {
    WelcomeView()
}
