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

    // Sky blue/cloud colors (matching AIOrb from intake)
    private let skyBlueLight = Color(red: 0.7, green: 0.85, blue: 0.95)
    private let skyBlueMid = Color(red: 0.4, green: 0.7, blue: 0.9)
    private let skyBlueDeep = Color(red: 0.2, green: 0.5, blue: 0.85)
    private let cloudWhite = Color(red: 0.95, green: 0.97, blue: 1.0)

    var body: some View {
        Button(action: action) {
            ZStack {
                if isEnabled {
                    multiLayerOrb
                } else {
                    Circle()
                        .fill(AppTheme.Colors.surface)
                        .frame(width: size, height: size)
                }

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

    /// Sky blue/cloud orb matching intake AIOrb styling
    private var multiLayerOrb: some View {
        ZStack {
            // Base gradient - sky blue bottom to light top
            Circle()
                .fill(
                    LinearGradient(
                        gradient: Gradient(stops: [
                            .init(color: cloudWhite.opacity(0.95), location: 0),
                            .init(color: skyBlueLight, location: 0.3),
                            .init(color: skyBlueMid, location: 0.6),
                            .init(color: skyBlueDeep, location: 1.0)
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )

            // Cloud layer 1 - top left wisp
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            cloudWhite.opacity(0.9),
                            cloudWhite.opacity(0.4),
                            Color.clear
                        ]),
                        center: UnitPoint(x: 0.25, y: 0.2),
                        startRadius: 0,
                        endRadius: size * 0.4
                    )
                )

            // Cloud layer 2 - top right highlight
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            cloudWhite.opacity(0.7),
                            cloudWhite.opacity(0.2),
                            Color.clear
                        ]),
                        center: UnitPoint(x: 0.7, y: 0.25),
                        startRadius: 0,
                        endRadius: size * 0.35
                    )
                )

            // Cloud layer 3 - middle soft cloud
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            cloudWhite.opacity(0.5),
                            skyBlueLight.opacity(0.3),
                            Color.clear
                        ]),
                        center: UnitPoint(x: 0.5, y: 0.4),
                        startRadius: 0,
                        endRadius: size * 0.45
                    )
                )

            // Subtle inner stroke for depth
            Circle()
                .stroke(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(0.3),
                            Color.clear,
                            skyBlueDeep.opacity(0.2)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 1
                )
                .frame(width: size - 1, height: size - 1)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .shadow(color: skyBlueDeep.opacity(0.3), radius: AppTheme.Shadow.orbRadius, x: 0, y: 3)
    }
}

#Preview("Default") {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        GlowingOrbButton(isCompleted: false, isEnabled: true) {}
    }
}
