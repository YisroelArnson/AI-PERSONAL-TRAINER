//
//  ResumePill.swift
//  AI Personal Trainer App
//
//  Pill showing in-progress workout with exercise progress.
//  Visually distinct from WorkoutPill to signal an active session.
//

import SwiftUI

struct ResumePill: View {
    let completedCount: Int
    let totalCount: Int
    let onTap: () -> Void

    private let pillHeight: CGFloat = 50

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Progress ring
                ZStack {
                    Circle()
                        .stroke(AppTheme.Colors.divider, lineWidth: 3)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(AppTheme.Colors.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 28, height: 28)

                // Text
                VStack(alignment: .leading, spacing: 1) {
                    Text("Resume")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .lineLimit(1)
                    Text("\(completedCount)/\(totalCount) exercises")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .lineLimit(1)
                }
                .fixedSize(horizontal: true, vertical: false)

                Spacer()

                // Play button
                Circle()
                    .fill(AppTheme.Colors.accent)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.Colors.background)
                            .offset(x: 1)
                    )
            }
            .padding(.leading, 12)
            .padding(.trailing, 9)
            .frame(height: pillHeight)
            .background(
                Capsule()
                    .fill(AppTheme.Colors.surface)
            )
        }
        .buttonStyle(.plain)
    }

    private var progress: CGFloat {
        guard totalCount > 0 else { return 0 }
        return CGFloat(completedCount) / CGFloat(totalCount)
    }
}
