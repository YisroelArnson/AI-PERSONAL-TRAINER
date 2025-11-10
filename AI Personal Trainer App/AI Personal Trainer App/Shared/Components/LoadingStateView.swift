//
//  LoadingStateView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/9/25.
//

import SwiftUI

struct LoadingStateView: View {
    let state: AppLoadingState
    
    @State private var rotationAngle: Double = 0
    @State private var textOpacity: Double = 1
    @State private var textScale: CGFloat = 1
    
    var body: some View {
        ZStack {
            // Background
            AppTheme.Colors.background
                .ignoresSafeArea()
            
            // Content
            VStack(spacing: 32) {
                // Simple rotating loading symbol
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.primaryText))
                    .scaleEffect(1.5)
                    .frame(height: 60)
                
                // Status message with flicker animation
                Text(state.message)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
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
    VStack(spacing: 20) {
        LoadingStateView(state: .loadingUserData)
    }
}

