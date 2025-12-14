//
//  FloatingAIButton.swift
//  AI Personal Trainer App
//
//  A floating AI assistant button that sits in the bottom-right corner.
//

import SwiftUI

struct FloatingAIButton: View {
    let action: () -> Void
    
    @State private var isBreathing = false
    
    var body: some View {
        Button(action: action) {
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
                        radius: isBreathing ? 16 : 12,
                        x: 0,
                        y: 4
                    )
                    .scaleEffect(isBreathing ? 1.02 : 1.0)
                
                // Inner circle
                Circle()
                    .fill(Color.white)
                    .frame(width: 50, height: 50)
                    .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: 4)
                
                // AI waveform icon
                Image(systemName: "waveform")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundColor(AppTheme.Colors.warmAccent)
            }
        }
        .onAppear {
            withAnimation(AppTheme.Animation.breathing) {
                isBreathing = true
            }
        }
    }
}

#Preview {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        VStack {
            Spacer()
            HStack {
                Spacer()
                FloatingAIButton {
                    print("AI tapped")
                }
                .padding(.trailing, 20)
                .padding(.bottom, 30)
            }
        }
    }
}

