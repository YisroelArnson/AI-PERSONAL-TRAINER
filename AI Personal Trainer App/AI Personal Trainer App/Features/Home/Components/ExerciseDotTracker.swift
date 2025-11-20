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
    let maxVisibleDots: Int = 10
    
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
        HStack(spacing: 8) {
            if shouldShowOverflow && currentIndex >= maxVisibleDots / 2 {
                // Show overflow indicator at start
                Text("+\(currentIndex < totalExercises - maxVisibleDots / 2 ? currentIndex - maxVisibleDots / 2 + 1 : overflowCount)")
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            
            ForEach(visibleRange, id: \.self) { index in
                Circle()
                    .fill(index == currentIndex ? Color.primary : Color.gray.opacity(0.3))
                    .frame(width: index == currentIndex ? 8 : 6, height: index == currentIndex ? 8 : 6)
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: currentIndex)
            }
            
            if shouldShowOverflow && currentIndex < totalExercises - maxVisibleDots / 2 {
                // Show overflow indicator at end
                Text("+\(totalExercises - visibleRange.upperBound)")
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }
}

#Preview {
    VStack(spacing: 20) {
        ExerciseDotTracker(totalExercises: 5, currentIndex: 2)
        ExerciseDotTracker(totalExercises: 15, currentIndex: 2)
        ExerciseDotTracker(totalExercises: 15, currentIndex: 7)
        ExerciseDotTracker(totalExercises: 15, currentIndex: 13)
    }
}

