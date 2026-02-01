//
//  AnimatedGradientBackground.swift
//  AI Personal Trainer App
//
//  Minimal flat background (no gradients per design schema).
//

import SwiftUI

struct AnimatedGradientBackground: View {
    var body: some View {
        AppTheme.Colors.background
            .ignoresSafeArea()
    }
}

#Preview {
    AnimatedGradientBackground()
}
