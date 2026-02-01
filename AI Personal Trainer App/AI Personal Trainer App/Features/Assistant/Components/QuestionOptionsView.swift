//
//  QuestionOptionsView.swift
//  AI Personal Trainer App
//
//  Displays selectable options for message_ask_user tool responses.
//  Shows options as tappable buttons that send the selection as user input.
//

import SwiftUI

struct QuestionOptionsView: View {
    let options: [String]
    let onOptionSelected: (String) -> Void

    // Animation state
    @State private var hasAppeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                OptionButton(
                    option: option,
                    index: index,
                    onTap: { onOptionSelected(option) }
                )
                .opacity(hasAppeared ? 1 : 0)
                .offset(y: hasAppeared ? 0 : 10)
                .animation(
                    .spring(response: 0.4, dampingFraction: 0.8)
                        .delay(Double(index) * 0.1),
                    value: hasAppeared
                )
            }
        }
        .padding(.top, AppTheme.Spacing.xs)
        .onAppear {
            hasAppeared = true
        }
    }
}

// MARK: - Option Button Component

private struct OptionButton: View {
    let option: String
    let index: Int
    let onTap: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: AppTheme.Spacing.md) {
                // Option indicator
                ZStack {
                    Circle()
                        .fill(AppTheme.Colors.highlight)
                        .frame(width: 28, height: 28)

                    Text("\(index + 1)")
                        .font(AppTheme.Typography.label)
                        .foregroundColor(AppTheme.Colors.primaryText)
                }

                // Option text
                Text(option)
                    .font(AppTheme.Typography.input)
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)

                Spacer()

                // Arrow indicator
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.tertiaryText)
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.vertical, AppTheme.Spacing.md)
            .background(optionBackground)
        }
        .buttonStyle(ScaleButtonStyle())
    }

    private var optionBackground: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(AppTheme.Colors.surface)
    }
}

// MARK: - Scale Button Style

private struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Question Options") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(spacing: AppTheme.Spacing.lg) {
            // Sample message
            MessageBubble(
                message: ChatMessage(
                    role: .assistant,
                    content: "Would you like me to generate a new workout to replace your current one, or would you prefer to continue with your existing workout?"
                )
            )

            // Options
            QuestionOptionsView(
                options: [
                    "Generate a new workout",
                    "Keep my current workout"
                ],
                onOptionSelected: { option in
                    print("Selected: \(option)")
                }
            )
            .padding(.horizontal, AppTheme.Spacing.lg)
        }
        .padding()
    }
}

#Preview("Multiple Options") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(spacing: AppTheme.Spacing.lg) {
            QuestionOptionsView(
                options: [
                    "Upper body strength",
                    "Lower body focus",
                    "Full body workout",
                    "Cardio and core"
                ],
                onOptionSelected: { option in
                    print("Selected: \(option)")
                }
            )
            .padding(.horizontal, AppTheme.Spacing.lg)
        }
        .padding()
    }
}
