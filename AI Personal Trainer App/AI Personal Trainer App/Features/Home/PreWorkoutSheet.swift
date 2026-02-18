import SwiftUI

struct PreWorkoutSheet: View {
    @State private var workoutStore = WorkoutStore.shared
    @StateObject private var userDataStore = UserDataStore.shared

    @State private var isStarting = false
    @State private var showDurationPicker = false
    @State private var showLocationManagementSheet = false
    @State private var locationSheetControl = false

    var body: some View {
        ZStack {
            if workoutStore.preWorkoutPage == .intent {
                intentPage
                    .transition(.opacity)
            } else {
                reviewPage
                    .transition(.opacity)
            }
        }
        .background(AppTheme.Colors.background)
        .presentationDragIndicator(.visible)
        .animation(AppTheme.Animation.slow, value: workoutStore.preWorkoutPage)
        .sheet(isPresented: $showDurationPicker) {
            durationPickerSheet
        }
        .sheet(isPresented: $showLocationManagementSheet) {
            LocationsListSheet(
                selectedLocation: $workoutStore.selectedLocation,
                shouldShowEditor: $locationSheetControl
            )
            .environmentObject(userDataStore)
        }
        .onAppear {
            if workoutStore.selectedLocation == nil {
                workoutStore.selectedLocation = userDataStore.currentLocation
            }
        }
        .onChange(of: showLocationManagementSheet) { _, isPresented in
            if !isPresented {
                locationSheetControl = false
                if let selected = workoutStore.selectedLocation {
                    if !userDataStore.locations.contains(where: { $0.id == selected.id }) {
                        workoutStore.selectedLocation = userDataStore.currentLocation
                    }
                } else {
                    workoutStore.selectedLocation = userDataStore.currentLocation
                }
            }
        }
    }

    private var intentPage: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(AppTheme.Colors.tertiaryText)
                .frame(width: 36, height: 4)
                .padding(.top, 12)
                .padding(.bottom, 20)

            Text("Describe your workout,\nI'll build a personalized plan.")
                .font(AppTheme.Typography.aiMessageLarge)
                .foregroundStyle(AppTheme.Colors.primaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 24)

            ZStack(alignment: .topLeading) {
                if workoutStore.intentText.isEmpty {
                    Text("E.g., \"I want to do legs today, about 45 minutes, focus on glutes and hamstrings.\"")
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundStyle(AppTheme.Colors.tertiaryText)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                }

                TextEditor(text: $workoutStore.intentText)
                    .font(AppTheme.Typography.input)
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .frame(minHeight: 200)
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
            }
            .background(AppTheme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
            .padding(.horizontal, 20)
            .padding(.top, 24)

            Button(action: {}) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .frame(width: 50, height: 50)
                    .background(AppTheme.Colors.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(.top, 16)

            Spacer()

            Button {
                Task {
                    await workoutStore.submitIntent()
                }
            } label: {
                Text(workoutStore.isLoadingIntentPlan ? "Planning..." : "Plan My Workout")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.background)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .padding(.horizontal, 20)
                    .background(
                        AppTheme.Colors.accent.opacity(
                            workoutStore.intentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || workoutStore.isLoadingIntentPlan ? 0.4 : 1
                        )
                    )
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(workoutStore.intentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || workoutStore.isLoadingIntentPlan)
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
            .padding(.top, 16)
        }
    }

