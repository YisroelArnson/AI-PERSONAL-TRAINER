//
//  GlowingOrbButton.swift
//  AI Personal Trainer App
//
//  A glowing orb-style button inspired by the Aurora weather app design.
//  Used as the primary action button (complete exercise) on the home screen.
//

import SwiftUI

struct GlowingOrbButton: View {
    let isCompleted: Bool
    let isEnabled: Bool
    let action: () -> Void
    
    @State private var isBreathing = false
    @State private var isPressing = false
    
    private let orbSize: CGFloat = 64
    private let glowRingWidth: CGFloat = 3
    
    var body: some View {
        Button(action: action) {
            ZStack {
                // Outer glow ring
                Circle()
                    .stroke(
                        isCompleted ? 
                            LinearGradient(
                                colors: [AppTheme.Colors.success, AppTheme.Colors.success.opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ) :
                            LinearGradient(
                                colors: [
                                    AppTheme.Colors.warmAccentLight,
                                    AppTheme.Colors.warmAccent,
                                    Color(hex: "F7C4D4"),
                                    AppTheme.Colors.warmAccentLight
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                        lineWidth: glowRingWidth
                    )
                    .frame(width: orbSize, height: orbSize)
                    .shadow(
                        color: isCompleted ? AppTheme.Colors.success.opacity(0.3) : AppTheme.Shadow.orb,
                        radius: isBreathing ? 16 : 12,
                        x: 0,
                        y: 0
                    )
                    .scaleEffect(isBreathing ? 1.02 : 1.0)
                
                // Inner circle - frosted glass effect
                Circle()
                    .fill(
                        isCompleted ?
                            AppTheme.Colors.success :
                            Color.white.opacity(0.9)
                    )
                    .frame(width: orbSize - 8, height: orbSize - 8)
                    .overlay(
                        // Subtle inner shine
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.6),
                                        Color.white.opacity(0.0)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .center
                                )
                            )
                            .frame(width: orbSize - 16, height: orbSize - 16)
                            .offset(x: -4, y: -4)
                    )
                
                // Checkmark icon
                Image(systemName: "checkmark")
                    .font(.system(size: 24, weight: .medium, design: .rounded))
                    .foregroundColor(
                        isCompleted ? .white :
                        (isEnabled ? AppTheme.Colors.warmAccent : AppTheme.Colors.tertiaryText)
                    )
            }
            .scaleEffect(isPressing ? 0.95 : 1.0)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .onAppear {
            // Start breathing animation if not completed
            if !isCompleted {
                withAnimation(AppTheme.Animation.breathing) {
                    isBreathing = true
                }
            }
        }
        .onChange(of: isCompleted) { _, completed in
            if completed {
                // Stop breathing when completed
                withAnimation(.easeOut(duration: 0.2)) {
                    isBreathing = false
                }
            } else {
                // Restart breathing when uncompleted (undo)
                withAnimation(AppTheme.Animation.breathing) {
                    isBreathing = true
                }
            }
        }
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
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        isPressing = false
                    }
                }
        )
    }
}

// MARK: - Preview

#Preview("Default State") {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        VStack(spacing: 40) {
            GlowingOrbButton(
                isCompleted: false,
                isEnabled: true,
                action: { print("Tapped") }
            )
            
            GlowingOrbButton(
                isCompleted: false,
                isEnabled: false,
                action: { print("Tapped") }
            )
            
            GlowingOrbButton(
                isCompleted: true,
                isEnabled: true,
                action: { print("Tapped") }
            )
        }
    }
}

