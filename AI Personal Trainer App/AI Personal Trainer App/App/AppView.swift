import SwiftUI

struct AppView: View {
    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 16) {
                Text("AI Personal Trainer")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.primaryText)

                Text("Legacy app flows were removed. The new coach surface will be rebuilt from this reset point.")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                RoundedRectangle(cornerRadius: 20)
                    .fill(AppTheme.Colors.surface)
                    .frame(height: 180)
                    .overlay {
                        VStack(spacing: 10) {
                            Image(systemName: "sparkles.rectangle.stack")
                                .font(.system(size: 28, weight: .semibold))
                                .foregroundStyle(AppTheme.Colors.accent)
                            Text("Coach surface scaffold coming next")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(AppTheme.Colors.primaryText)
                        }
                    }
            }
            .padding(24)
            .frame(maxWidth: 640, alignment: .leading)
        }
    }
}

#Preview {
    AppView()
}
