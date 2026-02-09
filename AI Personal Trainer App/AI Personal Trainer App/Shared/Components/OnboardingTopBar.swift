import SwiftUI

struct OnboardingTopBar: View {
    let label: String?
    let previousLabel: String?
    let showBack: Bool
    let onBack: () -> Void

    var body: some View {
        ZStack {
            // Back button (left)
            HStack {
                if showBack {
                    Button(action: onBack) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .frame(width: 36, height: 36)
                    }
                } else {
                    Spacer().frame(width: 36)
                }
                Spacer()
            }

            // Center label with crossfade
            if let label = label {
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .tracking(0.6)
                    .foregroundColor(AppTheme.Colors.tertiaryText)
                    .textCase(.uppercase)
                    .id(label)
                    .transition(.opacity)
                    .animation(.easeInOut(duration: 0.25), value: label)
            }

            // Right spacer for balance
            HStack {
                Spacer()
                Spacer().frame(width: 36)
            }
        }
        .frame(height: 44)
        .padding(.horizontal, 20)
    }
}
