//
//  WorkoutCompletionView.swift
//  AI Personal Trainer App
//

import SwiftUI

@MainActor
struct WorkoutCompletionView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var workoutStore = WorkoutStore.shared
    @State private var notes: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                aiSummarySection
                statCardsRow
                winsSection
                nextFocusSection
                notesInput
                doneButton
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .background(AppTheme.Colors.background)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .frame(width: 44, height: 44)
                }
            }
            ToolbarItem(placement: .principal) {
                Text("Workout Complete")
                    .font(AppTheme.Typography.screenTitle)
                    .foregroundStyle(AppTheme.Colors.primaryText)
            }
        }
    }

    // MARK: - AI Summary

    private var aiSummarySection: some View {
        let completed = workoutStore.totalCompletedExercises
        let total = workoutStore.totalExercises
        let minutes = workoutStore.elapsedMinutes

        return HStack(spacing: 0) {
            Text("Great session! You completed ")
                .font(AppTheme.Typography.aiMessageMedium)
                .foregroundStyle(AppTheme.Colors.primaryText)
            +
            Text("\(completed) of \(total)")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.primaryText)
            +
            Text(" exercises in ")
                .font(AppTheme.Typography.aiMessageMedium)
                .foregroundStyle(AppTheme.Colors.primaryText)
            +
            Text("\(minutes) min")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.primaryText)
            +
            Text(".")
                .font(AppTheme.Typography.aiMessageMedium)
                .foregroundStyle(AppTheme.Colors.primaryText)
        }
        .lineSpacing(4)
        .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Stat Cards

    private var statCardsRow: some View {
        HStack(spacing: 8) {
            statCard(
                value: "\(workoutStore.elapsedMinutes)",
                label: "DURATION"
            )
            statCard(
                value: "\(workoutStore.totalCompletedExercises)/\(workoutStore.totalExercises)",
                label: "EXERCISES"
            )
            statCard(
                value: "\(workoutStore.totalCompletedSets)",
                label: "SETS"
            )
        }
    }

    private func statCard(value: String, label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.primaryText)
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .textCase(.uppercase)
                .foregroundStyle(AppTheme.Colors.tertiaryText)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
    }

    // MARK: - Wins

    @ViewBuilder
    private var winsSection: some View {
        if let wins = workoutStore.summary?.wins, !wins.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("WINS")
                    .font(AppTheme.Typography.label)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.Colors.tertiaryText)

                VStack(alignment: .leading, spacing: 6) {
                    ForEach(wins, id: \.self) { win in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(AppTheme.Colors.secondaryText)
                                .frame(width: 16)
                            Text(win)
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(AppTheme.Colors.secondaryText)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Next Focus

    @ViewBuilder
    private var nextFocusSection: some View {
        if let nextFocus = workoutStore.summary?.nextSessionFocus, !nextFocus.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("NEXT SESSION")
                    .font(AppTheme.Typography.label)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.Colors.tertiaryText)

                Text(nextFocus)
                    .font(AppTheme.Typography.aiMessageMedium)
                    .foregroundStyle(AppTheme.Colors.primaryText)
            }
        }
    }

    // MARK: - Notes Input

    private var notesInput: some View {
        TextField("Add notes about this session...", text: $notes, axis: .vertical)
            .font(.system(size: 15))
            .lineLimit(3...6)
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .background(AppTheme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
    }

    // MARK: - Done Button

    private var doneButton: some View {
        Button {
            Task {
                await workoutStore.completeWorkout(notes: notes.isEmpty ? nil : notes)
                workoutStore.reset()
            }
        } label: {
            Text("Done")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .padding(.horizontal, 20)
                .background(AppTheme.Colors.accent)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.pill))
        }
    }
}

#Preview {
    NavigationStack {
        WorkoutCompletionView()
    }
}
