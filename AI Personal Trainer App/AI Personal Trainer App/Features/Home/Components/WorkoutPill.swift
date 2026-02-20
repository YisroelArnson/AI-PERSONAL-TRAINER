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

    @State private var textWidth: CGFloat = 0
    @State private var containerWidth: CGFloat = 0
    @State private var scrollOffset: CGFloat = 0
    @State private var scrollTask: Task<Void, Never>?

    private let scrollSpeed: CGFloat = 20 // points per second
    private let pauseDuration: TimeInterval = 0.9
    private let playButtonSize: CGFloat = 32
    private let pillHeight: CGFloat = 50

    private var shouldScroll: Bool {
        textOverflow > 6
    }

    private var textOverflow: CGFloat {
        max(0, textWidth - containerWidth)
    }

    private var maxScrollDistance: CGFloat {
        textOverflow + 12
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 11) {
                // Scrolling title
                GeometryReader { geometry in
                    Text(title)
                        .font(AppTheme.Typography.pillText)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .frame(maxHeight: .infinity)
                        .offset(x: shouldScroll ? scrollOffset : 0)
                        .background(
                            GeometryReader { textGeometry in
                                Color.clear
                                    .onAppear {
                                        textWidth = textGeometry.size.width
                                        restartScrollIfNeeded()
                                    }
                                    .onChange(of: textGeometry.size.width) { _, newWidth in
                                        textWidth = newWidth
                                        restartScrollIfNeeded()
                                    }
                            }
                        )
                        .onAppear {
                            containerWidth = geometry.size.width
                            restartScrollIfNeeded()
                        }
                        .onChange(of: geometry.size.width) { _, newWidth in
                            containerWidth = newWidth
                            restartScrollIfNeeded()
                        }
                }
                .mask {
                    if shouldScroll {
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0),
                                .init(color: .black, location: 0.07),
                                .init(color: .black, location: 0.93),
                                .init(color: .clear, location: 1)
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    } else {
                        Color.black
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
        .onChange(of: title) { _, _ in
            restartScrollIfNeeded()
        }
        .onDisappear {
            scrollTask?.cancel()
            scrollTask = nil
        }
    }

    private func restartScrollIfNeeded() {
        scrollTask?.cancel()
        scrollTask = nil
        scrollOffset = 0

        guard shouldScroll else { return }

        let distance = maxScrollDistance
        let duration = max(0.8, Double(distance / scrollSpeed))

        scrollTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(pauseDuration * 1_000_000_000))

            while !Task.isCancelled && shouldScroll {
                withAnimation(.easeInOut(duration: duration)) {
                    scrollOffset = -distance
                }
                try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
                if Task.isCancelled { break }

                try? await Task.sleep(nanoseconds: UInt64(pauseDuration * 1_000_000_000))
                if Task.isCancelled { break }

                withAnimation(.easeInOut(duration: duration)) {
                    scrollOffset = 0
                }
                try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
                if Task.isCancelled { break }

                try? await Task.sleep(nanoseconds: UInt64(pauseDuration * 1_000_000_000))
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
