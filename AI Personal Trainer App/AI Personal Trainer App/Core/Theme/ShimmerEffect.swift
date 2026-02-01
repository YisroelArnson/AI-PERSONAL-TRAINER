//
//  ShimmerEffect.swift
//  AI Personal Trainer App
//
//  A reusable view modifier that applies a glossy left-to-right shimmer animation.
//  Used for skeleton loading placeholders.
//

import SwiftUI

/// A view modifier that applies a glossy shimmer animation
struct ShimmerEffect: ViewModifier {
    @State private var phase: CGFloat = -1

    let duration: Double
    let delay: Double

    init(duration: Double = 1.5, delay: Double = 0) {
        self.duration = duration
        self.delay = delay
    }

    func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geometry in
                    shimmerGradient
                        .frame(width: geometry.size.width * 0.6)
                        .offset(x: phase * geometry.size.width)
                }
                .mask(content)
            )
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(
                        .linear(duration: duration)
                        .repeatForever(autoreverses: false)
                    ) {
                        phase = 1.5
                    }
                }
            }
    }

    private var shimmerGradient: some View {
        LinearGradient(
            gradient: Gradient(stops: [
                .init(color: Color.white.opacity(0), location: 0.0),
                .init(color: Color.white.opacity(0.3), location: 0.35),
                .init(color: Color.white.opacity(0.5), location: 0.5),
                .init(color: Color.white.opacity(0.3), location: 0.65),
                .init(color: Color.white.opacity(0), location: 1.0)
            ]),
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}

// MARK: - View Extension

extension View {
    /// Applies a shimmer loading animation effect
    func shimmer(duration: Double = 1.5, delay: Double = 0) -> some View {
        modifier(ShimmerEffect(duration: duration, delay: delay))
    }
}

// MARK: - Preview

#Preview("Shimmer Effect") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(spacing: 16) {
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                .fill(AppTheme.Colors.surface)
                .frame(width: 300, height: 20)
                .shimmer()

            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                .fill(AppTheme.Colors.surface)
                .frame(width: 250, height: 20)
                .shimmer(delay: 0.1)

            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                .fill(AppTheme.Colors.surface)
                .frame(width: 150, height: 20)
                .shimmer(delay: 0.2)
        }
    }
}
