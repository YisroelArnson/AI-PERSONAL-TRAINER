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

    private let buttonSize: CGFloat = 50

    var body: some View {
        Button(action: action) {
            ZStack {
                orb

                if state == .hasPending && pendingCount > 0 {
                    pendingBadge
                }
            }
        }
        .buttonStyle(.plain)
    }

    // Sky blue/cloud colors (matching AIOrb from intake)
    private let skyBlueLight = Color(red: 0.7, green: 0.85, blue: 0.95)
    private let skyBlueMid = Color(red: 0.4, green: 0.7, blue: 0.9)
    private let skyBlueDeep = Color(red: 0.2, green: 0.5, blue: 0.85)
    private let cloudWhite = Color(red: 0.95, green: 0.97, blue: 1.0)

    private var orb: some View {
        // Sky blue/cloud orb matching intake AIOrb styling
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
                        endRadius: buttonSize * 0.4
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
                        endRadius: buttonSize * 0.35
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
                        endRadius: buttonSize * 0.45
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
                .frame(width: buttonSize - 1, height: buttonSize - 1)
        }
        .frame(width: buttonSize, height: buttonSize)
        .clipShape(Circle())
        .shadow(color: skyBlueDeep.opacity(0.3), radius: AppTheme.Shadow.orbRadius, x: 0, y: 3)
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
        AppTheme.Colors.background
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
