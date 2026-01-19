//
//  ExerciseDetailSheet.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/19/25.
//

import SwiftUI

struct ExerciseDetailSheet: View {
    let exercise: any ExerciseDisplayable
    @Environment(\.dismiss) private var dismiss
    @StateObject private var userSettings = UserSettings.shared
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Exercise Name and Type
                    VStack(alignment: .leading, spacing: 8) {
                        Text(exercise.exercise_name)
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        
                        HStack(spacing: 8) {
                            Text(exercise.exercise_type.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundColor(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(exercise.typeColor)
                                .cornerRadius(AppTheme.CornerRadius.small)
                            
                            // Only show date for completed exercises
                            if let formattedDate = exercise.displayFormattedDate {
                                Text(formattedDate)
                                    .font(.caption)
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    
                    Divider()
                        .padding(.horizontal, 20)
                    
                    // Primary Metrics Section
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Workout Details")
                            .font(.headline)
                            .foregroundColor(AppTheme.Colors.primaryText)
                        
                        metricsView
                    }
                    .padding(.horizontal, 20)
                    
                    // Muscles Utilized Section
                    if !exercise.displayMusclesUtilized.isEmpty {
                        Divider()
                            .padding(.horizontal, 20)
                        
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Muscles Utilized")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            let sortedMuscles = exercise.displayMusclesUtilized.sorted(by: { $0.share > $1.share })
                            let colors: [Color] = [
                                Color.blue,
                                Color.orange,
                                Color.green,
                                Color.purple,
                                Color.pink,
                                Color.cyan,
                                Color.yellow,
                                Color.indigo,
                                Color.mint,
                                Color.teal
                            ]
                            
                            ZStack {
                                // Chart
                                ForEach(Array(sortedMuscles.enumerated()), id: \.element.muscle) { index, muscle in
                                    let start = sortedMuscles[0..<index].reduce(0) { $0 + $1.share }
                                    let end = start + muscle.share
                                    let color = colors[index % colors.count]
                                    
                                    Circle()
                                        .trim(from: start, to: end)
                                        .stroke(color, style: StrokeStyle(lineWidth: 24, lineCap: .butt))
                                        .rotationEffect(.degrees(-90))
                                        .frame(width: 180, height: 180)
                                }
                                
                                // Labels
                                ForEach(Array(sortedMuscles.enumerated()), id: \.element.muscle) { index, muscle in
                                    let start = sortedMuscles[0..<index].reduce(0) { $0 + $1.share }
                                    let mid = start + (muscle.share / 2)
                                    let angle = mid * 2 * .pi
                                    let labelRadius: CGFloat = 130
                                    let x = labelRadius * CGFloat(sin(angle))
                                    let y = -labelRadius * CGFloat(cos(angle))
                                    
                                    VStack(spacing: 0) {
                                        Text(muscle.muscle.capitalized)
                                            .font(.caption2)
                                            .fontWeight(.medium)
                                            .foregroundColor(AppTheme.Colors.primaryText)
                                            .multilineTextAlignment(.center)
                                        
                                        Text("\(Int(muscle.share * 100))%")
                                            .font(.caption2)
                                            .foregroundColor(AppTheme.Colors.secondaryText)
                                    }
                                    .offset(x: x, y: y)
                                }
                            }
                            .frame(height: 310)
                            .frame(maxWidth: .infinity)
                        }
                        .padding(.horizontal, 20)
                    }
                    
                    // Goals Addressed Section
                    if let goals = exercise.goals_addressed, !goals.isEmpty {
                        Divider()
                            .padding(.horizontal, 20)
                        
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Goals Addressed")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            ForEach(goals.sorted(by: { $0.share > $1.share }), id: \.goal) { goal in
                                HStack {
                                    Text(goal.goal.capitalized)
                                        .font(.subheadline)
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                    
                                    Spacer()
                                    
                                    Text("\(Int(goal.share * 100))%")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    
                    // Equipment Section
                    if let equipment = exercise.equipment, !equipment.isEmpty {
                        Divider()
                            .padding(.horizontal, 20)
                        
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Equipment")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            FlowLayout(spacing: 8) {
                                ForEach(equipment, id: \.self) { item in
                                    Text(item.capitalized)
                                        .font(.caption)
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(AppTheme.Colors.background)
                                        .cornerRadius(AppTheme.CornerRadius.small)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    
                    // Reasoning Section
                    if let reasoning = exercise.reasoning, !reasoning.isEmpty {
                        Divider()
                            .padding(.horizontal, 20)
                        
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Reasoning")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            Text(reasoning)
                                .font(.subheadline)
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 20)
                    }
                    
                    // Exercise Description Section
                    if let description = exercise.exercise_description, !description.isEmpty {
                        Divider()
                            .padding(.horizontal, 20)
                        
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Exercise Description")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            Text(description)
                                .font(.subheadline)
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 20)
                    }
                    
                    // User Feedback Section (only for completed exercises)
                    if exercise.displayRpe != nil || exercise.displayNotes != nil {
                        Divider()
                            .padding(.horizontal, 20)
                        
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Your Feedback")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            if let rpe = exercise.displayRpe {
                                HStack {
                                    Text("RPE (Rate of Perceived Exertion)")
                                        .font(.subheadline)
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                    
                                    Spacer()
                                    
                                    Text("\(rpe)/10")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                }
                            }
                            
                            if let notes = exercise.displayNotes, !notes.isEmpty {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Notes")
                                        .font(.subheadline)
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                    
                                    Text(notes)
                                        .font(.subheadline)
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }
                .padding(.bottom, 40)
            }
            .background(AppTheme.Colors.background)
            .navigationTitle("Exercise Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
        }
    }
    
    // MARK: - Metrics View Builder
    // Uses the 4-type exercise system: reps, hold, duration, intervals

    @ViewBuilder
    private var metricsView: some View {
        switch exercise.exercise_type {
        case "reps":
            repsMetrics
        case "hold":
            holdMetrics
        case "duration":
            durationMetrics
        case "intervals":
            intervalsMetrics
        default:
            defaultMetrics
        }
    }

    private var repsMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let sets = exercise.sets {
                metricRow(label: "Sets", value: "\(sets)")
            }

            if let reps = exercise.reps, !reps.isEmpty {
                metricRow(label: "Reps", value: reps.map { String($0) }.joined(separator: ", "))
            }

            if let weights = exercise.load_kg_each, !weights.isEmpty {
                let weightLabel = "Weight (\(userSettings.weightUnitLabel))"
                let weightValues = weights.map { weight in
                    weight.truncatingRemainder(dividingBy: 1) == 0
                        ? String(format: "%.0f", weight)
                        : String(format: "%.1f", weight)
                }.joined(separator: ", ")
                metricRow(label: weightLabel, value: weightValues)
            }

            if let rest = exercise.rest_seconds {
                metricRow(label: "Rest", value: "\(rest)s between sets")
            }
        }
    }

    private var holdMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let sets = exercise.sets {
                metricRow(label: "Sets", value: "\(sets)")
            }

            if let holds = exercise.hold_duration_sec, !holds.isEmpty {
                metricRow(label: "Hold Duration", value: holds.map { "\($0)s" }.joined(separator: ", "))
            }

            if let rest = exercise.rest_seconds {
                metricRow(label: "Rest", value: "\(rest)s between sets")
            }
        }
    }

    private var durationMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let distance = exercise.distance_km {
                let formattedDistance = distance.truncatingRemainder(dividingBy: 1) == 0
                    ? String(format: "%.0f", distance)
                    : String(format: "%.2f", distance)
                metricRow(label: "Distance", value: "\(formattedDistance) \(userSettings.distanceUnitLabel)")
            }

            if let duration = exercise.duration_min {
                metricRow(label: "Duration", value: "\(duration) min")
            }

            if let pace = exercise.target_pace {
                metricRow(label: "Target Pace", value: pace)
            }
        }
    }

    private var intervalsMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let rounds = exercise.rounds {
                metricRow(label: "Rounds", value: "\(rounds)")
            }

            if let duration = exercise.total_duration_min ?? exercise.duration_min {
                metricRow(label: "Total Duration", value: "\(duration) min")
            }

            if let rest = exercise.rest_seconds {
                metricRow(label: "Rest", value: "\(rest)s between rounds")
            }
        }
    }

    private var defaultMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let duration = exercise.duration_min {
                metricRow(label: "Duration", value: "\(duration) min")
            }
        }
    }
    
    private func metricRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(AppTheme.Colors.secondaryText)
            
            Spacer()
            
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(AppTheme.Colors.primaryText)
        }
    }
}

