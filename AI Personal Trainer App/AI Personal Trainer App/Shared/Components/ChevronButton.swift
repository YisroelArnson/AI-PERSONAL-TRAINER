import SwiftUI

struct ChevronButton: View {
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: {
            guard enabled else { return }
            Haptic.medium()
            action()
        }) {
            Image(systemName: "chevron.right")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(enabled ? AppTheme.Colors.background : AppTheme.Colors.tertiaryText)
                .frame(width: 88, height: 52)
                .background(enabled ? AppTheme.Colors.primaryText : AppTheme.Colors.surface)
                .clipShape(Capsule())
        }
        .allowsHitTesting(enabled)
        .animation(.easeInOut(duration: 0.2), value: enabled)
    }
}
