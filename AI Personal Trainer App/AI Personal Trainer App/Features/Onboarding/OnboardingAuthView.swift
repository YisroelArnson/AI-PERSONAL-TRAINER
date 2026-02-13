import SwiftUI
import Supabase

struct OnboardingAuthView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    @State private var email = ""
    @State private var agreedToTerms = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showTermsSheet = false
    @State private var showPrivacySheet = false

    private var isValidEmail: Bool {
        let emailRegex = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return email.range(of: emailRegex, options: .regularExpression) != nil
    }

    private var isReturningLogin: Bool {
        onboardingStore.isReturningLogin
    }

    private var canContinue: Bool {
        if isReturningLogin {
            return isValidEmail && !isLoading
        }
        return isValidEmail && agreedToTerms && !isLoading
    }

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Trainer message
                trainerMessage
                    .padding(.horizontal, AppTheme.Spacing.xxl)

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Email input
                emailInput
                    .padding(.horizontal, AppTheme.Spacing.xxl)

                // Terms checkbox (only for new signups)
                if !isReturningLogin {
                    Spacer()
                        .frame(height: AppTheme.Spacing.xl)

                    termsCheckbox
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                }

                // Error message
                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.Colors.danger)
                        .padding(.top, AppTheme.Spacing.md)
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                }

                Spacer()

                // Continue button
                continueButton
                    .padding(.horizontal, AppTheme.Spacing.xxl)
                    .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
        .sheet(isPresented: $showTermsSheet) {
            LegalDocumentSheet(
                title: "Terms of Service",
                url: URL(string: "https://example.com/terms")!
            )
        }
        .sheet(isPresented: $showPrivacySheet) {
            LegalDocumentSheet(
                title: "Privacy Policy",
                url: URL(string: "https://example.com/privacy")!
            )
        }
    }

    // MARK: - Components

    private var trainerMessage: some View {
        Text(isReturningLogin ? "Welcome back — enter your email to log in." : "Let's save your progress — what's your email?")
            .font(.system(size: 20, weight: .medium))
            .foregroundColor(AppTheme.Colors.primaryText)
            .multilineTextAlignment(.center)
    }

    private var emailInput: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            TextField("Email address", text: $email)
                .font(AppTheme.Typography.input)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .padding()
                .background(AppTheme.Colors.surface)
                .cornerRadius(AppTheme.CornerRadius.medium)
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                        .stroke(
                            !email.isEmpty && !isValidEmail
                                ? AppTheme.Colors.danger
                                : AppTheme.Colors.divider,
                            lineWidth: 1
                        )
                )

            if !email.isEmpty && !isValidEmail {
                Text("Please enter a valid email address")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.Colors.danger)
            }
        }
    }

    private var termsCheckbox: some View {
        Button(action: { Haptic.selection(); agreedToTerms.toggle() }) {
            HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                Image(systemName: agreedToTerms ? "checkmark.square.fill" : "square")
                    .font(.system(size: 20))
                    .foregroundColor(agreedToTerms ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryText)

                termsText
            }
        }
        .buttonStyle(.plain)
    }

    private var termsText: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text("I agree to the")
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.secondaryText)

                Button("Terms of Service") {
                    showTermsSheet = true
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AppTheme.Colors.primaryText)

                Text("and")
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }

            Button("Privacy Policy") {
                showPrivacySheet = true
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(AppTheme.Colors.primaryText)
        }
    }

    private var continueButton: some View {
        Button(action: sendOTP) {
            HStack {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                        .scaleEffect(0.8)
                } else {
                    Text("Continue")
                }
            }
            .font(.system(size: 17, weight: .semibold))
            .foregroundColor(AppTheme.Colors.background)
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppTheme.Spacing.lg)
            .background(canContinue ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryText)
            .cornerRadius(AppTheme.CornerRadius.large)
        }
        .disabled(!canContinue)
    }

    // MARK: - Actions

    private func sendOTP() {
        guard canContinue else { return }
        Haptic.medium()

        isLoading = true
        errorMessage = nil

        Task {
            do {
                // Store email
                onboardingStore.setPendingEmail(email)

                if !isReturningLogin {
                    onboardingStore.acceptTerms()
                }

                // Send OTP code via Supabase
                try await supabase.auth.signInWithOTP(
                    email: email,
                    shouldCreateUser: !isReturningLogin
                )

                // Move to verification screen
                await onboardingStore.setPhase(.authVerification)
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

// MARK: - Legal Document Sheet

struct LegalDocumentSheet: View {
    let title: String
    let url: URL

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            WebViewWrapper(url: url)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            dismiss()
                        }
                    }
                }
        }
    }
}

// Simple WebView wrapper for legal documents
import WebKit

struct WebViewWrapper: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

#Preview {
    NavigationStack {
        OnboardingAuthView()
    }
}
