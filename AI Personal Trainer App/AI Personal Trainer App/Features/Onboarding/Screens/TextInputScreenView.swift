import SwiftUI

struct TextInputScreenView: View {
    let screen: OnboardingScreen
    let value: String
    let onChange: (String, String) -> Void
    let onNext: () -> Void

    @State private var text: String = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Question
            Text(screen.question ?? "")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 20)

            // Text field
            TextField(screen.placeholder ?? "Type here...", text: $text)
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(16)
                .background(AppTheme.Colors.surface)
                .cornerRadius(AppTheme.CornerRadius.medium)
                .padding(.horizontal, 20)
                .focused($isFocused)
                .submitLabel(.next)
                .onSubmit {
                    submitIfValid()
                }
                .onChange(of: text) { _, newValue in
                    if let field = screen.field {
                        onChange(field, newValue)
                    }
                }

            Spacer()

            // Bottom bar with chevron
            HStack {
                Spacer()
                ChevronButton(enabled: !text.trimmingCharacters(in: .whitespaces).isEmpty) {
                    submitIfValid()
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .onAppear {
            text = value
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                isFocused = true
            }
        }
    }

    private func submitIfValid() {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        if let field = screen.field {
            onChange(field, trimmed)
        }
        onNext()
    }
}
