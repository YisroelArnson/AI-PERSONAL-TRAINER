import SwiftUI

// MARK: - Orb Alignment

enum OrbAlignment {
    case center       // welcome, success
    case topCenter    // auth, authVerification, intake
    case topLeading   // goalReview, programReview
    case hidden       // complete
}

// MARK: - Orb Config

struct OrbConfig: Equatable {
    let size: CGFloat
    let icon: String?
    let alignment: OrbAlignment
}

// MARK: - Shared Onboarding Orb

struct OnboardingOrbView: View {
    let size: CGFloat
    var icon: String? = nil
    var isLoading: Bool = false

    var body: some View {
        ZStack {
            // Outer glow (proportional to size)
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            AppTheme.Colors.orbSkyMid.opacity(0.3),
                            AppTheme.Colors.orbSkyDeep.opacity(0.1),
                            Color.clear
                        ]),
                        center: .center,
                        startRadius: size * 0.4,
                        endRadius: size * 1.2
                    )
                )
                .frame(width: size * 2, height: size * 2)

            // Main orb body
            ZStack {
                // Base gradient
                Circle()
                    .fill(AppTheme.Gradients.orb)

                // Cloud layer 1 — top left wisp
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

                // Cloud layer 2 — top right highlight
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

                // Cloud layer 3 — middle soft cloud
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
                            endRadius: size * 0.45
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
                    .frame(width: size - 1.5, height: size - 1.5)

                // Optional icon overlay
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: size * 0.3, weight: .medium))
                        .foregroundColor(AppTheme.Colors.orbSkyDeep.opacity(0.6))
                }

                // Loading indicator
                if isLoading {
                    ProgressView()
                        .scaleEffect(size / 80)
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.orbSkyDeep.opacity(0.6)))
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.4), radius: size * 0.17, x: 0, y: size * 0.07)
        }
        .pulsingAnimation()
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
    ZStack {
        Color.black.ignoresSafeArea()
        OnboardingOrbView(size: 120, icon: "checkmark")
    }
}
