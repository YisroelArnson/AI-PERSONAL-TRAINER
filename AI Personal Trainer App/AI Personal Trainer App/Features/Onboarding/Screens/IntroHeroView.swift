import SwiftUI

struct IntroHeroView: View {
    let onNext: () -> Void

    @State private var showTagline = false
    @State private var showHint = false
    @State private var orbScale: CGFloat = 0.8

    var body: some View {
        ZStack {
            // Subtle background glow
            RadialGradient(
                gradient: Gradient(colors: [
                    AppTheme.Colors.orbSkyMid.opacity(0.06),
                    Color.clear
                ]),
                center: .center,
                startRadius: 0,
                endRadius: 250
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Orb
                OnboardingOrbView(size: 140)
                    .scaleEffect(orbScale)
                    .animation(
                        .easeInOut(duration: 4).repeatForever(autoreverses: true),
                        value: orbScale
                    )

                // Tagline
                if showTagline {
                    Text("Meet your pocket-sized\npersonal trainer.")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                        .padding(.top, 32)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                Spacer()

                // Tap hint
                if showHint {
                    Text("Tap to continue")
                        .font(.system(size: 13))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .padding(.bottom, 48)
                        .transition(.opacity)
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            onNext()
        }
        .onAppear {
            // Start breathing animation
            orbScale = 1.06

            // Tagline appears after 0.5s
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                withAnimation(.easeOut(duration: 0.6)) {
                    showTagline = true
                }
            }

            // Hint appears after 1.2s
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                withAnimation(.easeOut(duration: 0.4)) {
                    showHint = true
                }
            }
        }
    }
}
