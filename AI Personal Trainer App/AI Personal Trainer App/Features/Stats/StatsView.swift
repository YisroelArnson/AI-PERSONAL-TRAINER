//
//  StatsView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

enum TimePeriod: String, CaseIterable {
    case today = "Today"
    case thisWeek = "This Week"
    case thisMonth = "This Month"
    case allTime = "All Time"
    case custom = "Custom Range"
    
    func dateRange(customStart: Date? = nil, customEnd: Date? = nil) -> (start: Date?, end: Date?) {
        let calendar = Calendar.current
        let now = Date()
        
        switch self {
        case .today:
            let startOfDay = calendar.startOfDay(for: now)
            return (startOfDay, now)
        case .thisWeek:
            let startOfWeek = calendar.dateInterval(of: .weekOfYear, for: now)?.start
            return (startOfWeek, now)
        case .thisMonth:
            let startOfMonth = calendar.dateInterval(of: .month, for: now)?.start
            return (startOfMonth, now)
        case .allTime:
            return (nil, nil)
        case .custom:
            return (customStart, customEnd)
        }
    }
}

struct StatsView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var historyStore = WorkoutHistoryStore.shared
    
    @State private var selectedPeriod: TimePeriod = .thisWeek
    @State private var filteredWorkoutHistory: [WorkoutHistoryItem] = []
    @State private var selectedWorkout: WorkoutHistoryItem?
    @State private var showingDetail = false
    
    // Custom date range state
    @State private var customStartDate: Date = Calendar.current.startOfDay(for: Date())
    @State private var customEndDate: Date = Date()
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Filter Controls
                    HStack(spacing: 12) {
                        // Date Range Display
                        dateRangeDisplay
                        
                        // Preset Picker Button
                        presetPickerButton
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 12)
                    
                    if historyStore.isLoading {
                        // Loading State
                        Spacer()
                        VStack(spacing: 16) {
                            ProgressView()
                                .scaleEffect(1.5)
                            Text("Loading workout history...")
                                .font(AppTheme.Typography.cardSubtitle)
                                .foregroundColor(AppTheme.Colors.secondaryText)
                        }
                        Spacer()
                    } else if let error = historyStore.error {
                        // Error State
                        Spacer()
                        VStack(spacing: 16) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.system(size: 50))
                                .foregroundColor(AppTheme.Colors.danger)
                            Text("Error Loading History")
                                .font(AppTheme.Typography.cardTitle)
                            Text(error.localizedDescription)
                                .font(AppTheme.Typography.cardSubtitle)
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                            
                            Button("Try Again") {
                                Task {
                                    await historyStore.refreshCache()
                                }
                            }
                            .padding(.horizontal, 24)
                            .padding(.vertical, 12)
                            .background(AppTheme.Colors.accent)
                            .foregroundColor(AppTheme.Colors.background)
                            .cornerRadius(AppTheme.CornerRadius.medium)
                        }
                        Spacer()
                    } else if filteredWorkoutHistory.isEmpty {
                        // Empty State
                        Spacer()
                        VStack(spacing: 16) {
                            Image(systemName: "calendar.badge.clock")
                                .font(.system(size: 60))
                                .foregroundColor(AppTheme.Colors.tertiaryText)
                            Text("No Workouts Yet")
                                .font(AppTheme.Typography.screenTitle)
                            Text("Complete exercises to see your workout history here")
                                .font(AppTheme.Typography.cardSubtitle)
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                        }
                Spacer()
                    } else {
                        // Exercise List
                        VStack(spacing: 0) {
                            // Exercise count
                        HStack {
                            Text("Showing \(filteredWorkoutHistory.count) exercise\(filteredWorkoutHistory.count == 1 ? "" : "s")")
                                .font(AppTheme.Typography.label)
                                .foregroundColor(AppTheme.Colors.tertiaryText)
                            Spacer()
                        }
                            .padding(.horizontal, 20)
                            .padding(.top, 8)
                            .padding(.bottom, 12)
                            
                            ScrollView {
                                LazyVStack(spacing: 12) {
                                    ForEach(filteredWorkoutHistory) { workout in
                                        WorkoutHistoryCard(workout: workout)
                                            .onTapGesture {
                                                selectedWorkout = workout
                                                showingDetail = true
                                            }
                                    }
                                }
                                .padding(.horizontal, 20)
                                .padding(.vertical, 16)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Stats & Analytics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(AppTheme.Colors.primaryText)
                }
            }
            .sheet(isPresented: $showingDetail) {
                if let workout = selectedWorkout {
                    ExerciseDetailSheet(exercise: workout)
                }
            }
            .onAppear {
                // Filter the already-loaded cache when view appears
                filterWorkoutHistory()
            }
            .onChange(of: selectedPeriod) { _, _ in
                filterWorkoutHistory()
            }
            .onChange(of: historyStore.workoutHistory) { _, _ in
                // Re-filter when cache updates
                filterWorkoutHistory()
            }
        }
    }
    
    // MARK: - Filter UI Components
    
    private var dateRangeDisplay: some View {
        HStack(spacing: 6) {
            // Start Date
            DatePicker(
                "",
                selection: $customStartDate,
                in: ...Date(),
                displayedComponents: [.date]
            )
            .datePickerStyle(.compact)
            .labelsHidden()
            .scaleEffect(0.9)
            .background(AppTheme.Colors.surface)
            .onChange(of: customStartDate) { _, newValue in
                selectedPeriod = .custom
                filterWorkoutHistory()
            }
            
            Text("—")
                .font(.caption)
                .foregroundColor(AppTheme.Colors.tertiaryText)
            
            // End Date
            DatePicker(
                "",
                selection: $customEndDate,
                in: customStartDate...Date(),
                displayedComponents: [.date]
            )
            .datePickerStyle(.compact)
            .labelsHidden()
            .scaleEffect(0.9)
            .background(AppTheme.Colors.surface)
            .onChange(of: customEndDate) { _, newValue in
                selectedPeriod = .custom
                filterWorkoutHistory()
            }
        }
        .padding(8)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.small)
    }
    
    private var presetPickerButton: some View {
        Menu {
            Button {
                applyPreset(.today)
            } label: {
                HStack {
                    Text("Today")
                    if selectedPeriod == .today {
                        Spacer()
                        Image(systemName: "checkmark")
                    }
                }
            }
            
            Button {
                applyPreset(.thisWeek)
            } label: {
                HStack {
                    Text("This Week")
                    if selectedPeriod == .thisWeek {
                        Spacer()
                        Image(systemName: "checkmark")
                    }
                }
            }
            
            Button {
                applyPreset(.thisMonth)
            } label: {
                HStack {
                    Text("This Month")
                    if selectedPeriod == .thisMonth {
                        Spacer()
                        Image(systemName: "checkmark")
                    }
                }
            }
            
            Button {
                applyPreset(.allTime)
            } label: {
                HStack {
                    Text("All Time")
                    if selectedPeriod == .allTime {
                        Spacer()
                        Image(systemName: "checkmark")
                    }
                }
            }
        } label: {
            Image(systemName: "calendar.badge.clock")
                .font(.system(size: 18))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 44, height: 44)
                .background(AppTheme.Colors.surface)
                .cornerRadius(AppTheme.CornerRadius.small)
        }
    }
    
    private func applyPreset(_ period: TimePeriod) {
        selectedPeriod = period
        let dateRange = period.dateRange()
        
        if let start = dateRange.start {
            customStartDate = start
        }
        if let end = dateRange.end {
            customEndDate = end
        }
        
        filterWorkoutHistory()
    }
    
    // MARK: - Filtering Methods
    
    private func filterWorkoutHistory() {
        let dateRange = selectedPeriod.dateRange(
            customStart: customStartDate,
            customEnd: customEndDate
        )
        
        print("🔍 Filtering with period: \(selectedPeriod.rawValue)")
        print("🔍 Date range: start=\(dateRange.start?.description ?? "nil"), end=\(dateRange.end?.description ?? "nil")")
        print("🔍 Total workouts in cache: \(historyStore.workoutHistory.count)")
        
        // Check if we need to load older data
        Task {
            await checkAndLoadOlderDataIfNeeded(startDate: dateRange.start, endDate: dateRange.end)
        }
        
        // Filter from cache
        filteredWorkoutHistory = historyStore.filteredHistory(
            start: dateRange.start,
            end: dateRange.end
        )
        
        print("🔍 Filtered to \(filteredWorkoutHistory.count) workouts")
    }
    
    /// Check if we need to load older data from the API
    private func checkAndLoadOlderDataIfNeeded(startDate: Date?, endDate: Date?) async {
        // If all time is selected and we haven't loaded all data yet
        if startDate == nil && endDate == nil {
            // Check if we need to load all-time data
            if historyStore.oldestFetchedDate != nil {
                print("📥 Loading all-time data...")
                await historyStore.loadHistoryForDateRange(start: nil, end: nil)
            }
            return
        }
        
        // Check if requested start date is before our oldest fetched date
        if let requestedStart = startDate,
           let oldestDate = historyStore.oldestFetchedDate,
           requestedStart < oldestDate {
            print("📥 Loading older data from \(requestedStart) to \(oldestDate)...")
            await historyStore.loadHistoryForDateRange(start: requestedStart, end: endDate)
        }
    }
}

