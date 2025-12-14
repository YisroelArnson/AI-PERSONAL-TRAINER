//
//  AnimatedGradientBackground.swift
//  AI Personal Trainer App
//
//  A subtle animated gradient background with slowly shifting warm colors.
//  Creates an organic, living feel similar to the Aurora weather app.
//

import SwiftUI

struct AnimatedGradientBackground: View {
    // Animation timing
    private let animationDuration: Double = 15.0 // Cycle duration
    
    // Warm colors with more visible presence
    private let blobColors: [(color: Color, opacity: Double)] = [
        (Color(hex: "FFDCC8"), 0.65),  // Soft peach
        (Color(hex: "F0D8C8"), 0.60),  // Warm sand
        (Color(hex: "FFD4C4"), 0.55),  // Light coral
        (Color(hex: "F5E0D0"), 0.60),  // Cream
        (Color(hex: "FFE4D8"), 0.55),  // Blush
    ]
    
    var body: some View {
        TimelineView(.animation(minimumInterval: 1/30)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            
            Canvas { context, size in
                // Base layer - pure white
                context.fill(
                    Path(CGRect(origin: .zero, size: size)),
                    with: .color(Color.white)
                )
                
                // Animated gradient blobs - smaller and more visible movement
                drawGradientBlob(
                    context: context,
                    size: size,
                    time: time,
                    index: 0,
                    basePosition: CGPoint(x: 0.2, y: -0.1),
                    movementRange: 0.22,
                    radius: 0.7,
                    color: blobColors[0].color,
                    opacity: blobColors[0].opacity
                )
                
                drawGradientBlob(
                    context: context,
                    size: size,
                    time: time,
                    index: 1,
                    basePosition: CGPoint(x: 1.0, y: 0.2),
                    movementRange: 0.20,
                    radius: 0.65,
                    color: blobColors[1].color,
                    opacity: blobColors[1].opacity
                )
                
                drawGradientBlob(
                    context: context,
                    size: size,
                    time: time,
                    index: 2,
                    basePosition: CGPoint(x: 0.5, y: 0.5),
                    movementRange: 0.25,
                    radius: 0.75,
                    color: blobColors[2].color,
                    opacity: blobColors[2].opacity
                )
                
                drawGradientBlob(
                    context: context,
                    size: size,
                    time: time,
                    index: 3,
                    basePosition: CGPoint(x: -0.1, y: 0.85),
                    movementRange: 0.21,
                    radius: 0.68,
                    color: blobColors[3].color,
                    opacity: blobColors[3].opacity
                )
                
                drawGradientBlob(
                    context: context,
                    size: size,
                    time: time,
                    index: 4,
                    basePosition: CGPoint(x: 0.9, y: 1.0),
                    movementRange: 0.23,
                    radius: 0.65,
                    color: blobColors[4].color,
                    opacity: blobColors[4].opacity
                )
            }
        }
        .ignoresSafeArea()
    }
    
    private func drawGradientBlob(
        context: GraphicsContext,
        size: CGSize,
        time: Double,
        index: Int,
        basePosition: CGPoint,
        movementRange: CGFloat,
        radius: CGFloat,
        color: Color,
        opacity: Double
    ) {
        // Create organic movement using sine/cosine with different phases
        let phaseOffset = Double(index) * .pi * 0.4
        let speedVariation = 1.0 + Double(index) * 0.15
        
        let angle = time / animationDuration * .pi * 2 * speedVariation + phaseOffset
        let xOffset = sin(angle) * movementRange
        let yOffset = cos(angle * 0.7 + .pi / 3) * movementRange
        
        let centerX = (basePosition.x + xOffset) * size.width
        let centerY = (basePosition.y + yOffset) * size.height
        let blobRadius = radius * min(size.width, size.height)
        
        // Sharper gradient with less blur for more visible blobs
        let gradient = Gradient(stops: [
            .init(color: color.opacity(opacity), location: 0),
            .init(color: color.opacity(opacity * 0.7), location: 0.3),
            .init(color: color.opacity(opacity * 0.4), location: 0.6),
            .init(color: color.opacity(opacity * 0.15), location: 0.85),
            .init(color: color.opacity(0), location: 1.0)
        ])
        
        let center = CGPoint(x: centerX, y: centerY)
        
        context.fill(
            Circle().path(in: CGRect(
                x: centerX - blobRadius,
                y: centerY - blobRadius,
                width: blobRadius * 2,
                height: blobRadius * 2
            )),
            with: .radialGradient(
                gradient,
                center: center,
                startRadius: 0,
                endRadius: blobRadius
            )
        )
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        AnimatedGradientBackground()
        
        VStack {
            Text("Animated Background")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(AppTheme.Colors.primaryText)
            
            Text("Watch the color shifts")
                .font(.system(size: 15, design: .rounded))
                .foregroundColor(AppTheme.Colors.secondaryText)
        }
    }
}
