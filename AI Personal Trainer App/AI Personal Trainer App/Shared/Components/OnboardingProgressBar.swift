import SwiftUI

struct OnboardingProgressBar: View {
    let progress: CGFloat

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(AppTheme.Colors.surface)
                    .frame(height: 3)

                RoundedRectangle(cornerRadius: 1.5)
                    .fill(AppTheme.Colors.primaryText.opacity(0.4))
                    .frame(width: geometry.size.width * min(progress, 1.0), height: 3)
                    .animation(.easeOut(duration: 0.4), value: progress)
            }
        }
        .frame(height: 3)
    }
}
