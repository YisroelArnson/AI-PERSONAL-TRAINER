import SwiftUI
import Supabase

struct OTPVerificationView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    @State private var code = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var resendCountdown = 30
    @State private var canResend = false

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top orb
                smallOrb
                    .padding(.top, AppTheme.Spacing.xxxl)

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Instructions
                instructionText
                    .padding(.horizontal, AppTheme.Spacing.xxl)

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // OTP Code input
                OTPCodeField(code: $code) { completedCode in
                    verifyCode(completedCode)
                }
                .disabled(isLoading)
                .padding(.horizontal, AppTheme.Spacing.xxl)

                // Error message
                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.Colors.danger)
                        .padding(.top, AppTheme.Spacing.lg)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                }

                // Loading indicator
                if isLoading {
                    ProgressView()
                        .padding(.top, AppTheme.Spacing.xl)
                }

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Resend link
                resendButton
                    .padding(.horizontal, AppTheme.Spacing.xxl)

                Spacer()
                    .frame(height: AppTheme.Spacing.lg)

                // Use different email link
                differentEmailButton

                Spacer()
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                OnboardingBackButton {
                    Task {
                        await onboardingStore.setPhase(.auth)
                    }
                }
            }
        }
        .onReceive(timer) { _ in
            if resendCountdown > 0 {
                resendCountdown -= 1
            } else {
                canResend = true
            }
        }
    }

    // MARK: - Components

    private var smallOrb: some View {
        let size: CGFloat = 60

        return ZStack {
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
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.3), radius: 12, x: 0, y: 4)
    }

    private var instructionText: some View {
        VStack(spacing: AppTheme.Spacing.sm) {
            Text("Check your email")
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)

            if let email = onboardingStore.state.pendingEmail {
                Text("We sent a 6-digit code to")
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)

                Text(email)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }
        }
        .multilineTextAlignment(.center)
    }

    private var resendButton: some View {
        Button(action: resendCode) {
            if canResend {
                Text("Resend Code")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(AppTheme.Colors.primaryText)
            } else {
                Text("Resend code in \(resendCountdown)s")
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
        }
        .disabled(!canResend)
    }

    private var differentEmailButton: some View {
        Button(action: useDifferentEmail) {
            Text("Use a different email")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(AppTheme.Colors.primaryText)
        }
    }

    // MARK: - Actions

    private func verifyCode(_ code: String) {
        guard let email = onboardingStore.state.pendingEmail else {
            errorMessage = "Email not found. Please try again."
            return
        }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                try await supabase.auth.verifyOTP(
                    email: email,
                    token: code,
                    type: .email
                )

                // Clear pending email
                onboardingStore.clearPendingEmail()

                // Move to next phase
                await onboardingStore.completeAuth()
            } catch {
                // Check if it's an invalid/expired code error
                if error.localizedDescription.lowercased().contains("invalid") ||
                   error.localizedDescription.lowercased().contains("expired") {
                    errorMessage = "Invalid or expired code. Please try again."
                } else {
                    errorMessage = error.localizedDescription
                }
                // Clear the code so user can retry
                self.code = ""
            }
            isLoading = false
        }
    }

    private func resendCode() {
        guard let email = onboardingStore.state.pendingEmail else { return }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                try await supabase.auth.signInWithOTP(
                    email: email,
                    shouldCreateUser: true
                )

                // Reset countdown
                canResend = false
                resendCountdown = 30
            } catch {
                errorMessage = "Failed to resend code. Please try again."
            }
            isLoading = false
        }
    }

    private func useDifferentEmail() {
        onboardingStore.clearPendingEmail()
        code = ""
        errorMessage = nil
        Task {
            await onboardingStore.setPhase(.auth)
        }
    }
}

#Preview {
    NavigationStack {
        OTPVerificationView()
    }
}
