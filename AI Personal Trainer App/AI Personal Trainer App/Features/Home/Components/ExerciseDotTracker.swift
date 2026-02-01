//
//  ExerciseDotTracker.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/11/25.
//

import SwiftUI

struct ExerciseDotTracker: View {
    let totalExercises: Int
    let currentIndex: Int
    let exerciseIds: [UUID]
    let completedExerciseIds: Set<UUID>
    let maxVisibleDots: Int = 7
    
    private var shouldShowOverflow: Bool {
        totalExercises > maxVisibleDots
    }
    
    private var visibleRange: Range<Int> {
        if !shouldShowOverflow {
            return 0..<totalExercises
        }
        
        // Calculate which dots to show based on current position
        let halfVisible = maxVisibleDots / 2
        
        if currentIndex < halfVisible {
            // Near start
            return 0..<maxVisibleDots
        } else if currentIndex >= totalExercises - halfVisible {
            // Near end
            return (totalExercises - maxVisibleDots)..<totalExercises
        } else {
            // Middle
            return (currentIndex - halfVisible)..<(currentIndex + halfVisible)
        }
    }
    
    private var overflowCount: Int {
        totalExercises - maxVisibleDots
    }
    
    var body: some View {
        HStack(spacing: 10) {
            if shouldShowOverflow && currentIndex >= maxVisibleDots / 2 {
                // Show overflow indicator at start
                Text("+\(currentIndex < totalExercises - maxVisibleDots / 2 ? currentIndex - maxVisibleDots / 2 + 1 : overflowCount)")
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.tertiaryText)
            }
            
            ForEach(visibleRange, id: \.self) { index in
                Circle()
                    .fill(dotColor(for: index))
                    .frame(width: dotSize(for: index), height: dotSize(for: index))
                    .animation(.spring(response: 0.4, dampingFraction: 0.7), value: currentIndex)
            }
            
            if shouldShowOverflow && currentIndex < totalExercises - maxVisibleDots / 2 {
                // Show overflow indicator at end
                Text("+\(totalExercises - visibleRange.upperBound)")
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.tertiaryText)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.xl)
        .padding(.vertical, AppTheme.Spacing.md)
    }
    
    private func dotColor(for index: Int) -> Color {
        if isCompleted(for: index) {
            return AppTheme.Colors.primaryText
        } else if index == currentIndex {
            return AppTheme.Colors.primaryText
        } else {
            return AppTheme.Colors.tertiaryText.opacity(0.25)
        }
    }
    
    private func isCompleted(for index: Int) -> Bool {
        guard index >= 0 && index < exerciseIds.count else { return false }
        return completedExerciseIds.contains(exerciseIds[index])
    }
    
    private func dotSize(for index: Int) -> CGFloat {
        if index == currentIndex {
            return 10
        } else {
            return 6
        }
    }
}

#Preview {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        VStack(spacing: 30) {
            ExerciseDotTracker(
                totalExercises: 5,
                currentIndex: 2,
                exerciseIds: Array(repeating: UUID(), count: 5),
                completedExerciseIds: Set()
            )
            ExerciseDotTracker(
                totalExercises: 15,
                currentIndex: 2,
                exerciseIds: Array(repeating: UUID(), count: 15),
                completedExerciseIds: Set()
            )
            ExerciseDotTracker(
                totalExercises: 15,
                currentIndex: 7,
                exerciseIds: Array(repeating: UUID(), count: 15),
                completedExerciseIds: Set()
            )
            ExerciseDotTracker(
                totalExercises: 15,
                currentIndex: 13,
                exerciseIds: Array(repeating: UUID(), count: 15),
                completedExerciseIds: Set()
            )
        }
    }
}
