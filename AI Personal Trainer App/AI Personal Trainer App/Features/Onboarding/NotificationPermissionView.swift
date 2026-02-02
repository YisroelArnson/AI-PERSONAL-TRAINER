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

                // Orb
                notificationOrb

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

    private var notificationOrb: some View {
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

                // Bell icon
                Image(systemName: "bell.fill")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundColor(AppTheme.Colors.orbSkyDeep.opacity(0.6))
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.3), radius: 16, x: 0, y: 6)
        }
    }

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
        isRequestingPermission = true

        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            DispatchQueue.main.async {
                isRequestingPermission = false
                Task {
                    await onboardingStore.setNotificationPermission(granted)
                    await onboardingStore.advanceToNextPhase()
                }
            }
        }
    }

    private func skipNotifications() {
        Task {
            await onboardingStore.skipNotifications()
            await onboardingStore.advanceToNextPhase()
        }
    }
}

#Preview {
    NotificationPermissionView()
}
