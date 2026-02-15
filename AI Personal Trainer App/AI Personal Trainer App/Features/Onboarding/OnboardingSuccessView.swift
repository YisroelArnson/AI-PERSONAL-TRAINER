import SwiftUI

struct OnboardingSuccessView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var programStore = TrainingProgramStore.shared

    @State private var showConfetti = false
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

    private var firstWorkoutCard: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text("Your First Workout")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .textCase(.uppercase)

            if programStore.program != nil {
                HStack {
                    Text("Your program is ready — let's go!")
                        .font(.system(size: 16))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    Spacer()
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
        // Confetti + haptic celebration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            Haptic.success()
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
        Haptic.medium()
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
