//
//  EmergingAnimation.swift
//  AI Personal Trainer App
//
//  A reusable "emerging" animation modifier inspired by the Aurora weather app.
//  Elements fade in while scaling up and rising into position.
//

import SwiftUI

// MARK: - Emerging Animation Modifier

struct EmergingAnimation: ViewModifier {
    let isVisible: Bool
    let delay: Double
    
    // Animation parameters
    private let startScale: CGFloat = 0.92
    private let startOffset: CGFloat = 20
    private let enterDuration: Double = 0.4
    private let exitDuration: Double = 0.15  // Much faster exit
    
    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .scaleEffect(isVisible ? 1 : startScale)
            .offset(y: isVisible ? 0 : startOffset)
            .animation(
                isVisible
                    ? .easeOut(duration: enterDuration).delay(delay)
                    : .easeIn(duration: exitDuration),  // Fast exit, no delay
                value: isVisible
            )
    }
}

// MARK: - View Extension

extension View {
    /// Applies the "emerging" animation - fade in + scale up + rise up
    /// - Parameters:
    ///   - isVisible: Whether the content should be visible
    ///   - delay: Animation delay in seconds
    func emergingAnimation(isVisible: Bool, delay: Double = 0) -> some View {
        modifier(EmergingAnimation(isVisible: isVisible, delay: delay))
    }
    
    /// Applies a polished fade animation with subtle scale for header text
    /// Stays in place but has a refined, smooth, airy feel
    /// - Parameters:
    ///   - isVisible: Whether the content should be visible
    ///   - delay: Animation delay in seconds
    func fadeAnimation(isVisible: Bool, delay: Double = 0) -> some View {
        self
            .opacity(isVisible ? 1 : 0)
            .scaleEffect(isVisible ? 1 : 0.97)  // Very subtle scale
            .animation(
                isVisible
                    ? .spring(response: 0.7, dampingFraction: 0.85).delay(delay)  // Slow, airy spring
                    : .easeOut(duration: 0.08),  // Quick fade out
                value: isVisible
            )
    }
}

// MARK: - Preview

#Preview {
    struct PreviewWrapper: View {
        @State private var showContent = false
        
        var body: some View {
            ZStack {
                AnimatedGradientBackground()
                
                VStack(spacing: 20) {
                    Button("Toggle") {
                        showContent.toggle()
                    }
                    .padding()
                    
                    // Header - fade only
                    Text("Exercise Title")
                        .font(.title)
                        .fontWeight(.bold)
                        .fadeAnimation(isVisible: showContent)
                    
                    // Content cards - emerging animation
                    ForEach(0..<3, id: \.self) { index in
                        RoundedRectangle(cornerRadius: 12)
                            .fill(AppTheme.Colors.surface)
                            .frame(height: 60)
                            .padding(.horizontal, 20)
                            .emergingAnimation(
                                isVisible: showContent,
                                delay: Double(index) * 0.08
                            )
                    }
                }
            }
        }
    }
    
    return PreviewWrapper()
}
