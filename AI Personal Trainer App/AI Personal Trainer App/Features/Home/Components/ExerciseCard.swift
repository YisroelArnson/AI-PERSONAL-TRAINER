//
//  ExerciseCard.swift
//  AI Personal Trainer App
//
//  A frosted glass card component for displaying exercise information.
//  Inspired by the Aurora weather app design with soft shadows and blur effects.
//

import SwiftUI

struct ExerciseCard<Content: View>: View {
    let content: Content
    
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    
    var body: some View {
        content
            .padding(AppTheme.Spacing.xxl)
            .background(
                ZStack {
                    // Frosted glass background
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.xlarge)
                        .fill(AppTheme.Colors.cardBackground)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.xlarge)
                                .fill(.ultraThinMaterial)
                        )
                    
                    // Subtle top-left shine
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.xlarge)
                        .fill(AppTheme.Gradients.cardShine)
                        .opacity(0.5)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.xlarge))
            .shadow(
                color: AppTheme.Shadow.card,
                radius: AppTheme.Shadow.cardRadius,
                x: AppTheme.Shadow.cardOffset.width,
                y: AppTheme.Shadow.cardOffset.height
            )
    }
}

// MARK: - Exercise Header (equipment, title, description)

struct ExerciseHeaderView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            // Equipment tags (tiny, faded)
            if let equipment = exercise.equipment, !equipment.isEmpty {
                Text(equipment.joined(separator: " · "))
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .textCase(.lowercase)
                    .fadeAnimation(isVisible: showContent)
            }
            
            // Exercise name
            Text(exercise.exercise_name)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(AppTheme.Colors.primaryText)
                .minimumScaleFactor(0.7)
                .lineLimit(2)
                .fadeAnimation(isVisible: showContent, delay: 0.05)
            
            // Expandable description
            if let description = exercise.exercise_description, !description.isEmpty {
                ExpandableDescriptionView(text: description, showContent: showContent)
                    .padding(.top, AppTheme.Spacing.xs)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.xl)
    }
}

// MARK: - Exercise Content (sets, metrics, etc.)

struct ExerciseContentView: View {
    let exercise: UIExercise
    let showContent: Bool
    
    // For strength exercises
    var completedSetIndices: Binding<Set<Int>>?
    var adjustedReps: Binding<[Int]>?
    var adjustedWeights: Binding<[Int]>?
    var onInitializeState: (() -> Void)?
    
    var body: some View {
        if hasExerciseContent {
            // Exercises with floating cards (strength, bodyweight, isometric)
            // These have their own per-item animations
            if usesFloatingCards {
                exerciseContent
                    .padding(.horizontal, AppTheme.Spacing.xl)
            } else {
                // Other exercise types use frosted card with emerging animation
                ExerciseCard {
                    exerciseContent
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .emergingAnimation(isVisible: showContent, delay: 0.15)
            }
        }
    }
    
    // Check if we have content to show
    private var hasExerciseContent: Bool {
        switch exercise.type {
        case "strength":
            return completedSetIndices != nil && adjustedReps != nil && adjustedWeights != nil
        case "bodyweight":
            return completedSetIndices != nil && adjustedReps != nil
        case "cardio_time", "cardio_distance", "hiit", "circuit", "flexibility", "yoga", "isometric", "sport_specific":
            return true
        default:
            return false
        }
    }
    
    // Exercises that use individual floating cards instead of a frosted wrapper
    private var usesFloatingCards: Bool {
        switch exercise.type {
        case "strength", "bodyweight", "isometric":
            return true
        default:
            return false
        }
    }
    
    @ViewBuilder
    private var exerciseContent: some View {
        switch exercise.type {
        case "strength":
            if let completedSets = completedSetIndices,
               let reps = adjustedReps,
               let weights = adjustedWeights {
                StrengthExerciseView(
                    exercise: exercise,
                    showContent: showContent,
                    completedSetIndices: completedSets,
                    adjustedReps: reps,
                    adjustedWeights: weights
                )
                .onAppear {
                    onInitializeState?()
                }
            }
        case "cardio_time":
            CardioTimeExerciseView(exercise: exercise, showContent: showContent)
        case "cardio_distance":
            CardioDistanceExerciseView(exercise: exercise, showContent: showContent)
        case "hiit":
            HiitExerciseView(exercise: exercise, showContent: showContent)
        case "circuit":
            CircuitExerciseView(exercise: exercise, showContent: showContent)
        case "flexibility":
            FlexibilityExerciseView(exercise: exercise, showContent: showContent)
        case "yoga":
            YogaExerciseView(exercise: exercise, showContent: showContent)
        case "bodyweight":
            if let completedSets = completedSetIndices,
               let reps = adjustedReps {
                BodyweightExerciseView(
                    exercise: exercise,
                    showContent: showContent,
                    completedSetIndices: completedSets,
                    adjustedReps: reps
                )
                .onAppear {
                    onInitializeState?()
                }
            }
        case "isometric":
            IsometricExerciseView(exercise: exercise, showContent: showContent)
        case "sport_specific":
            SportSpecificExerciseView(exercise: exercise, showContent: showContent)
        default:
            EmptyView()
        }
    }
}

// MARK: - Legacy Exercise Display Card (combines header + content)

struct ExerciseDisplayCard: View {
    let exercise: UIExercise
    let showContent: Bool
    
    // For strength exercises
    var completedSetIndices: Binding<Set<Int>>?
    var adjustedReps: Binding<[Int]>?
    var adjustedWeights: Binding<[Int]>?
    var onInitializeState: (() -> Void)?
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
            ExerciseHeaderView(exercise: exercise, showContent: showContent)
            
            ExerciseContentView(
                exercise: exercise,
                showContent: showContent,
                completedSetIndices: completedSetIndices,
                adjustedReps: adjustedReps,
                adjustedWeights: adjustedWeights,
                onInitializeState: onInitializeState
            )
        }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        ScrollView {
            VStack(spacing: 20) {
                ExerciseDisplayCard(
                    exercise: UIExercise(
                        exercise_name: "Barbell Bench Press",
                        type: "strength",
                        reps: [10, 8, 8, 6],
                        load_kg_each: [60, 70, 70, 80],
                        sets: 4,
                        rest_seconds: 90,
                        equipment: ["barbell", "bench"],
                        exercise_description: "Lie on a flat bench and press the barbell up from your chest, keeping your feet flat on the floor."
                    ),
                    showContent: true,
                    completedSetIndices: .constant([]),
                    adjustedReps: .constant([10, 8, 8, 6]),
                    adjustedWeights: .constant([60, 70, 70, 80])
                )
            }
            .padding(.top, 40)
        }
    }
}
