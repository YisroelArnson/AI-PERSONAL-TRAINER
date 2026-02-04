import SwiftUI

struct OTPCodeField: View {
    @Binding var code: String
    let codeLength: Int
    var onComplete: ((String) -> Void)?

    @FocusState private var isFocused: Bool

    init(code: Binding<String>, codeLength: Int = 6, onComplete: ((String) -> Void)? = nil) {
        self._code = code
        self.codeLength = codeLength
        self.onComplete = onComplete
    }

    var body: some View {
        ZStack {
            // Hidden text field for input
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($isFocused)
                .opacity(0)
                .onChange(of: code) { _, newValue in
                    // Limit to codeLength digits
                    let filtered = String(newValue.filter { $0.isNumber }.prefix(codeLength))
                    if filtered != newValue {
                        code = filtered
                    }

                    // Check for completion
                    if filtered.count == codeLength {
                        onComplete?(filtered)
                    }
                }

            // Visual code boxes
            HStack(spacing: AppTheme.Spacing.sm) {
                ForEach(0..<codeLength, id: \.self) { index in
                    codeBox(for: index)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                isFocused = true
            }
        }
        .onAppear {
            isFocused = true
        }
    }

    private func codeBox(for index: Int) -> some View {
        let digit = getDigit(at: index)
        let isCurrentBox = index == code.count && code.count < codeLength

        return ZStack {
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(AppTheme.Colors.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                        .stroke(
                            isCurrentBox ? AppTheme.Colors.primaryText : AppTheme.Colors.divider,
                            lineWidth: isCurrentBox ? 2 : 1
                        )
                )

            if let digit = digit {
                Text(digit)
                    .font(.system(size: 24, weight: .semibold, design: .monospaced))
                    .foregroundColor(AppTheme.Colors.primaryText)
            } else if isCurrentBox {
                // Cursor
                Rectangle()
                    .fill(AppTheme.Colors.primaryText)
                    .frame(width: 2, height: 24)
                    .opacity(isFocused ? 1 : 0)
                    .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isFocused)
            }
        }
        .frame(width: 48, height: 56)
    }

    private func getDigit(at index: Int) -> String? {
        guard index < code.count else { return nil }
        let digitIndex = code.index(code.startIndex, offsetBy: index)
        return String(code[digitIndex])
    }
}

#Preview {
    struct PreviewWrapper: View {
        @State private var code = ""

        var body: some View {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()

                VStack(spacing: AppTheme.Spacing.xxl) {
                    Text("Enter verification code")
                        .font(.system(size: 18, weight: .medium))

                    OTPCodeField(code: $code) { completedCode in
                        print("Code entered: \(completedCode)")
                    }

                    Text("Code: \(code)")
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .padding()
            }
        }
    }

    return PreviewWrapper()
}
