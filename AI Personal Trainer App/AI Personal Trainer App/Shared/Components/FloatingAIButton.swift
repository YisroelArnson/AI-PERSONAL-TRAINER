//
//  FloatingAIButton.swift
//  AI Personal Trainer App
//
//  Minimal monochrome UI with orb-only color.
//

import SwiftUI

enum AIButtonState: Equatable {
    case idle
    case processing
    case hasPending
}

struct FloatingAIButton: View {
    var state: AIButtonState = .idle
    var pendingCount: Int = 0
    let action: () -> Void

    @State private var isBreathing = false

    private let buttonSize: CGFloat = 50

    var body: some View {
        Button(action: action) {
            ZStack {
                orb

                if state == .processing {
                    Image(systemName: "waveform")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white)
                        .symbolEffect(.variableColor.iterative, options: .repeating)
                } else {
                    Image(systemName: "waveform")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white)
                }

                if state == .hasPending && pendingCount > 0 {
                    pendingBadge
                }
            }
        }
        .buttonStyle(.plain)
        .onAppear {
            withAnimation(AppTheme.Animation.breathing) {
                isBreathing = true
            }
        }
    }

    private var orb: some View {
        Circle()
            .fill(AppTheme.Gradients.orb)
            .frame(width: buttonSize, height: buttonSize)
            .shadow(color: AppTheme.Shadow.orb, radius: isBreathing ? 14 : 10, x: 0, y: 3)
            .scaleEffect(isBreathing ? 1.02 : 1.0)
    }

    private var pendingBadge: some View {
        ZStack {
            Circle()
                .fill(AppTheme.Colors.surface)
                .frame(width: 20, height: 20)
            Text("\(min(pendingCount, 9))\(pendingCount > 9 ? "+" : "")")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
        }
        .offset(x: buttonSize / 2 - 6, y: -buttonSize / 2 + 6)
    }
}

extension FloatingAIButton {
    init(action: @escaping () -> Void) {
        self.state = .idle
        self.pendingCount = 0
        self.action = action
    }
}

#Preview("Idle") {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()

        VStack {
            Spacer()
            HStack {
                Spacer()
                FloatingAIButton(state: .idle, pendingCount: 0) {}
                    .padding()
            }
        }
    }
}
