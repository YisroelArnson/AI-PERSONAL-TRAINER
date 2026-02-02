import SwiftUI

struct WelcomeView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    @State private var showCTA = false
    @State private var orbScale: CGFloat = 0.8
    @State private var orbOpacity: Double = 0
    @State private var textOpacity: Double = 0

    private let welcomeMessage = "I'm your AI personal trainer. Together, we'll build a program designed specifically for you."

    var body: some View {
        ZStack {
            // Background
            backgroundGradient

            VStack(spacing: AppTheme.Spacing.xxxl) {
                Spacer()

                // Glowing Orb
                welcomeOrb
                    .scaleEffect(orbScale)
                    .opacity(orbOpacity)

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

    // MARK: - Orb

    private let orbSize: CGFloat = 120

    private var welcomeOrb: some View {
        ZStack {
            // Outer glow
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            AppTheme.Colors.orbSkyMid.opacity(0.3),
                            AppTheme.Colors.orbSkyDeep.opacity(0.1),
                            Color.clear
                        ]),
                        center: .center,
                        startRadius: orbSize * 0.4,
                        endRadius: orbSize * 1.2
                    )
                )
                .frame(width: orbSize * 2, height: orbSize * 2)

            // Main orb
            ZStack {
                // Base gradient
                Circle()
                    .fill(AppTheme.Gradients.orb)

                // Cloud layer 1
                Circle()
                    .fill(
                        RadialGradient(
                            gradient: Gradient(colors: [
                                AppTheme.Colors.orbCloudWhite.opacity(0.9),
                                AppTheme.Colors.orbCloudWhite.opacity(0.4),
                                Color.clear
                            ]),
                            center: UnitPoint(x: 0.25, y: 0.2),
                            startRadius: 0,
                            endRadius: orbSize * 0.4
                        )
                    )

                // Cloud layer 2
                Circle()
                    .fill(
                        RadialGradient(
                            gradient: Gradient(colors: [
                                AppTheme.Colors.orbCloudWhite.opacity(0.7),
                                AppTheme.Colors.orbCloudWhite.opacity(0.2),
                                Color.clear
                            ]),
                            center: UnitPoint(x: 0.7, y: 0.25),
                            startRadius: 0,
                            endRadius: orbSize * 0.35
                        )
                    )

                // Cloud layer 3
                Circle()
                    .fill(
                        RadialGradient(
                            gradient: Gradient(colors: [
                                AppTheme.Colors.orbCloudWhite.opacity(0.5),
                                AppTheme.Colors.orbSkyLight.opacity(0.3),
                                Color.clear
                            ]),
                            center: UnitPoint(x: 0.5, y: 0.4),
                            startRadius: 0,
                            endRadius: orbSize * 0.45
                        )
                    )

                // Inner stroke
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.3),
                                Color.clear,
                                AppTheme.Colors.orbSkyDeep.opacity(0.2)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        lineWidth: 1.5
                    )
                    .frame(width: orbSize - 1.5, height: orbSize - 1.5)
            }
            .frame(width: orbSize, height: orbSize)
            .clipShape(Circle())
            .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.4), radius: 20, x: 0, y: 8)
        }
        .pulsingAnimation()
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
        // Orb fade in and scale
        withAnimation(.easeOut(duration: 0.8)) {
            orbOpacity = 1
            orbScale = 1
        }

        // Text fade in after orb
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

// MARK: - Pulsing Animation

struct PulsingAnimationModifier: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPulsing ? 1.02 : 1.0)
            .animation(
                .easeInOut(duration: 2)
                .repeatForever(autoreverses: true),
                value: isPulsing
            )
            .onAppear {
                isPulsing = true
            }
    }
}

extension View {
    func pulsingAnimation() -> some View {
        modifier(PulsingAnimationModifier())
    }
}

#Preview {
    WelcomeView()
}
