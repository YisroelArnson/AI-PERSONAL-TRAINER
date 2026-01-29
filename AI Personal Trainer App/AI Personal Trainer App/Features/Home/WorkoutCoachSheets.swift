import SwiftUI

struct ReadinessInput {
    let timeAvailableMin: Int
    let readiness: WorkoutReadiness
    let equipmentOverride: [String]?
}

struct QuickWorkoutInput {
    let requestText: String
    let timeAvailableMin: Int
    let readiness: WorkoutReadiness
    let equipmentOverride: [String]?
}

struct ReadinessCheckSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var timeAvailable: Int = 45
    @State private var energy: String = "okay"
    @State private var soreness: String = "none"
    @State private var pain: String = "none"
    @State private var equipmentText: String = ""

    var onStart: (ReadinessInput) -> Void

    var body: some View {
        NavigationView {
            VStack(spacing: AppTheme.Spacing.lg) {
                Text("Quick readiness check")
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)

                Picker("Time", selection: $timeAvailable) {
                    Text("15 min").tag(15)
                    Text("25 min").tag(25)
                    Text("35 min").tag(35)
                    Text("45 min").tag(45)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, AppTheme.Spacing.xl)

                VStack(spacing: AppTheme.Spacing.md) {
                    LabeledPicker(title: "Energy", selection: $energy, options: ["low", "okay", "high"])
                    LabeledPicker(title: "Soreness", selection: $soreness, options: ["none", "mild", "high"])
                    LabeledPicker(title: "Pain", selection: $pain, options: ["none", "mild", "moderate"])
                }
                .padding(.horizontal, AppTheme.Spacing.xl)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("Equipment override (optional)")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    TextField("e.g. dumbbells, mat", text: $equipmentText)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.horizontal, AppTheme.Spacing.xl)

                Spacer()

                Button {
                    let readiness = WorkoutReadiness(energy: energy, soreness: soreness, pain: pain)
                    let equipment = equipmentText
                        .split(separator: ",")
                        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                    onStart(ReadinessInput(
                        timeAvailableMin: timeAvailable,
                        readiness: readiness,
                        equipmentOverride: equipment.isEmpty ? nil : equipment
                    ))
                    dismiss()
                } label: {
                    Text("Start workout")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, AppTheme.Spacing.md)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                .fill(AppTheme.Colors.warmAccent)
                        )
                        .foregroundColor(.white)
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.bottom, AppTheme.Spacing.xl)
            }
            .padding(.top, AppTheme.Spacing.lg)
            .navigationTitle("Readiness")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct QuickWorkoutSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var requestText: String = ""
    @State private var timeAvailable: Int = 25
    @State private var energy: String = "okay"
    @State private var soreness: String = "none"
    @State private var pain: String = "none"
    @State private var equipmentText: String = ""

    var onStart: (QuickWorkoutInput) -> Void

    var body: some View {
        NavigationView {
            VStack(spacing: AppTheme.Spacing.lg) {
                Text("Quick workout request")
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)

                TextField("e.g. Hotel room, no equipment", text: $requestText)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal, AppTheme.Spacing.xl)

                Picker("Time", selection: $timeAvailable) {
                    Text("15 min").tag(15)
                    Text("25 min").tag(25)
                    Text("35 min").tag(35)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, AppTheme.Spacing.xl)

                VStack(spacing: AppTheme.Spacing.md) {
                    LabeledPicker(title: "Energy", selection: $energy, options: ["low", "okay", "high"])
                    LabeledPicker(title: "Soreness", selection: $soreness, options: ["none", "mild", "high"])
                    LabeledPicker(title: "Pain", selection: $pain, options: ["none", "mild", "moderate"])
                }
                .padding(.horizontal, AppTheme.Spacing.xl)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("Equipment override (optional)")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    TextField("e.g. resistance bands", text: $equipmentText)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.horizontal, AppTheme.Spacing.xl)

                Spacer()

                Button {
                    let readiness = WorkoutReadiness(energy: energy, soreness: soreness, pain: pain)
                    let equipment = equipmentText
                        .split(separator: ",")
                        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                    onStart(QuickWorkoutInput(
                        requestText: requestText.isEmpty ? "Quick workout" : requestText,
                        timeAvailableMin: timeAvailable,
                        readiness: readiness,
                        equipmentOverride: equipment.isEmpty ? nil : equipment
                    ))
                    dismiss()
                } label: {
                    Text("Generate workout")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, AppTheme.Spacing.md)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                .fill(AppTheme.Colors.warmAccent)
                        )
                        .foregroundColor(.white)
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.bottom, AppTheme.Spacing.xl)
            }
            .padding(.top, AppTheme.Spacing.lg)
            .navigationTitle("Quick Workout")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct WorkoutReflectionSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var rpe: Double = 6
    @State private var rir: Int = 2
    @State private var enjoyment: String = "okay"
    @State private var painNotes: String = ""

    var onComplete: (WorkoutReflection) -> Void

    var body: some View {
        NavigationView {
            VStack(spacing: AppTheme.Spacing.lg) {
                Text("Workout reflection")
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("Overall effort: \(Int(rpe))")
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                    Slider(value: $rpe, in: 1...10, step: 1)
                }
                .padding(.horizontal, AppTheme.Spacing.xl)

                Stepper("Reps in reserve: \(rir)", value: $rir, in: 0...5)
                    .padding(.horizontal, AppTheme.Spacing.xl)

                LabeledPicker(title: "Enjoyment", selection: $enjoyment, options: ["low", "okay", "great"])
                    .padding(.horizontal, AppTheme.Spacing.xl)

                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("Pain or notes")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    TextField("Optional", text: $painNotes)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.horizontal, AppTheme.Spacing.xl)

                Spacer()

                Button {
                    let reflection = WorkoutReflection(
                        rpe: Int(rpe),
                        rir: rir,
                        enjoyment: enjoyment,
                        pain: painNotes.isEmpty ? nil : painNotes,
                        notes: nil
                    )
                    onComplete(reflection)
                    dismiss()
                } label: {
                    Text("Finish session")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, AppTheme.Spacing.md)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                .fill(AppTheme.Colors.warmAccent)
                        )
                        .foregroundColor(.white)
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.bottom, AppTheme.Spacing.xl)
            }
            .padding(.top, AppTheme.Spacing.lg)
            .navigationTitle("Wrap up")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct WorkoutSummarySheet: View {
    let summary: WorkoutSessionSummary

    var body: some View {
        NavigationView {
            VStack(spacing: AppTheme.Spacing.lg) {
                Text(summary.title)
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text("Completed \(summary.completion.exercises) exercises · \(summary.completion.totalSets) sets")
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .foregroundColor(AppTheme.Colors.secondaryText)

                if let rpe = summary.overallRpe {
                    Text("Overall effort: \(rpe)/10")
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }

                if !summary.wins.isEmpty {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Text("Wins")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                        ForEach(summary.wins, id: \.self) { win in
                            Text("• \(win)")
                                .font(.system(size: 13, weight: .regular, design: .rounded))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, AppTheme.Spacing.xl)
                }

                Text("Next focus: \(summary.nextSessionFocus)")
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.horizontal, AppTheme.Spacing.xl)

                Spacer()
            }
            .padding(.top, AppTheme.Spacing.lg)
            .navigationTitle("Summary")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct LabeledPicker: View {
    let title: String
    @Binding var selection: String
    let options: [String]

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundColor(AppTheme.Colors.secondaryText)
            Spacer()
            Picker(title, selection: $selection) {
                ForEach(options, id: \.self) { option in
                    Text(option.capitalized).tag(option)
                }
            }
            .pickerStyle(.menu)
        }
    }
}
