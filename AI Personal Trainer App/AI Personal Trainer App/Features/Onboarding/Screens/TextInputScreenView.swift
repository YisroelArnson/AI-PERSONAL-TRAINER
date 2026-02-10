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
                .contentShape(Rectangle())
                .onTapGesture { isFocused = false }

            // Question — tap to dismiss keyboard
            Text(screen.question ?? "")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 20)
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .onTapGesture { isFocused = false }

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
                .contentShape(Rectangle())
                .onTapGesture { isFocused = false }

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
        .simultaneousGesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    if value.translation.height > 30 {
                        isFocused = false
                    }
                }
        )
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
