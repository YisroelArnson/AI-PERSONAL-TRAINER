//
//  WorkoutPill.swift
//  AI Personal Trainer App
//
//  Pill-shaped button showing current workout with scrolling text and play button.
//  The pill displays the workout title with horizontal scrolling if text overflows.
//

import SwiftUI

struct WorkoutPill: View {
    let title: String
    let onTap: () -> Void

    // Animation state for scrolling text
    @State private var textWidth: CGFloat = 0
    @State private var containerWidth: CGFloat = 0
    @State private var scrollOffset: CGFloat = 0
    @State private var isScrollingForward: Bool = true

    // Scrolling configuration
    private let scrollSpeed: CGFloat = 0.4 // px per frame
    private let pauseDuration: TimeInterval = 1.0 // seconds to pause at each end
    private let playButtonSize: CGFloat = 32
    private let pillHeight: CGFloat = 50 // Match AI orb height

    private var shouldScroll: Bool {
        textWidth > containerWidth
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 11) {
                // Scrolling text container
                GeometryReader { geometry in
                    Text(title)
                        .font(AppTheme.Typography.pillText)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .fixedSize(horizontal: true, vertical: false)
                        .frame(maxHeight: .infinity)
                        .offset(x: shouldScroll ? scrollOffset : 0)
                        .background(
                            GeometryReader { textGeometry in
                                Color.clear.onAppear {
                                    textWidth = textGeometry.size.width
                                }
                            }
                        )
                        .onAppear {
                            containerWidth = geometry.size.width
                            if shouldScroll {
                                startScrollAnimation()
                            }
                        }
                        .onChange(of: geometry.size.width) { _, newWidth in
                            containerWidth = newWidth
                            if shouldScroll {
                                startScrollAnimation()
                            }
                        }
                }
                .frame(height: 20)
                .clipped()

                // Play button
                Circle()
                    .fill(AppTheme.Colors.accent)
                    .frame(width: playButtonSize, height: playButtonSize)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.Colors.background)
                            .offset(x: 1) // Visual centering for play icon
                    )
            }
            .padding(.leading, 16)
            .padding(.trailing, 9)
            .frame(height: pillHeight)
            .background(
                Capsule()
                    .fill(AppTheme.Colors.surface)
            )
        }
        .buttonStyle(.plain)
    }

    private func startScrollAnimation() {
        // Start the scroll timer
        Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { timer in
            guard shouldScroll else {
                timer.invalidate()
                return
            }

            let maxOffset = -(textWidth - containerWidth + 8) // Extra padding

            if isScrollingForward {
                // Scrolling left (text moves left, revealing more)
                scrollOffset -= scrollSpeed

                if scrollOffset <= maxOffset {
                    // Reached end, pause then reverse direction
                    scrollOffset = maxOffset
                    timer.invalidate()

                    DispatchQueue.main.asyncAfter(deadline: .now() + pauseDuration) {
                        isScrollingForward = false
                        startScrollAnimation()
                    }
                }
            } else {
                // Scrolling right (text moves right, returning)
                scrollOffset += scrollSpeed

                if scrollOffset >= 0 {
                    // Reached start, pause then forward direction
                    scrollOffset = 0
                    timer.invalidate()

                    DispatchQueue.main.asyncAfter(deadline: .now() + pauseDuration) {
                        isScrollingForward = true
                        startScrollAnimation()
                    }
                }
            }
        }
    }
}

// MARK: - Previews

#Preview("Workout Pill") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(spacing: 20) {
            // Short text (no scroll)
            WorkoutPill(
                title: "Upper Body Push",
                onTap: {}
            )
            .frame(width: 250)

            // Long text (should scroll)
            WorkoutPill(
                title: "Upper Body Strength with Dumbbells",
                onTap: {}
            )
            .frame(width: 200)

            // Default
            WorkoutPill(
                title: "Start Workout",
                onTap: {}
            )
        }
        .padding()
    }
}
