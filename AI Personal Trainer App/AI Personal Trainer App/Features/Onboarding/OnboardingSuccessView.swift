import SwiftUI

struct OnboardingSuccessView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var programStore = TrainingProgramStore.shared

    @State private var showConfetti = false
    @State private var orbScale: CGFloat = 0.5
    @State private var orbOpacity: Double = 0
    @State private var contentOpacity: Double = 0
    @State private var buttonOpacity: Double = 0

    private var userName: String {
        onboardingStore.state.userName ?? "there"
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            // Confetti overlay
            if showConfetti {
                ConfettiView()
                    .ignoresSafeArea()
            }

            VStack(spacing: 0) {
                Spacer()

                // Success orb
                successOrb
                    .scaleEffect(orbScale)
                    .opacity(orbOpacity)

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Content
                VStack(spacing: AppTheme.Spacing.lg) {
                    Text("You're all set, \(userName)!")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Text("Your personalized program is ready.")
                        .font(.system(size: 17))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .opacity(contentOpacity)
                .padding(.horizontal, AppTheme.Spacing.xxxl)

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // First workout preview
                firstWorkoutCard
                    .opacity(contentOpacity)
                    .padding(.horizontal, AppTheme.Spacing.xxl)

                Spacer()

                // Get started button
                getStartedButton
                    .opacity(buttonOpacity)
                    .padding(.horizontal, AppTheme.Spacing.xxl)
                    .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .onAppear {
            startAnimations()
        }
    }

    // MARK: - Components

    private var successOrb: some View {
        let size: CGFloat = 120

        return ZStack {
            // Outer glow (larger for celebration)
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            AppTheme.Colors.orbSkyMid.opacity(0.4),
                            AppTheme.Colors.orbSkyDeep.opacity(0.15),
                            Color.clear
                        ]),
                        center: .center,
                        startRadius: size * 0.4,
                        endRadius: size * 1.5
                    )
                )
                .frame(width: size * 2.5, height: size * 2.5)

            // Main orb
            ZStack {
                Circle()
                    .fill(AppTheme.Gradients.orb)

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
                            endRadius: size * 0.4
                        )
                    )

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
                            endRadius: size * 0.35
                        )
                    )

                // Checkmark
                Image(systemName: "checkmark")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundColor(.white)
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.4), radius: 24, x: 0, y: 10)
        }
        .pulsingAnimation()
    }

    private var firstWorkoutCard: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text("Your First Workout")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .textCase(.uppercase)

            if let program = programStore.program?.program,
               let firstSession = program.sessions.first {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text(firstSession.focus)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    HStack(spacing: AppTheme.Spacing.lg) {
                        HStack(spacing: AppTheme.Spacing.xs) {
                            Image(systemName: "clock")
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                            Text("~\(firstSession.durationMin) min")
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                        }

                        if !firstSession.equipment.isEmpty {
                            HStack(spacing: AppTheme.Spacing.xs) {
                                Image(systemName: "dumbbell")
                                    .font(.system(size: 14))
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                                Text(firstSession.equipment.prefix(2).joined(separator: ", "))
                                    .font(.system(size: 14))
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                            }
                        }
                    }

                    if !firstSession.notes.isEmpty {
                        Text(firstSession.notes)
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                            .lineLimit(2)
                    }
                }
            } else {
                HStack {
                    Text("Ready when you are!")
                        .font(.system(size: 16))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    Spacer()
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private var getStartedButton: some View {
        Button(action: finishOnboarding) {
            Text("Let's Get Started")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
                .background(AppTheme.Colors.primaryText)
                .cornerRadius(AppTheme.CornerRadius.large)
        }
    }

    // MARK: - Animations

    private func startAnimations() {
        // Orb entrance
        withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
            orbScale = 1.0
            orbOpacity = 1.0
        }

        // Confetti
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            showConfetti = true
        }

        // Content fade in
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.easeIn(duration: 0.4)) {
                contentOpacity = 1.0
            }
        }

        // Button fade in
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
            withAnimation(.easeIn(duration: 0.3)) {
                buttonOpacity = 1.0
            }
        }
    }

    // MARK: - Actions

    private func finishOnboarding() {
        Task {
            await onboardingStore.completeOnboarding()
        }
    }
}

// MARK: - Confetti View

struct ConfettiView: View {
    @State private var confettiPieces: [ConfettiPiece] = []

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(confettiPieces) { piece in
                    ConfettiPieceView(piece: piece)
                }
            }
            .onAppear {
                generateConfetti(in: geo.size)
            }
        }
    }

    private func generateConfetti(in size: CGSize) {
        let colors: [Color] = [
            AppTheme.Colors.orbSkyLight,
            AppTheme.Colors.orbSkyMid,
            AppTheme.Colors.orbSkyDeep,
            AppTheme.Colors.orbCloudWhite,
            .yellow.opacity(0.8),
            .pink.opacity(0.6)
        ]

        confettiPieces = (0..<50).map { _ in
            ConfettiPiece(
                x: CGFloat.random(in: 0...size.width),
                y: CGFloat.random(in: -100...0),
                color: colors.randomElement() ?? .blue,
                size: CGFloat.random(in: 6...12),
                rotation: Double.random(in: 0...360),
                delay: Double.random(in: 0...0.5)
            )
        }
    }
}

struct ConfettiPiece: Identifiable {
    let id = UUID()
    let x: CGFloat
    let y: CGFloat
    let color: Color
    let size: CGFloat
    let rotation: Double
    let delay: Double
}

struct ConfettiPieceView: View {
    let piece: ConfettiPiece

    @State private var offsetY: CGFloat = 0
    @State private var rotation: Double = 0
    @State private var opacity: Double = 1

    var body: some View {
        Rectangle()
            .fill(piece.color)
            .frame(width: piece.size, height: piece.size * 0.6)
            .rotationEffect(.degrees(rotation))
            .offset(x: piece.x, y: piece.y + offsetY)
            .opacity(opacity)
            .onAppear {
                withAnimation(
                    .easeOut(duration: 3)
                    .delay(piece.delay)
                ) {
                    offsetY = 800
                    rotation = piece.rotation + Double.random(in: -180...180)
                }

                withAnimation(
                    .easeIn(duration: 1)
                    .delay(piece.delay + 2)
                ) {
                    opacity = 0
                }
            }
    }
}

#Preview {
    OnboardingSuccessView()
}
