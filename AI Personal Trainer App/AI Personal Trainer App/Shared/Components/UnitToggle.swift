import SwiftUI

struct UnitToggle: View {
    let options: [String]
    @Binding var selectedIndex: Int

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                Button {
                    guard selectedIndex != index else { return }
                    Haptic.light()
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedIndex = index
                    }
                } label: {
                    Text(option)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(selectedIndex == index ? AppTheme.Colors.background : AppTheme.Colors.secondaryText)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(
                            selectedIndex == index
                            ? AppTheme.Colors.primaryText
                            : Color.clear
                        )
                        .clipShape(Capsule())
                }
            }
        }
        .padding(3)
        .background(AppTheme.Colors.surface)
        .clipShape(Capsule())
    }
}
