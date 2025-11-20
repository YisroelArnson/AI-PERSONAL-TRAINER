//
//  ExerciseDetailSheet.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/19/25.
//

import SwiftUI

struct ExerciseDetailSheet: View {
    let workoutItem: WorkoutHistoryItem
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Exercise Name and Type
                    VStack(alignment: .leading, spacing: 8) {
                        Text(workoutItem.exercise_name)
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        
                        HStack(spacing: 8) {
                            Text(workoutItem.exercise_type.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundColor(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(workoutItem.typeColor)
                                .cornerRadius(AppTheme.CornerRadius.small)
                            
                            Text(workoutItem.formattedDate)
                                .font(.caption)
                                .foregroundColor(AppTheme.Colors.secondaryText)
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
                    if !workoutItem.muscles_utilized.isEmpty {
                        Divider()
                            .padding(.horizontal, 20)
                        
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Muscles Utilized")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            ForEach(workoutItem.muscles_utilized.sorted(by: { $0.share > $1.share }), id: \.muscle) { muscle in
                                HStack {
                                    Text(muscle.muscle.capitalized)
                                        .font(.subheadline)
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                    
                                    Spacer()
                                    
                                    Text("\(Int(muscle.share * 100))%")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundColor(AppTheme.Colors.secondaryText)
                                    
                                    // Progress bar
                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            Rectangle()
                                                .fill(AppTheme.Colors.border)
                                                .frame(height: 6)
                                                .cornerRadius(3)
                                            
                                            Rectangle()
                                                .fill(workoutItem.typeColor)
                                                .frame(width: geo.size.width * muscle.share, height: 6)
                                                .cornerRadius(3)
                                        }
                                    }
                                    .frame(width: 80, height: 6)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    
                    // Goals Addressed Section
                    if let goals = workoutItem.goals_addressed, !goals.isEmpty {
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
                    if let equipment = workoutItem.equipment, !equipment.isEmpty {
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
                    if let reasoning = workoutItem.reasoning, !reasoning.isEmpty {
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
                    if let description = workoutItem.exercise_description, !description.isEmpty {
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
                    
                    // User Feedback Section
                    if workoutItem.rpe != nil || workoutItem.notes != nil {
                        Divider()
                            .padding(.horizontal, 20)
                        
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Your Feedback")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            if let rpe = workoutItem.rpe {
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
                            
                            if let notes = workoutItem.notes, !notes.isEmpty {
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
    
    @ViewBuilder
    private var metricsView: some View {
        switch workoutItem.exercise_type {
        case "strength":
            strengthMetrics
        case "cardio_distance":
            cardioDistanceMetrics
        case "cardio_time":
            cardioTimeMetrics
        case "hiit":
            hiitMetrics
        case "bodyweight":
            bodyweightMetrics
        case "isometric":
            isometricMetrics
        default:
            defaultMetrics
        }
    }
    
    private var strengthMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let sets = workoutItem.sets {
                metricRow(label: "Sets", value: "\(sets)")
            }
            
            if let reps = workoutItem.reps, !reps.isEmpty {
                metricRow(label: "Reps", value: reps.map { String($0) }.joined(separator: ", "))
            }
            
            if let weights = workoutItem.load_kg_each, !weights.isEmpty {
                metricRow(label: "Weight (kg)", value: weights.map { String(format: "%.1f", $0) }.joined(separator: ", "))
            }
            
            if let rest = workoutItem.rest_seconds {
                metricRow(label: "Rest", value: "\(rest)s between sets")
            }
        }
    }
    
    private var cardioDistanceMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let distance = workoutItem.distance_km {
                metricRow(label: "Distance", value: String(format: "%.2f km", distance))
            }
            
            if let duration = workoutItem.duration_min {
                metricRow(label: "Duration", value: "\(duration) min")
            }
            
            if let pace = workoutItem.target_pace {
                metricRow(label: "Target Pace", value: pace)
            }
        }
    }
    
    private var cardioTimeMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let duration = workoutItem.duration_min {
                metricRow(label: "Duration", value: "\(duration) min")
            }
        }
    }
    
    private var hiitMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let rounds = workoutItem.rounds {
                metricRow(label: "Rounds", value: "\(rounds)")
            }
            
            if let duration = workoutItem.total_duration_min ?? workoutItem.duration_min {
                metricRow(label: "Total Duration", value: "\(duration) min")
            }
            
            if let intervals = workoutItem.intervals, !intervals.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Intervals:")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    
                    ForEach(intervals.indices, id: \.self) { index in
                        let interval = intervals[index]
                        if let work = interval.work_sec {
                            Text("• Work: \(work)s")
                                .font(.subheadline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                        }
                        if let rest = interval.rest_sec {
                            Text("• Rest: \(rest)s")
                                .font(.subheadline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                        }
                    }
                }
            }
        }
    }
    
    private var bodyweightMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let sets = workoutItem.sets {
                metricRow(label: "Sets", value: "\(sets)")
            }
            
            if let reps = workoutItem.reps, !reps.isEmpty {
                metricRow(label: "Reps", value: reps.map { String($0) }.joined(separator: ", "))
            }
            
            if let rest = workoutItem.rest_seconds {
                metricRow(label: "Rest", value: "\(rest)s between sets")
            }
        }
    }
    
    private var isometricMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let sets = workoutItem.sets {
                metricRow(label: "Sets", value: "\(sets)")
            }
            
            if let holds = workoutItem.hold_duration_sec, !holds.isEmpty {
                metricRow(label: "Hold Duration", value: holds.map { "\($0)s" }.joined(separator: ", "))
            }
            
            if let rest = workoutItem.rest_seconds {
                metricRow(label: "Rest", value: "\(rest)s between sets")
            }
        }
    }
    
    private var defaultMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let duration = workoutItem.duration_min {
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
                ExerciseDetailSheet(workoutItem: firstItem)
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

