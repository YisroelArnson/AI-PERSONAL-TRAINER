//
//  AuthView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/22/25.
//

// Provides app-side service logic for auth view.
//
// Main functions in this file:
// - primaryButtonTapped: Handles Primary button tapped for AuthView.swift.
// - sendCode: Sends Code to the backend or user.
// - verifyCode: Handles Verify code for AuthView.swift.

import SwiftUI
import Supabase

struct AuthView: View {
  enum AuthStep {
    case requestCode
    case verifyCode
  }

  @State var email = ""
  @State var verificationCode = ""
  @State var isLoading = false
  @State var authStep: AuthStep = .requestCode
  @State var submittedEmail: String?
  @State var statusMessage: String?
  @State var errorMessage: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Sign in")
        .font(.system(size: 26, weight: .bold, design: .rounded))
        .foregroundStyle(AppTheme.Colors.primaryText)

      Text("Use your email and we’ll send a one-time code. The app keeps auth on-device, but all product data stays behind the backend.")
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(AppTheme.Colors.secondaryText)
        .fixedSize(horizontal: false, vertical: true)

      VStack(alignment: .leading, spacing: 10) {
        Text("Email")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(AppTheme.Colors.secondaryText)

        TextField("name@example.com", text: $email)
          .textContentType(.emailAddress)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .font(.system(size: 16, weight: .medium))
          .disabled(authStep == .verifyCode)
          .padding(.horizontal, 14)
          .padding(.vertical, 14)
          .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
              .fill(AppTheme.Colors.background)
          )
          .opacity(authStep == .verifyCode ? 0.65 : 1)
      }

      if authStep == .verifyCode {
        VStack(alignment: .leading, spacing: 10) {
          Text("Verification code")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(AppTheme.Colors.secondaryText)

          TextField("123456", text: $verificationCode)
            .textContentType(.oneTimeCode)
            .keyboardType(.numberPad)
            .font(.system(size: 24, weight: .semibold, design: .monospaced))
            .tracking(4)
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .background(
              RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(AppTheme.Colors.background)
            )
        }
      }

      Button(action: primaryButtonTapped) {
        HStack(spacing: 10) {
          if isLoading {
            ProgressView()
              .controlSize(.small)
              .tint(AppTheme.Colors.background)
          }

          Text(primaryButtonTitle)
            .font(.system(size: 15, weight: .semibold))
        }
        .foregroundStyle(AppTheme.Colors.background)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(AppTheme.Colors.primaryText)
        )
      }
      .buttonStyle(.plain)
      .disabled(primaryButtonDisabled)

      if authStep == .verifyCode {
        HStack(spacing: 12) {
          Button("Resend code") {
            Task { await sendCode() }
          }
          .buttonStyle(.plain)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(AppTheme.Colors.primaryText)

          Button("Use different email") {
            Haptic.selection()
            authStep = .requestCode
            verificationCode = ""
            submittedEmail = nil
            statusMessage = nil
            errorMessage = nil
          }
          .buttonStyle(.plain)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(AppTheme.Colors.secondaryText)
        }
      }

      if let statusMessage {
        Label(statusMessage, systemImage: "number.circle.fill")
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(AppTheme.Colors.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }

      if let errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.circle.fill")
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(AppTheme.Colors.danger)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }

  private var primaryButtonTitle: String {
    switch authStep {
    case .requestCode:
      return isLoading ? "Sending code..." : "Send code"
    case .verifyCode:
      return isLoading ? "Verifying..." : "Verify code"
    }
  }

  private var primaryButtonDisabled: Bool {
    if isLoading {
      return true
    }

    switch authStep {
    case .requestCode:
      return email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    case .verifyCode:
      return normalizedCode.count < 6
    }
  }

  private var normalizedCode: String {
    verificationCode.filter(\.isNumber)
  }

  /// Handles Primary button tapped for AuthView.swift.
  private func primaryButtonTapped() {
    Task {
      switch authStep {
      case .requestCode:
        await sendCode()
      case .verifyCode:
        await verifyCode()
      }
    }
  }

  /// Sends Code to the backend or user.
  private func sendCode() async {
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedEmail.isEmpty else { return }

    isLoading = true
    defer { isLoading = false }

    do {
      try await supabase.auth.signInWithOTP(email: trimmedEmail)
      email = trimmedEmail
      submittedEmail = trimmedEmail
      verificationCode = ""
      authStep = .verifyCode
      statusMessage = "We sent a 6-digit code to \(trimmedEmail)."
      errorMessage = nil
      Haptic.success()
    } catch {
      errorMessage = error.localizedDescription
      statusMessage = nil
      Haptic.error()
    }
  }

  /// Handles Verify code for AuthView.swift.
  private func verifyCode() async {
    guard let submittedEmail else { return }

    isLoading = true
    defer { isLoading = false }

    do {
      _ = try await supabase.auth.verifyOTP(
        email: submittedEmail,
        token: normalizedCode,
        type: .email
      )
      statusMessage = "Code accepted. Signing you in..."
      errorMessage = nil
      Haptic.success()
    } catch {
      errorMessage = error.localizedDescription
      statusMessage = nil
      Haptic.error()
    }
  }
}
