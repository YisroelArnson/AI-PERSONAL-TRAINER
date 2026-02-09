import SwiftUI

struct IntakeCompleteScreenView: View {
    let userName: String?
    let onCreateProgram: () -> Void

    @State private var showContent = false
    @State private var showButton = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            if showContent {
                // Orb
                OnboardingOrbView(size: 100)
                    .padding(.bottom, 24)

                // Headline
                Text("Got it, \(userName ?? "there").")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                // Subtext
                Text("I have everything I need to build your program. Let's create your account and get started.")
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 280)
                    .padding(.top, 12)
            }

            Spacer()

            if showButton {
                Button(action: onCreateProgram) {
                    Text("Create my program")
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
        .onAppear {
            withAnimation(.easeOut(duration: 0.5)) {
                showContent = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                withAnimation(.easeOut(duration: 0.3)) {
                    showButton = true
                }
            }
        }
    }
}
