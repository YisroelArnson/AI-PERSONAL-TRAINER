import SwiftUI
import UserNotifications

struct NotificationPermissionView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared

    @State private var isRequestingPermission = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Content
                VStack(spacing: AppTheme.Spacing.lg) {
                    Text("Stay on Track")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Text("I'd like to send you workout reminders and celebrate your wins with you.")
                        .font(.system(size: 17))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, AppTheme.Spacing.xxxl)

                Spacer()
                    .frame(height: AppTheme.Spacing.xxxl)

                // Notification preview
                notificationPreview
                    .padding(.horizontal, AppTheme.Spacing.xxl)

                Spacer()

                // Buttons
                VStack(spacing: AppTheme.Spacing.md) {
                    enableButton
                    skipButton
                }
                .padding(.horizontal, AppTheme.Spacing.xxl)
                .padding(.bottom, AppTheme.Spacing.xxxl)
            }
        }
    }

    // MARK: - Components

    private var notificationPreview: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            // App icon
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(AppTheme.Gradients.orb)
                    .frame(width: 44, height: 44)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text("AI Personal Trainer")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Spacer()

                    Text("now")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                }

                Text("Time for your upper body workout! Ready to crush it? 💪")
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .lineLimit(2)
            }
        }
        .padding(AppTheme.Spacing.lg)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .stroke(AppTheme.Colors.divider, lineWidth: 1)
        )
    }

    private var enableButton: some View {
        Button(action: requestNotificationPermission) {
            HStack {
                if isRequestingPermission {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "bell.fill")
                        .font(.system(size: 16, weight: .medium))
                    Text("Enable Notifications")
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

    private var skipButton: some View {
        Button(action: skipNotifications) {
            Text("Maybe Later")
                .font(.system(size: 17, weight: .medium))
                .foregroundColor(AppTheme.Colors.secondaryText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
        }
    }

    // MARK: - Actions

    private func requestNotificationPermission() {
        Haptic.medium()
        isRequestingPermission = true

        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            DispatchQueue.main.async {
                isRequestingPermission = false
                Task {
                    await onboardingStore.setNotificationPermission(granted)
                    await onboardingStore.setPhase(.success)
                }
            }
        }
    }

    private func skipNotifications() {
        Haptic.light()
        Task {
            await onboardingStore.skipNotifications()
            await onboardingStore.setPhase(.success)
        }
    }
}

#Preview {
    NotificationPermissionView()
}
