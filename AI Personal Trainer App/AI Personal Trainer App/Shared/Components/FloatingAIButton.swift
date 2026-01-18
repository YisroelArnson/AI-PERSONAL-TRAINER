//
//  FloatingAIButton.swift
//  AI Personal Trainer App
//
//  A floating AI assistant button that sits in the bottom-right corner.
//  Supports multiple states: idle, processing, and has pending messages.
//

import SwiftUI

/// State of the AI button
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
    @State private var pulseScale: CGFloat = 1.0
    @State private var rotationAngle: Double = 0
    
    private let buttonSize: CGFloat = 56
    private let innerSize: CGFloat = 50
    
    var body: some View {
        Button(action: action) {
            ZStack {
                // Pulsing ring for processing state
                if state == .processing {
                    pulsingRing
                }
                
                // Outer glow ring
                outerRing
                
                // Inner circle
                innerCircle
                
                // Icon
                buttonIcon
                
                // Pending badge
                if state == .hasPending && pendingCount > 0 {
                    pendingBadge
                }
            }
        }
        .onAppear {
            startAnimations()
        }
        .onChange(of: state) { _, newState in
            updateAnimations(for: newState)
        }
    }
    
    // MARK: - Subviews
    
    private var pulsingRing: some View {
        Circle()
            .stroke(AppTheme.Colors.warmAccent.opacity(0.3), lineWidth: 2)
            .frame(width: buttonSize + 20, height: buttonSize + 20)
            .scaleEffect(pulseScale)
            .opacity(2 - pulseScale)
    }
    
    private var outerRing: some View {
        Circle()
            .stroke(
                AngularGradient(
                    colors: ringColors,
                    center: .center,
                    startAngle: .degrees(rotationAngle),
                    endAngle: .degrees(rotationAngle + 360)
                ),
                lineWidth: 3
            )
            .frame(width: buttonSize, height: buttonSize)
            .shadow(
                color: shadowColor,
                radius: isBreathing ? 16 : 12,
                x: 0,
                y: 4
            )
            .scaleEffect(isBreathing ? 1.02 : 1.0)
    }
    
    private var innerCircle: some View {
        Circle()
            .fill(Color.white)
            .frame(width: innerSize, height: innerSize)
            .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: 4)
    }
    
    @ViewBuilder
    private var buttonIcon: some View {
        if state == .processing {
            // Animated waveform for processing
            Image(systemName: "waveform")
                .font(.system(size: 22, weight: .medium))
                .foregroundColor(AppTheme.Colors.warmAccent)
                .symbolEffect(.variableColor.iterative, options: .repeating)
        } else {
            Image(systemName: "waveform")
                .font(.system(size: 22, weight: .medium))
                .foregroundColor(AppTheme.Colors.warmAccent)
        }
    }
    
    private var pendingBadge: some View {
        ZStack {
            Circle()
                .fill(AppTheme.Colors.warmAccent)
                .frame(width: 22, height: 22)
            
            Text("\(min(pendingCount, 9))\(pendingCount > 9 ? "+" : "")")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .offset(x: buttonSize / 2 - 6, y: -buttonSize / 2 + 6)
        .transition(.scale.combined(with: .opacity))
    }
    
    // MARK: - Computed Properties
    
    private var ringColors: [Color] {
        switch state {
        case .idle:
            return [
                AppTheme.Colors.warmAccentLight,
                AppTheme.Colors.warmAccent,
                Color(hex: "F7C4D4"),
                AppTheme.Colors.warmAccentLight
            ]
        case .processing:
            return [
                AppTheme.Colors.warmAccent,
                AppTheme.Colors.warmAccentLight,
                AppTheme.Colors.warmAccent,
                Color(hex: "F7C4D4")
            ]
        case .hasPending:
            return [
                AppTheme.Colors.warmAccent,
                Color(hex: "F7C4D4"),
                AppTheme.Colors.warmAccent,
                AppTheme.Colors.warmAccentLight
            ]
        }
    }
    
    private var shadowColor: Color {
        switch state {
        case .processing:
            return AppTheme.Colors.warmAccent.opacity(0.5)
        default:
            return AppTheme.Shadow.orb
        }
    }
    
    // MARK: - Animation Helpers
    
    private func startAnimations() {
        // Breathing animation
        withAnimation(AppTheme.Animation.breathing) {
            isBreathing = true
        }
        
        updateAnimations(for: state)
    }
    
    private func updateAnimations(for newState: AIButtonState) {
        switch newState {
        case .processing:
            // Start pulse animation
            withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: false)) {
                pulseScale = 1.5
            }
            // Start rotation
            withAnimation(.linear(duration: 3.0).repeatForever(autoreverses: false)) {
                rotationAngle = 360
            }
            
        default:
            // Stop animations
            withAnimation(.easeOut(duration: 0.3)) {
                pulseScale = 1.0
                rotationAngle = 0
            }
        }
    }
}

// MARK: - Convenience initializer for backwards compatibility

extension FloatingAIButton {
    /// Simple initializer for basic usage (backwards compatible)
    init(action: @escaping () -> Void) {
        self.state = .idle
        self.pendingCount = 0
        self.action = action
    }
}

// MARK: - Previews

#Preview("Idle") {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        VStack {
            Spacer()
            HStack {
                Spacer()
                FloatingAIButton(state: .idle, pendingCount: 0) {
                    print("AI tapped")
                }
                .padding(.trailing, 20)
                .padding(.bottom, 30)
            }
        }
    }
}

#Preview("Processing") {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        VStack {
            Spacer()
            HStack {
                Spacer()
                FloatingAIButton(state: .processing, pendingCount: 0) {
                    print("AI tapped")
                }
                .padding(.trailing, 20)
                .padding(.bottom, 30)
            }
        }
    }
}

#Preview("Has Pending") {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        VStack {
            Spacer()
            HStack {
                Spacer()
                FloatingAIButton(state: .hasPending, pendingCount: 3) {
                    print("AI tapped")
                }
                .padding(.trailing, 20)
                .padding(.bottom, 30)
            }
        }
    }
}

#Preview("All States") {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        VStack(spacing: 40) {
            HStack(spacing: 30) {
                VStack {
                    FloatingAIButton(state: .idle, pendingCount: 0) {}
                    Text("Idle").font(.caption)
                }
                
                VStack {
                    FloatingAIButton(state: .processing, pendingCount: 0) {}
                    Text("Processing").font(.caption)
                }
                
                VStack {
                    FloatingAIButton(state: .hasPending, pendingCount: 2) {}
                    Text("Pending").font(.caption)
                }
            }
        }
    }
}

