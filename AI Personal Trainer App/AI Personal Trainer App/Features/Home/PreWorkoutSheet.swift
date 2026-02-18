//
//  PreWorkoutSheet.swift
//  AI Personal Trainer App
//
//  Bottom sheet for pre-workout inputs before generating a workout.
//  Captures location, energy level, time available, and optional custom request.
//

import SwiftUI

struct PreWorkoutSheet: View {
    var isCustomWorkout: Bool = false
    var sessionTitle: String?

    @State var workoutStore = WorkoutStore.shared
    @StateObject private var userDataStore = UserDataStore.shared

    @State private var showLocationPicker = false
    @State private var isStarting = false

    private let timePresets = [15, 30, 45, 60, 90]

    var body: some View {
        VStack(spacing: 0) {
            // Title
            Text(sessionTitle ?? "Get Ready")
                .font(AppTheme.Typography.screenTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.top, 24)
                .padding(.bottom, 24)

            ScrollView {
                VStack(spacing: 24) {
                    // Custom workout text field
                    if isCustomWorkout {
                        customRequestField
                    }

                    // Location card (location row + equipment)
                    locationCard

                    // Readiness section (energy + time grouped)
                    readinessCard
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }

            // Confirm button pinned at bottom
            confirmButton
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
                .padding(.top, 12)
        }
        .background(AppTheme.Colors.background)
        .presentationDragIndicator(.visible)
        .sheet(isPresented: $showLocationPicker) {
            locationPickerSheet
        }
        .onAppear {
            if workoutStore.selectedLocation == nil {
                workoutStore.selectedLocation = userDataStore.currentLocation
            }
        }
    }

    // MARK: - Custom Request Field

    private var customRequestField: some View {
        HStack(spacing: 12) {
            TextField("What do you want to work on?", text: $workoutStore.customRequestText)
                .font(AppTheme.Typography.input)
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(14)
                .background(AppTheme.Colors.surface)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))

            Button(action: {
                // Mic action placeholder
            }) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 18))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .frame(width: 50, height: 50)
                    .background(AppTheme.Colors.surface)
                    .clipShape(Circle())
            }
        }
    }

    // MARK: - Location Card

    private var locationCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Location row
            Button(action: {
                showLocationPicker = true
            }) {
                HStack(spacing: 12) {
                    Image(systemName: "mappin")
                        .font(.system(size: 18))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .frame(width: 20)

                    Text(workoutStore.selectedLocation?.name ?? "Select Location")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .lineLimit(1)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                }
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
            }
            .buttonStyle(.plain)

            // Equipment chips (inside the same card)
            if let equipment = workoutStore.selectedLocation?.equipment, !equipment.isEmpty {
                Divider()
                    .background(AppTheme.Colors.divider)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(equipment) { item in
                            Text(item.name)
                                .font(.system(size: 13))
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(AppTheme.Colors.background)
                                .clipShape(Capsule())
                                .overlay(
                                    Capsule()
                                        .strokeBorder(AppTheme.Colors.divider, lineWidth: 1)
                                )
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large))
    }

    // MARK: - Readiness Card

    private var readinessCard: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Energy level
            VStack(alignment: .leading, spacing: 10) {
                Text("ENERGY")
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.tertiaryText)
                    .textCase(.uppercase)

                HStack(spacing: 10) {
                    ForEach(1...5, id: \.self) { level in
                        Button(action: {
                            workoutStore.energyLevel = level
                        }) {
                            Text("\(level)")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(
                                    workoutStore.energyLevel == level
                                        ? AppTheme.Colors.background
                                        : AppTheme.Colors.primaryText
                                )
                                .frame(width: 44, height: 44)
                                .background(
                                    workoutStore.energyLevel == level
                                        ? AppTheme.Colors.accent
                                        : AppTheme.Colors.background
                                )
                                .clipShape(Circle())
                                .overlay(
                                    workoutStore.energyLevel != level
                                        ? Circle().strokeBorder(AppTheme.Colors.divider, lineWidth: 1)
                                        : nil
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Divider()
                .background(AppTheme.Colors.divider)

            // Time available
            VStack(alignment: .leading, spacing: 10) {
                Text("TIME AVAILABLE")
                    .font(AppTheme.Typography.label)
                    .foregroundColor(AppTheme.Colors.tertiaryText)
                    .textCase(.uppercase)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(timePresets, id: \.self) { minutes in
                            Button(action: {
                                workoutStore.timeAvailableMin = minutes
                            }) {
                                Text("\(minutes) min")
                                    .font(AppTheme.Typography.pillText)
                                    .foregroundColor(
                                        workoutStore.timeAvailableMin == minutes
                                            ? AppTheme.Colors.background
                                            : AppTheme.Colors.primaryText
                                    )
                                    .padding(.horizontal, 18)
                                    .padding(.vertical, 10)
                                    .background(
                                        workoutStore.timeAvailableMin == minutes
                                            ? AppTheme.Colors.accent
                                            : AppTheme.Colors.background
                                    )
                                    .clipShape(Capsule())
                                    .overlay(
                                        workoutStore.timeAvailableMin != minutes
                                            ? Capsule().strokeBorder(AppTheme.Colors.divider, lineWidth: 1)
                                            : nil
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large))
    }

    // MARK: - Confirm Button

    private var confirmButton: some View {
        Button(action: {
            guard !isStarting else { return }
            isStarting = true
            Task {
                await WorkoutStore.shared.generateWorkout()
            }
        }) {
            HStack(spacing: 8) {
                if isStarting {
                    ProgressView()
                        .tint(AppTheme.Colors.background)
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "play.fill")
                        .font(.system(size: 16))
                }

                Text(isStarting ? "Generating..." : "Start Workout")
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(AppTheme.Colors.background)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 20)
            .background(isStarting ? AppTheme.Colors.accent.opacity(0.7) : AppTheme.Colors.accent)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isStarting)
    }

    // MARK: - Location Picker Sheet

    private var locationPickerSheet: some View {
        VStack(spacing: 16) {
            Text("Select Location")
                .font(AppTheme.Typography.screenTitle)
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.top, 24)

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(userDataStore.locations) { location in
                        Button(action: {
                            workoutStore.selectedLocation = location
                            showLocationPicker = false
                        }) {
                            HStack(spacing: 12) {
                                Image(systemName: "mappin")
                                    .font(.system(size: 18))
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                                    .frame(width: 20)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(location.name)
                                        .font(.system(size: 15, weight: .medium))
                                        .foregroundColor(AppTheme.Colors.primaryText)

                                    if !location.equipment.isEmpty {
                                        Text("\(location.equipment.count) equipment")
                                            .font(AppTheme.Typography.label)
                                            .foregroundColor(AppTheme.Colors.tertiaryText)
                                    }
                                }

                                Spacer()

                                if workoutStore.selectedLocation?.id == location.id {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                }
                            }
                            .padding(.vertical, 14)
                            .padding(.horizontal, 16)
                            .background(
                                workoutStore.selectedLocation?.id == location.id
                                    ? AppTheme.Colors.surfaceHover
                                    : AppTheme.Colors.surface
                            )
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
        .background(AppTheme.Colors.background)
        .presentationDragIndicator(.visible)
    }
}

// MARK: - Preview

#Preview("Pre-Workout Sheet") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()
        Color.clear
    }
    .sheet(isPresented: .constant(true)) {
        PreWorkoutSheet()
            .presentationDetents([.medium, .large])
    }
}

#Preview("Custom Workout") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()
        Color.clear
    }
    .sheet(isPresented: .constant(true)) {
        PreWorkoutSheet(isCustomWorkout: true, sessionTitle: "Custom Workout")
            .presentationDetents([.medium, .large])
    }
}