// MARK: - Workout History Card

struct WorkoutHistoryCard: View {
    let workout: WorkoutHistoryItem
    
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            // Exercise Name and Date
            VStack(alignment: .leading, spacing: 4) {
                Text(workout.exercise_name)
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .lineLimit(2)
                
                Text(workout.relativeDate)
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.tertiaryText)
            }
            
            Spacer()
            
            // Type Badge
            Text(workout.exercise_type.replacingOccurrences(of: "_", with: " ").capitalized)
                .font(AppTheme.Typography.label)
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(AppTheme.Colors.highlight)
                .cornerRadius(AppTheme.CornerRadius.small)
        }
        .padding(16)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.medium)
    }
}

// MARK: - Stats Content View (for full-page navigation)

struct StatsContentView: View {
    @StateObject private var historyStore = WorkoutHistoryStore.shared
    
    @State private var selectedPeriod: TimePeriod = .thisWeek
    @State private var filteredWorkoutHistory: [WorkoutHistoryItem] = []
    @State private var selectedWorkout: WorkoutHistoryItem?
    @State private var showingDetail = false
    
    // Custom date range state
    @State private var customStartDate: Date = Calendar.current.startOfDay(for: Date())
    @State private var customEndDate: Date = Date()
    
    var body: some View {
        VStack(spacing: 0) {
            // Filter Controls
            HStack(spacing: 12) {
                // Date Range Display
                dateRangeDisplay
                
                // Preset Picker Button
                presetPickerButton
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 12)
            
            if historyStore.isLoading {
                // Loading State
                Spacer()
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Loading workout history...")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                Spacer()
            } else if let error = historyStore.error {
                // Error State
                Spacer()
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 50))
                        .foregroundColor(AppTheme.Colors.danger)
                    Text("Error Loading History")
                        .font(AppTheme.Typography.cardTitle)
                    Text(error.localizedDescription)
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                    
                    Button("Try Again") {
                        Task {
                            await historyStore.refreshCache()
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(AppTheme.Colors.accent)
                    .foregroundColor(AppTheme.Colors.background)
                    .cornerRadius(AppTheme.CornerRadius.medium)
                }
                Spacer()
            } else if filteredWorkoutHistory.isEmpty {
                // Empty State
                Spacer()
                VStack(spacing: 16) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.system(size: 60))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                    Text("No Workouts Yet")
                        .font(AppTheme.Typography.screenTitle)
                    Text("Complete exercises to see your workout history here")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
                Spacer()
            } else {
                // Exercise List
                VStack(spacing: 0) {
                    // Exercise count
                    HStack {
                        Text("Showing \(filteredWorkoutHistory.count) exercise\(filteredWorkoutHistory.count == 1 ? "" : "s")")
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                        Spacer()
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
                    
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(filteredWorkoutHistory) { workout in
                                WorkoutHistoryCard(workout: workout)
                                    .onTapGesture {
                                        selectedWorkout = workout
                                        showingDetail = true
                                    }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                    }
                }
            }
        }
        .sheet(isPresented: $showingDetail) {
            if let workout = selectedWorkout {
                ExerciseDetailSheet(exercise: workout)
            }
        }
        .onAppear {
            filterWorkoutHistory()
        }
        .onChange(of: selectedPeriod) { _, _ in
            filterWorkoutHistory()
        }
        .onChange(of: historyStore.workoutHistory) { _, _ in
            filterWorkoutHistory()
        }
    }
    
    // MARK: - Filter UI Components
    
    private var dateRangeDisplay: some View {
        HStack(spacing: 6) {
            DatePicker(
                "",
                selection: $customStartDate,
                in: ...Date(),
                displayedComponents: [.date]
            )
            .datePickerStyle(.compact)
            .labelsHidden()
            .scaleEffect(0.9)
            .background(AppTheme.Colors.surface)
            .onChange(of: customStartDate) { _, newValue in
                selectedPeriod = .custom
                filterWorkoutHistory()
            }
            
            Text("—")
                .font(.caption)
                .foregroundColor(AppTheme.Colors.tertiaryText)
            
            DatePicker(
                "",
                selection: $customEndDate,
                in: customStartDate...Date(),
                displayedComponents: [.date]
            )
            .datePickerStyle(.compact)
            .labelsHidden()
            .scaleEffect(0.9)
            .background(AppTheme.Colors.surface)
            .onChange(of: customEndDate) { _, newValue in
                selectedPeriod = .custom
                filterWorkoutHistory()
            }
        }
        .padding(8)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.small)
    }
    
    private var presetPickerButton: some View {
        Menu {
            Button {
                applyPreset(.today)
            } label: {
                HStack {
                    Text("Today")
                    if selectedPeriod == .today {
                        Spacer()
                        Image(systemName: "checkmark")
                    }
                }
            }
            
            Button {
                applyPreset(.thisWeek)
            } label: {
                HStack {
                    Text("This Week")
                    if selectedPeriod == .thisWeek {
                        Spacer()
                        Image(systemName: "checkmark")
                    }
                }
            }
            
            Button {
                applyPreset(.thisMonth)
            } label: {
                HStack {
                    Text("This Month")
                    if selectedPeriod == .thisMonth {
                        Spacer()
                        Image(systemName: "checkmark")
                    }
                }
            }
            
            Button {
                applyPreset(.allTime)
            } label: {
                HStack {
                    Text("All Time")
                    if selectedPeriod == .allTime {
                        Spacer()
                        Image(systemName: "checkmark")
                    }
                }
            }
        } label: {
            Image(systemName: "calendar.badge.clock")
                .font(.system(size: 18))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 44, height: 44)
                .background(AppTheme.Colors.surface)
                .cornerRadius(AppTheme.CornerRadius.small)
        }
    }
    
    private func applyPreset(_ period: TimePeriod) {
        selectedPeriod = period
        let dateRange = period.dateRange()
        
        if let start = dateRange.start {
            customStartDate = start
        }
        if let end = dateRange.end {
            customEndDate = end
        }
        
        filterWorkoutHistory()
    }
    
    // MARK: - Filtering Methods
    
    private func filterWorkoutHistory() {
        let dateRange = selectedPeriod.dateRange(
            customStart: customStartDate,
            customEnd: customEndDate
        )
        
        // Check if we need to load older data
        Task {
            await checkAndLoadOlderDataIfNeeded(startDate: dateRange.start, endDate: dateRange.end)
        }
        
        // Filter from cache
        filteredWorkoutHistory = historyStore.filteredHistory(
            start: dateRange.start,
            end: dateRange.end
        )
    }
    
    private func checkAndLoadOlderDataIfNeeded(startDate: Date?, endDate: Date?) async {
        if startDate == nil && endDate == nil {
            if historyStore.oldestFetchedDate != nil {
                await historyStore.loadHistoryForDateRange(start: nil, end: nil)
            }
            return
        }
        
        if let requestedStart = startDate,
           let oldestDate = historyStore.oldestFetchedDate,
           requestedStart < oldestDate {
            await historyStore.loadHistoryForDateRange(start: requestedStart, end: endDate)
        }
    }
}

#Preview {
    StatsView()
}
