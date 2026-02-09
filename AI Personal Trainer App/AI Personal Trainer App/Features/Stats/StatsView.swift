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

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()

                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "calendar.badge.clock")
                        .font(.system(size: 60))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                    Text("No Workouts Yet")
                        .font(AppTheme.Typography.screenTitle)
                    Text("Workout history is being redesigned. Check back soon!")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                    Spacer()
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
        }
    }
}

// MARK: - Workout History Card

struct WorkoutHistoryCard: View {
    let workout: WorkoutHistoryItem

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
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
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "calendar.badge.clock")
                .font(.system(size: 60))
                .foregroundColor(AppTheme.Colors.tertiaryText)
            Text("No Workouts Yet")
                .font(AppTheme.Typography.screenTitle)
            Text("Workout history is being redesigned. Check back soon!")
                .font(AppTheme.Typography.cardSubtitle)
                .foregroundColor(AppTheme.Colors.secondaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
    }
}

#Preview {
    StatsView()
}
