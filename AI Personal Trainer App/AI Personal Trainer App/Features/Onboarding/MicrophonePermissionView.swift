import SwiftUI
import AVFoundation

struct MicrophonePermissionView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    @State private var isRequestingPermission = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Orb
                permissionOrb

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Content
                VStack(spacing: AppTheme.Spacing.lg) {
                    Text("Let's chat")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Text("I'd love to chat with you using voice — it makes this much more natural.")
                        .font(.system(size: 17))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)

                    Text("You can also type if you prefer.")
                        .font(.system(size: 15))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, AppTheme.Spacing.xxxl)

                Spacer()

                // Buttons
                VStack(spacing: AppTheme.Spacing.md) {
                    enableVoiceButton
                    typeInsteadButton
                }
                .padding(.horizontal, AppTheme.Spacing.xxl)
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                OnboardingBackButton {
                    Task {
                        await onboardingStore.goToPreviousPhase()
                    }
                }
            }
        }
    }

    // MARK: - Components

    private var permissionOrb: some View {
        let size: CGFloat = 100

        return ZStack {
            // Outer glow
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            AppTheme.Colors.orbSkyMid.opacity(0.2),
                            AppTheme.Colors.orbSkyDeep.opacity(0.05),
                            Color.clear
                        ]),
                        center: .center,
                        startRadius: size * 0.4,
                        endRadius: size * 1.0
                    )
                )
                .frame(width: size * 1.6, height: size * 1.6)

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

                // Microphone icon
                Image(systemName: "mic.fill")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundColor(AppTheme.Colors.orbSkyDeep.opacity(0.6))
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.3), radius: 16, x: 0, y: 6)
        }
    }

    private var enableVoiceButton: some View {
        Button(action: requestMicrophonePermission) {
            HStack {
                if isRequestingPermission {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 16, weight: .medium))
                    Text("Enable Voice")
                }
            }
            .font(.system(size: 17, weight: .semibold))
            .foregroundColor(AppTheme.Colors.background)
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppTheme.Spacing.lg)
            .background(AppTheme.Colors.primaryText)
            .cornerRadius(AppTheme.CornerRadius.large)
        }
        .disabled(isRequestingPermission)
    }

    private var typeInsteadButton: some View {
        Button(action: skipVoice) {
            Text("I'll Type Instead")
                .font(.system(size: 17, weight: .medium))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
        }
    }

    // MARK: - Actions

    private func requestMicrophonePermission() {
        isRequestingPermission = true

        AVAudioApplication.requestRecordPermission { granted in
            DispatchQueue.main.async {
                isRequestingPermission = false
                Task {
                    await onboardingStore.setMicrophonePermission(granted)
                    await onboardingStore.advanceToNextPhase()
                }
            }
        }
    }

    private func skipVoice() {
        Task {
            await onboardingStore.setMicrophonePermission(false)
            await onboardingStore.advanceToNextPhase()
        }
    }
}

#Preview {
    NavigationStack {
        MicrophonePermissionView()
    }
}
