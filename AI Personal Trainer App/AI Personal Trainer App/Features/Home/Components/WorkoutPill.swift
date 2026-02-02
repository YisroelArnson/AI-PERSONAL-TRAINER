//
//  WorkoutPill.swift
//  AI Personal Trainer App
//
//  Pill-shaped button showing current workout with scrolling text and play button.
//  The pill displays the workout name and duration with horizontal scrolling if text overflows.
//

import SwiftUI

struct WorkoutPill: View {
    let workoutName: String
    let duration: Int // in minutes
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

    private var displayText: String {
        "\(workoutName) (\(duration) min)"
    }

    private var shouldScroll: Bool {
        textWidth > containerWidth
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 11) {
                // Scrolling text container
                GeometryReader { geometry in
                    Text(displayText)
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

// MARK: - Alternative: Non-scrolling version for short text

struct WorkoutPillStatic: View {
    let workoutName: String
    let duration: Int
    let onTap: () -> Void

    private let playButtonSize: CGFloat = 32

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 11) {
                Text("\(workoutName) (\(duration) min)")
                    .font(AppTheme.Typography.pillText)
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .lineLimit(1)

                Circle()
                    .fill(AppTheme.Colors.accent)
                    .frame(width: playButtonSize, height: playButtonSize)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.Colors.background)
                            .offset(x: 1)
                    )
            }
            .padding(.leading, 16)
            .padding(.trailing, 10)
            .padding(.vertical, 10)
            .background(
                Capsule()
                    .fill(AppTheme.Colors.surface)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Empty State Variant (still looks like a button, not text input)

struct WorkoutPillEmpty: View {
    let message: String
    let onTap: () -> Void

    private let playButtonSize: CGFloat = 32
    private let pillHeight: CGFloat = 50 // Match AI orb height

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 11) {
                Text(message)
                    .font(AppTheme.Typography.pillText)
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .lineLimit(1)

                // Play button - same style as active pill
                Circle()
                    .fill(AppTheme.Colors.accent)
                    .frame(width: playButtonSize, height: playButtonSize)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.Colors.background)
                            .offset(x: 1)
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
}

// MARK: - Previews

#Preview("Workout Pill") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(spacing: 20) {
            // Short text (no scroll)
            WorkoutPill(
                workoutName: "Upper Body",
                duration: 45,
                onTap: {}
            )
            .frame(width: 250)

            // Long text (should scroll)
            WorkoutPill(
                workoutName: "Upper Body Strength with Dumbbells",
                duration: 45,
                onTap: {}
            )
            .frame(width: 200)

            // Empty state
            WorkoutPillEmpty(
                message: "No workout today",
                onTap: {}
            )
        }
        .padding()
    }
}
