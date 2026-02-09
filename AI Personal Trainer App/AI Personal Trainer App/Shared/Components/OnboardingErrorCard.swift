import SwiftUI

struct OnboardingErrorCard: View {
    let title: String
    let message: String
    let primaryActionTitle: String
    let primaryAction: () -> Void

    var body: some View {
        VStack(spacing: AppTheme.Spacing.lg) {
            VStack(spacing: AppTheme.Spacing.sm) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text(message)
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
            }

            Button(action: primaryAction) {
                Text(primaryActionTitle)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.background)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(AppTheme.Colors.primaryText)
                    .cornerRadius(AppTheme.CornerRadius.medium)
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface.opacity(0.5))
        .cornerRadius(AppTheme.CornerRadius.large)
    }
}

#Preview {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()
        OnboardingErrorCard(
            title: "Something went wrong",
            message: "Please check your connection and try again.",
            primaryActionTitle: "Retry",
            primaryAction: {}
        )
        .padding(20)
    }
}