// MARK: - Flow Layout Helper
/// A custom layout that flows items horizontally and wraps to next line
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrangeSubviews(proposal: proposal, subviews: subviews)
        let height = rows.reduce(0) { $0 + $1.height } + CGFloat(max(0, rows.count - 1)) * spacing
        return CGSize(width: proposal.width ?? 0, height: height)
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrangeSubviews(proposal: proposal, subviews: subviews)
        var y = bounds.minY
        
        for row in rows {
            var x = bounds.minX
            
            for item in row.items {
                let itemSize = item.subview.sizeThatFits(.unspecified)
                item.subview.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
                x += itemSize.width + spacing
            }
            
            y += row.height + spacing
        }
    }
    
    private func arrangeSubviews(proposal: ProposedViewSize, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var currentRow: Row = Row(items: [], height: 0)
        var x: CGFloat = 0
        let maxWidth = proposal.width ?? .infinity
        
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            
            if x + size.width > maxWidth && !currentRow.items.isEmpty {
                rows.append(currentRow)
                currentRow = Row(items: [], height: 0)
                x = 0
            }
            
            currentRow.items.append(RowItem(subview: subview))
            currentRow.height = max(currentRow.height, size.height)
            x += size.width + spacing
        }
        
        if !currentRow.items.isEmpty {
            rows.append(currentRow)
        }
        
        return rows
    }
    
    struct Row {
        var items: [RowItem]
        var height: CGFloat
    }
    
    struct RowItem {
        var subview: LayoutSubview
    }
}

#Preview {
    PreviewWrapper()
}

struct PreviewWrapper: View {
    @State private var workoutItems: [WorkoutHistoryItem] = []
    @State private var isLoading = true
    
    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading from database...")
            } else if let firstItem = workoutItems.first {
                ExerciseDetailSheet(exercise: firstItem)
            } else {
                Text("No workout history found")
                    .foregroundColor(.gray)
            }
        }
        .task {
            await loadPreviewData()
        }
    }
    
    private func loadPreviewData() async {
        let apiService = APIService()
        do {
            let history = try await apiService.fetchWorkoutHistory(limit: 1)
            await MainActor.run {
                workoutItems = history
                isLoading = false
            }
        } catch {
            print("Preview error: \(error)")
            await MainActor.run {
                isLoading = false
            }
        }
    }
}

