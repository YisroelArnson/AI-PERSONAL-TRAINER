import SwiftUI

struct SimpleSelectScreenView: View {
    let screen: OnboardingScreen
    let value: String?
    let onChange: (String, String) -> Void
    let onNext: () -> Void

    @State private var selected: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Question
            Text(screen.question ?? "")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            // Sub text
            if let sub = screen.sub {
                Text(sub)
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.top, 8)
            }

            // Options
            VStack(spacing: 8) {
                ForEach(screen.options ?? [], id: \.self) { option in
                    Button {
                        selected = option
                        if let field = screen.field {
                            onChange(field, option)
                        }
                    } label: {
                        Text(option)
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(selected == option ? AppTheme.Colors.background : AppTheme.Colors.primaryText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 16)
                            .padding(.horizontal, 20)
                            .background(selected == option ? AppTheme.Colors.primaryText : AppTheme.Colors.surface)
                            .cornerRadius(AppTheme.CornerRadius.large)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)

            Spacer()

            // Bottom bar
            HStack {
                Spacer()
                ChevronButton(enabled: selected != nil) {
                    onNext()
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .onAppear {
            selected = value
        }
    }
}
