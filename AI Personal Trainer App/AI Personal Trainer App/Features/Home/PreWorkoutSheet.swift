import SwiftUI

private enum PreWorkoutNavigationDirection {
    case forward
    case backward
}

struct PreWorkoutSheet: View {
    @State private var workoutStore = WorkoutStore.shared
    @StateObject private var userDataStore = UserDataStore.shared

    @State private var isGeneratingWorkout = false
    @State private var isStartingWorkout = false
    @State private var showDurationPicker = false
    @State private var showLocationManagementSheet = false
    @State private var locationSheetControl = false
    @State private var navigationDirection: PreWorkoutNavigationDirection = .forward

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            currentPageView
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .transition(pageTransition)
        }
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
        .onChange(of: workoutStore.preWorkoutPage) { oldValue, newValue in
            navigationDirection = pageIndex(for: newValue) >= pageIndex(for: oldValue) ? .forward : .backward
        }
    }

    @ViewBuilder
    private var currentPageView: some View {
        switch workoutStore.preWorkoutPage {
        case .intent:
            intentPage
        case .review:
            reviewPage
        case .preview:
            previewPage
        }
    }

    private var pageTransition: AnyTransition {
        switch navigationDirection {
        case .forward:
            return .asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            )
        case .backward:
            return .asymmetric(
                insertion: .move(edge: .leading).combined(with: .opacity),
                removal: .move(edge: .trailing).combined(with: .opacity)
            )
        }
    }

    private func pageIndex(for page: PreWorkoutPage) -> Int {
        switch page {
        case .intent:
            return 0
        case .review:
            return 1
        case .preview:
            return 2
        }
    }

    private func navigate(to page: PreWorkoutPage, direction: PreWorkoutNavigationDirection) {
        navigationDirection = direction
        withAnimation(AppTheme.Animation.slow) {
            workoutStore.preWorkoutPage = page
        }
    }

    private func dismissFlow() {
        withAnimation(AppTheme.Animation.slow) {
            workoutStore.showPreWorkoutSheet = false
        }
    }

    private var intentPage: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    dismissFlow()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .frame(width: 44, height: 44)
                        .background(AppTheme.Colors.surface)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(isGeneratingWorkout || workoutStore.isLoadingIntentPlan)

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            Text("Describe your workout,\nI'll build a personalized plan.")
                .font(AppTheme.Typography.aiMessageLarge)
                .foregroundStyle(AppTheme.Colors.primaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 20)

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
                    navigationDirection = .forward
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
                Button {
                    if workoutStore.arrivedFromIntentPage {
                        navigate(to: .intent, direction: .backward)
                    } else {
                        dismissFlow()
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
                .disabled(isGeneratingWorkout || workoutStore.isLoadingIntentPlan)

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

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
                guard !isGeneratingWorkout else { return }
                isGeneratingWorkout = true
                Task {
                    await workoutStore.generateWorkout()
                    isGeneratingWorkout = false
                    if workoutStore.currentInstance != nil && workoutStore.errorMessage == nil {
                        navigate(to: .preview, direction: .forward)
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    if isGeneratingWorkout {
                        ProgressView()
                            .tint(AppTheme.Colors.background)
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "sparkles")
                            .font(.system(size: 16))
                    }

                    Text(isGeneratingWorkout ? "Generating..." : "Generate Workout")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .padding(.horizontal, 20)
                .background(isGeneratingWorkout ? AppTheme.Colors.accent.opacity(0.7) : AppTheme.Colors.accent)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isGeneratingWorkout)
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
            skeletonLine(widthRatio: 0.55, height: 26, delay: 0.0)
                .padding(.top, 24)

            skeletonLine(widthRatio: 0.95, height: 14, delay: 0.05)
            skeletonLine(widthRatio: 0.7, height: 14, delay: 0.1)

            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
                .frame(height: 56)
                .shimmer(delay: 0.15)
                .padding(.top, 16)

            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large)
                .fill(AppTheme.Colors.surface)
                .frame(height: 56)
                .shimmer(delay: 0.2)

            Spacer()

            Text("Generate Workout")
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

    private func skeletonLine(widthRatio: CGFloat, height: CGFloat, delay: Double) -> some View {
        GeometryReader { geometry in
            RoundedRectangle(cornerRadius: 6)
                .fill(AppTheme.Colors.surface)
                .frame(width: geometry.size.width * widthRatio, height: height)
                .shimmer(delay: delay)
        }
        .frame(height: height)
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

    private var previewPage: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    navigate(to: .review, direction: .backward)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .frame(width: 44, height: 44)
                        .background(AppTheme.Colors.surface)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(isStartingWorkout)

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let instance = workoutStore.currentInstance {
                        Text(instance.title)
                            .font(AppTheme.Typography.screenTitle)
                            .foregroundStyle(AppTheme.Colors.primaryText)
                            .padding(.top, 8)

                        Text("Review your workout before you start.")
                            .font(AppTheme.Typography.aiMessageMedium)
                            .foregroundStyle(AppTheme.Colors.secondaryText)

                        previewOverviewCard(instance: instance)

                        Text("Exercises")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.secondaryText)
                            .padding(.top, 4)

                        VStack(spacing: 8) {
                            ForEach(Array(instance.exercises.enumerated()), id: \.element.id) { index, exercise in
                                previewExerciseRow(index: index, exercise: exercise)
                            }
                        }
                    } else {
                        Text("No workout generated yet.")
                            .font(AppTheme.Typography.aiMessageMedium)
                            .foregroundStyle(AppTheme.Colors.secondaryText)
                            .padding(.top, 24)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }

            Button {
                guard !isStartingWorkout else { return }
                isStartingWorkout = true
                workoutStore.startGeneratedWorkout()
            } label: {
                HStack(spacing: 8) {
                    if isStartingWorkout {
                        ProgressView()
                            .tint(AppTheme.Colors.background)
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "play.fill")
                            .font(.system(size: 16))
                    }

                    Text(isStartingWorkout ? "Starting..." : "Start Workout")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .padding(.horizontal, 20)
                .background(AppTheme.Colors.accent)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isStartingWorkout || workoutStore.currentInstance == nil)
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
            .padding(.top, 8)
        }
    }

    private func previewOverviewCard(instance: WorkoutInstance) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Label("\(instance.exercises.count) exercises", systemImage: "list.bullet")
                Label("\(instance.estimatedDurationMin ?? workoutStore.preWorkoutDurationMin) min", systemImage: "clock")
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(AppTheme.Colors.secondaryText)

            HStack(spacing: 6) {
                Text("Location:")
                    .foregroundStyle(AppTheme.Colors.secondaryText)
                Text(workoutStore.selectedLocation?.name ?? "Not set")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)
            }

            if let focus = instance.focus, !focus.isEmpty {
                HStack(spacing: 6) {
                    Text("Focus:")
                        .foregroundStyle(AppTheme.Colors.secondaryText)
                    Text(focus.joined(separator: ", "))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .lineLimit(2)
                }
            }
        }
        .font(.system(size: 13, weight: .regular))
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.large))
    }

    private func previewExerciseRow(index: Int, exercise: UIExercise) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(index + 1)")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .frame(width: 24, height: 24)
                .background(AppTheme.Colors.highlight)
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(exercise.exercise_name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.primaryText)

                Text(previewDetailLine(for: exercise))
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(AppTheme.Colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium))
    }

    private func previewDetailLine(for exercise: UIExercise) -> String {
        switch exercise.type {
        case "reps":
            let sets = exercise.sets ?? 1
            let reps: String
            if let repValues = exercise.reps, !repValues.isEmpty {
                let low = repValues.min() ?? repValues[0]
                let high = repValues.max() ?? repValues[0]
                reps = low == high ? "\(low)" : "\(low)-\(high)"
            } else {
                reps = "?"
            }
            var line = "\(sets) x \(reps) reps"
            if let load = exercise.load_each?.first, load > 0 {
                let formatted = load.truncatingRemainder(dividingBy: 1) == 0
                    ? String(format: "%.0f", load)
                    : String(format: "%.1f", load)
                line += " · \(formatted) \(exercise.load_unit ?? "kg")"
            }
            return line
        case "hold":
            let sets = exercise.sets ?? 1
            let hold = exercise.hold_duration_sec?.first ?? 0
            return "\(sets) sets · \(hold)s hold"
        case "duration":
            var parts: [String] = []
            if let duration = exercise.duration_min {
                parts.append("\(duration) min")
            }
            if let distance = exercise.distance_km {
                parts.append(String(format: "%.1f %@", distance, exercise.distance_unit ?? "km"))
            }
            return parts.joined(separator: " · ")
        case "intervals":
            var parts: [String] = []
            if let rounds = exercise.rounds {
                parts.append("\(rounds) rounds")
            }
            if let work = exercise.work_sec {
                parts.append("\(work)s work")
            }
            if let rest = exercise.rest_seconds {
                parts.append("\(rest)s rest")
            }
            return parts.joined(separator: " · ")
        default:
            return ""
        }
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
    PreWorkoutSheet()
}
