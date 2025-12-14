//
//  LoadingStateView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/9/25.
//

import SwiftUI

struct LoadingStateView: View {
    let state: AppLoadingState
    
    @State private var textOpacity: Double = 1
    @State private var textScale: CGFloat = 1
    @State private var orbScale: CGFloat = 1
    
    var body: some View {
        ZStack {
            // Animated gradient background
            AnimatedGradientBackground()
            
            // Content
            VStack(spacing: AppTheme.Spacing.xxxl) {
                // Glowing orb loader
                ZStack {
                    // Outer glow ring
                    Circle()
                        .stroke(
                            AngularGradient(
                                colors: [
                                    AppTheme.Colors.warmAccentLight,
                                    AppTheme.Colors.warmAccent,
                                    Color(hex: "F7C4D4"),
                                    AppTheme.Colors.warmAccentLight
                                ],
                                center: .center
                            ),
                            lineWidth: 3
                        )
                        .frame(width: 56, height: 56)
                        .shadow(
                            color: AppTheme.Shadow.orb,
                            radius: 16,
                            x: 0,
                            y: 0
                        )
                        .scaleEffect(orbScale)
                    
                    // Inner circle
                    Circle()
                        .fill(Color.white.opacity(0.9))
                        .frame(width: 48, height: 48)
                    
                    // Spinning indicator
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.warmAccent))
                        .scaleEffect(0.8)
                }
                .onAppear {
                    withAnimation(AppTheme.Animation.breathing) {
                        orbScale = 1.05
                    }
                }
                
                // Status message with gentle animation
                Text(state.message)
                    .font(.system(size: 16, weight: .medium, design: .rounded))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, AppTheme.Spacing.xxxxl)
                    .opacity(textOpacity)
                    .scaleEffect(textScale)
            }
        }
        .onChange(of: state) { oldState, newState in
            performFlickerTransition()
        }
    }
    
    private func performFlickerTransition() {
        // Quick flicker out - fade and scale down
        withAnimation(.easeOut(duration: 0.12)) {
            textOpacity = 0
            textScale = 0.95
        }
        
        // Flicker in - fade and scale back up
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            withAnimation(.easeIn(duration: 0.15)) {
                textOpacity = 1
                textScale = 1
            }
        }
    }
}

#Preview {
    LoadingStateView(state: .loadingUserData)
}