    private var reviewPage: some View {
        VStack(spacing: 0) {
            HStack {
                if workoutStore.arrivedFromIntentPage {
                    Button {
                        withAnimation(AppTheme.Animation.slow) {
                            workoutStore.preWorkoutPage = .intent
                        }
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.primaryText)
                            .frame(width: 44, height: 44)
                            .background(AppTheme.Colors.surface)
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)

            if let _ = workoutStore.intentPlanError {
                errorContent
            } else if workoutStore.isLoadingIntentPlan {
                loadingContent
            } else {
                contentForm
            }
        }
    }

    private var contentForm: some View {
        VStack(alignment: .leading, spacing: 0) {
            TextField("Workout title", text: $workoutStore.preWorkoutTitle)
                .font(AppTheme.Typography.screenTitle)
                .foregroundStyle(AppTheme.Colors.primaryText)
                .padding(.horizontal, 20)
                .padding(.top, workoutStore.arrivedFromIntentPage ? 12 : 24)

            TextEditor(text: $workoutStore.preWorkoutDescription)
                .font(AppTheme.Typography.aiMessageMedium)
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .frame(minHeight: 120)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 16)
                .padding(.top, 8)

            durationCard
                .padding(.horizontal, 20)
                .padding(.top, 24)

            locationCard
                .padding(.horizontal, 20)
                .padding(.top, 12)

            Spacer()

            Button {
                guard !isStarting else { return }
                isStarting = true
                Task {
                    await workoutStore.generateWorkout()
                    isStarting = false
                }
            } label: {
                HStack(spacing: 8) {
                    if isStarting {
                        ProgressView()
                            .tint(AppTheme.Colors.background)
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "play.fill")
                            .font(.system(size: 16))
                    }

                    Text(isStarting ? "Generating..." : "Get Started")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .padding(.horizontal, 20)
                .background(isStarting ? AppTheme.Colors.accent.opacity(0.7) : AppTheme.Colors.accent)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isStarting)
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
    }

    private var durationCard: some View {
        HStack(spacing: 0) {
            Text("This session should take ")
                .foregroundStyle(AppTheme.Colors.secondaryText)
            Button {
                showDurationPicker = true
            } label: {
                HStack(spacing: 4) {
                    Text("\(workoutStore.preWorkoutDurationMin)")
                        .font(.system(size: 14, weight: .semibold))
                    Image(systemName: "pencil")
                        .font(.system(size: 12))
                }
                .foregroundStyle(AppTheme.Colors.primaryText)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(AppTheme.Colors.surfaceHover)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            }
            .buttonStyle(.plain)
            Text(" minutes")
                .foregroundStyle(AppTheme.Colors.secondaryText)
            Spacer(minLength: 0)
        }
        .font(AppTheme.Typography.input)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large))
    }

    private var locationCard: some View {
        HStack(spacing: 0) {
            Text("Built around your ")
                .foregroundStyle(AppTheme.Colors.secondaryText)

            Menu {
                if userDataStore.locations.isEmpty {
                    Button("No location set") {}
                        .disabled(true)
                } else {
                    ForEach(userDataStore.locations) { location in
                        Button(location.name) {
                            workoutStore.selectedLocation = location
                        }
                    }
                }

                Divider()

                Button("Manage Locations") {
                    locationSheetControl = true
                    showLocationManagementSheet = true
                }
            } label: {
                HStack(spacing: 4) {
                    Text(workoutStore.selectedLocation?.name ?? "No location set")
                        .font(.system(size: 14, weight: .semibold))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                }
                .foregroundStyle(AppTheme.Colors.primaryText)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(AppTheme.Colors.surfaceHover)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            Text(" location")
                .foregroundStyle(AppTheme.Colors.secondaryText)

            Spacer(minLength: 0)
        }
        .font(AppTheme.Typography.input)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large))
    }

    private var loadingContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            RoundedRectangle(cornerRadius: 6)
                .fill(AppTheme.Colors.surface)
                .frame(width: 220, height: 20)
                .padding(.top, 24)

            RoundedRectangle(cornerRadius: 6)
                .fill(AppTheme.Colors.surface)
                .frame(height: 14)
            RoundedRectangle(cornerRadius: 6)
                .fill(AppTheme.Colors.surface)
                .frame(width: 260, height: 14)

            durationCard
                .redacted(reason: .placeholder)

            locationCard

            Spacer()

            Text("Get Started")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .padding(.horizontal, 20)
                .background(AppTheme.Colors.accent.opacity(0.7))
                .clipShape(Capsule())
                .padding(.bottom, 32)
        }
        .padding(.horizontal, 20)
    }

    private var errorContent: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "face.dashed")
                .font(.system(size: 48))
                .foregroundStyle(AppTheme.Colors.tertiaryText)

            Text("Something went wrong. Please try again.")
                .font(AppTheme.Typography.aiMessageMedium)
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 250)

            Button {
                Task {
                    await workoutStore.retryIntentPlan()
                }
            } label: {
                Text("Retry")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.background)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(AppTheme.Colors.accent)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)

            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var durationPickerSheet: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("Done") {
                    showDurationPicker = false
                }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.primaryText)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)

            Picker("Duration", selection: $workoutStore.preWorkoutDurationMin) {
                ForEach(Array(stride(from: 10, through: 120, by: 5)), id: \.self) { minutes in
                    Text("\(minutes) min")
                        .tag(minutes)
                }
            }
            .pickerStyle(.wheel)
            .labelsHidden()
            .onChange(of: workoutStore.preWorkoutDurationMin) { _, newValue in
                workoutStore.preWorkoutDurationMin = max(10, min(120, newValue))
                workoutStore.timeAvailableMin = workoutStore.preWorkoutDurationMin
            }
        }
        .presentationDetents([.height(280)])
        .presentationDragIndicator(.visible)
        .background(AppTheme.Colors.background)
    }
}

#Preview {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()
        Color.clear
    }
    .sheet(isPresented: .constant(true)) {
        PreWorkoutSheet()
            .presentationDetents([.large])
    }
}
