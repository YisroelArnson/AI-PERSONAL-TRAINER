import SwiftUI

struct FabMenuItem: Identifiable {
    let id = UUID()
    let icon: String
    let action: () -> Void
}

struct ExpandingFabMenu: View {
    @Binding var isExpanded: Bool
    let items: [FabMenuItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: toggle) {
                ZStack {
                    Circle()
                        .fill(AppTheme.Colors.surface)
                        .frame(width: 44, height: 44)
                    if isExpanded {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                    } else {
                        TwoLineMenuIcon()
                    }
                }
            }
            .buttonStyle(.plain)

            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                Button(action: {
                    item.action()
                    withAnimation(AppTheme.Animation.gentle) {
                        isExpanded = false
                    }
                }) {
                    Circle()
                        .fill(AppTheme.Colors.surface)
                        .frame(width: 40, height: 40)
                        .overlay(
                            Image(systemName: item.icon)
                                .font(.system(size: 18, weight: .regular))
                                .foregroundColor(AppTheme.Colors.primaryText)
                        )
                }
                .buttonStyle(.plain)
                .opacity(isExpanded ? 1 : 0)
                .offset(y: isExpanded ? 0 : -10)
                .animation(.easeInOut(duration: 0.2).delay(Double(index) * 0.05), value: isExpanded)
            }
        }
        .padding(.leading, AppTheme.Spacing.xl)
        .padding(.top, AppTheme.Spacing.xl)
    }

    private func toggle() {
        withAnimation(AppTheme.Animation.gentle) {
            isExpanded.toggle()
        }
    }
}
