import SwiftUI

struct IntroCTAView: View {
    let onNext: () -> Void

    @State private var showHeadline = false
    @State private var showSubtext = false
    @State private var showButton = false
    @State private var orbSettled = false

    var body: some View {
        ZStack {
            // Subtle background glow
            RadialGradient(
                gradient: Gradient(colors: [
                    AppTheme.Colors.orbSkyMid.opacity(0.05),
                    Color.clear
                ]),
                center: .center,
                startRadius: 0,
                endRadius: 250
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Orb (56pt) with settle animation
                OnboardingOrbView(size: 56)
                    .scaleEffect(orbSettled ? 1.0 : 1.04)

                // Headline
                if showHeadline {
                    Text("Let's build your program.")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .multilineTextAlignment(.center)
                        .padding(.top, 24)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                // Subtext
                if showSubtext {
                    Text("I'll ask some questions — talk or type.\nThe more I know, the better your plan.")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                        .padding(.top, 12)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                Spacer()

                // Get Started button
                if showButton {
                    Button(action: onNext) {
                        Text("Get Started")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(AppTheme.Colors.background)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(AppTheme.Colors.primaryText)
                            .clipShape(Capsule())
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
        }
        .onAppear {
            // Orb settle
            withAnimation(.easeOut(duration: 0.6)) {
                orbSettled = true
            }

            // Headline
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                withAnimation(.easeOut(duration: 0.5)) {
                    showHeadline = true
                }
            }

            // Subtext
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                withAnimation(.easeOut(duration: 0.5)) {
                    showSubtext = true
                }
            }

            // Button
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                withAnimation(.easeOut(duration: 0.3)) {
                    showButton = true
                }
            }
        }
    }
}
