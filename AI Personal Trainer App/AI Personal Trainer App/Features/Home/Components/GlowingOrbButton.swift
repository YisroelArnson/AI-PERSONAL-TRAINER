//
//  GlowingOrbButton.swift
//  AI Personal Trainer App
//
//  The orb is the only colored, glowing element.
//

import SwiftUI

struct GlowingOrbButton: View {
    let isCompleted: Bool
    let isEnabled: Bool
    let action: () -> Void

    @State private var isPressing = false

    private let size: CGFloat = 56

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(isEnabled ? AnyShapeStyle(AppTheme.Gradients.orb) : AnyShapeStyle(AppTheme.Colors.surface))
                    .frame(width: size, height: size)
                    .shadow(color: isEnabled ? AppTheme.Shadow.orb : .clear, radius: AppTheme.Shadow.orbRadius, x: 0, y: 3)

                Image(systemName: "checkmark")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(isEnabled ? Color.white : AppTheme.Colors.tertiaryText)
            }
            .scaleEffect(isPressing ? 0.96 : 1.0)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if isEnabled && !isPressing {
                        withAnimation(.easeOut(duration: 0.1)) {
                            isPressing = true
                        }
                    }
                }
                .onEnded { _ in
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        isPressing = false
                    }
                }
        )
    }
}

#Preview("Default") {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        GlowingOrbButton(isCompleted: false, isEnabled: true) {}
    }
}
