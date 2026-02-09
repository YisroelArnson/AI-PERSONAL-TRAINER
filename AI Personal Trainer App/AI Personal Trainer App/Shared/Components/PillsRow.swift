import SwiftUI

struct PillsRow: View {
    let pills: [String]
    let selected: String?
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(pills, id: \.self) { pill in
                    Button {
                        onSelect(pill)
                    } label: {
                        Text(pill)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(selected == pill ? AppTheme.Colors.background : AppTheme.Colors.secondaryText)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(selected == pill ? AppTheme.Colors.primaryText : AppTheme.Colors.surface)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 20)
        }
    }
}
