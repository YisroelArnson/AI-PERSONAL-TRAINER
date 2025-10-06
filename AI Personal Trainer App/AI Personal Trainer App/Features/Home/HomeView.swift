//
//  HomeView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/21/25.
//

import SwiftUI

struct HomeView: View {
    @State private var currentExerciseIndex = 0
    @State private var exercises = UIExercise.sampleExercises
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background layer - Light gray #f5f6f7
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                // Main content layer
                VStack(spacing: 0) {
                    Spacer()
                    
                    // Exercise Carousel
                    ExerciseCarouselView(
                        exercises: exercises,
                        currentIndex: $currentExerciseIndex
                    )
                    
                    Spacer()
                    
                }

            }
        }
    }
    
}

// MARK: - Supporting Views

struct TrainerOrbView: View {
    @State private var isAnimating = false
    
    var body: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(
                    gradient: Gradient(colors: [Color.blue.opacity(0.3), Color.purple.opacity(0.3)]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: 50, height: 50)
                .scaleEffect(isAnimating ? 1.2 : 1.0)
                .opacity(isAnimating ? 0.7 : 1.0)
            
            Circle()
                .fill(LinearGradient(
                    gradient: Gradient(colors: [Color.blue, Color.purple]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: 40, height: 40)
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                )
            
            Circle()
                .fill(LinearGradient(
                    gradient: Gradient(colors: [Color.white.opacity(0.6), Color.clear]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: 20, height: 20)
                .offset(x: -5, y: -5)
        }
        .onAppear {
            withAnimation(Animation.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                isAnimating = true
            }
        }
    }
}

struct ExerciseCarouselView: View {
    let exercises: [UIExercise]
    @Binding var currentIndex: Int
    
    @State private var scrollTimer: Timer?
    @State private var isUserScrolling = false
    
    private let cardHeight: CGFloat = 160
    private let cardSpacing: CGFloat = 8
    
    var body: some View {
        GeometryReader { geometry in
            let centerY = geometry.size.height / 2
            
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: cardSpacing) {
                        ForEach(Array(exercises.enumerated()), id: \.element.id) { index, exercise in
                            GeometryReader { cardGeometry in
                                let cardCenterY = cardGeometry.frame(in: .named("scroll")).midY
                                let distanceFromCenter = abs(cardCenterY - centerY)
                                let normalizedDistance = min(distanceFromCenter / (cardHeight + cardSpacing), 1.0)
                                
                                let scale = 1.0 - (normalizedDistance * 0.15) // Scale from 1.0 to 0.85
                                let opacity = 1.0 - (normalizedDistance * 0.3) // Opacity from 1.0 to 0.7
                                
                                ExerciseCardView(
                                    exercise: exercise,
                                    isCurrent: index == currentIndex
                                )
                                .scaleEffect(scale)
                                .opacity(opacity)
                                .onTapGesture {
                                    withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) {
                                        currentIndex = index
                                        proxy.scrollTo(exercise.id, anchor: .center)
                                    }
                                }
                                .onChange(of: cardCenterY) { _, _ in
                                    // Detect user scrolling and start snap timer
                                    isUserScrolling = true
                                    scrollTimer?.invalidate()
                                    
                                    // Update current index to the card closest to center
                                    if distanceFromCenter < (cardHeight + cardSpacing) / 2 {
                                        if currentIndex != index {
                                            currentIndex = index
                                        }
                                    }
                                    
                                    // Set timer to snap to nearest card when scrolling stops
                                    scrollTimer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: false) { _ in
                                        isUserScrolling = false
                                        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                                            proxy.scrollTo(exercises[currentIndex].id, anchor: .center)
                                        }
                                    }
                                }
                                .onChange(of: currentIndex) { _, newIndex in
                                    if !isUserScrolling && newIndex == index {
                                        withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) {
                                            proxy.scrollTo(exercise.id, anchor: .center)
                                        }
                                    }
                                }
                            }
                            .frame(height: cardHeight)
                            .id(exercise.id)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, geometry.size.height / 2 - cardHeight / 2) // Center the content
                }
                .coordinateSpace(name: "scroll")
                .onAppear {
                    // Scroll to current index on appear
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        if currentIndex < exercises.count {
                            proxy.scrollTo(exercises[currentIndex].id, anchor: .center)
                        }
                    }
                }
            }
        }
        .frame(height: 300) // Set a fixed height for the carousel
        .clipped()
    }
}

struct ExerciseCardView: View {
    let exercise: UIExercise
    let isCurrent: Bool
    
    // Function to get color for exercise type
    private func colorForExerciseType(_ type: String) -> Color {
        switch type {
        case "strength":
            return Color.orange
        case "cardio_distance", "cardio_time":
            return Color.blue
        case "hiit":
            return Color.red
        case "bodyweight":
            return Color.green
        case "isometric":
            return Color.purple
        case "flexibility", "stretching":
            return Color.pink
        case "yoga", "pilates":
            return Color.mint
        default:
            return Color.blue
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header section with exercise type and duration
            HStack {
                // Exercise type badge with subtle background
                Text(exercise.type.replacingOccurrences(of: "_", with: " ").uppercased())
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(AppTheme.Colors.background)
                    .cornerRadius(8)
                
                Spacer()
                
                // Duration/time info
                HStack(spacing: 4) {
                    if let duration = exercise.duration_min, duration > 0 {
                        Text("\(duration)min")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(AppTheme.Colors.primaryText)
                    } else if let sets = exercise.sets {
                        Text("\(sets) sets")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(AppTheme.Colors.primaryText)
                    } else {
                        Text("Workout")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(AppTheme.Colors.primaryText)
                    }
                }
            }
            
            // Exercise name - most prominent
            Text(exercise.exercise_name)
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .lineLimit(2)
            
            // Distance or key metric
            if let distance = exercise.distance_km {
                Text("\(String(format: "%.1f", distance)) km")
                    .font(.title3)
                    .fontWeight(.medium)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.7))
            } else if let sets = exercise.sets, let reps = exercise.reps?.first {
                Text("\(sets) sets × \(reps) reps")
                    .font(.title3)
                    .fontWeight(.medium)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.7))
            } else if let rounds = exercise.rounds {
                Text("\(rounds) rounds")
                    .font(.title3)
                    .fontWeight(.medium)
                    .foregroundColor(AppTheme.Colors.primaryText.opacity(0.7))
            }
            
            // Subtitle with instructor/program info
            HStack(spacing: 4) {
                if let muscles = exercise.muscles_utilized?.sorted(by: { $0.share > $1.share }).prefix(2) {
                    let muscleNames = muscles.map { $0.muscle.capitalized }.joined(separator: " • ")
                    Text(muscleNames)
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                }
                
                if exercise.type == "strength" {
                    Text("• Strength Training")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                } else if exercise.type.contains("cardio") {
                    Text("• Cardio")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                } else if exercise.type == "hiit" {
                    Text("• HIIT")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.5))
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.Colors.cardBackground)
        .cornerRadius(20)
        .shadow(color: Color.black.opacity(0.08), radius: 10, x: 0, y: 5)
    }
}

struct StatPillView: View {
    let label: String
    let value: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 1) {
            Text(label)
                .font(.caption2)
                .foregroundColor(.gray)
            Text(value)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundColor(.white)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.gray.opacity(0.3))
        .cornerRadius(0)
    }
}

// MARK: - Full Exercise Details

struct FullExerciseDetailsView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            switch exercise.type {
            case "strength":
                if let loads = exercise.load_kg_each, !loads.isEmpty {
                    DetailRowView(
                        label: "Weight (kg)",
                        value: loads.map { "\(Int($0))" }.joined(separator: ", "),
                        icon: "dumbbell"
                    )
                }
                
                if let rest = exercise.rest_seconds {
                    DetailRowView(
                        label: "Rest",
                        value: "\(rest) seconds",
                        icon: "clock"
                    )
                }
                
            case "cardio_distance":
                if let pace = exercise.target_pace {
                    DetailRowView(
                        label: "Target Pace",
                        value: pace,
                        icon: "speedometer"
                    )
                }
                
            case "cardio_time":
                // Additional details already shown in stats pills
                EmptyView()
                
            case "hiit":
                if let intervals = exercise.intervals, !intervals.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Intervals")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.gray)
                        
                        ForEach(intervals.indices, id: \.self) { index in
                            let interval = intervals[index]
                            HStack {
                                Text("Round \(index + 1):")
                                    .font(.caption2)
                                    .foregroundColor(.gray)
                                
                                if let work = interval.work_sec {
                                    Text("Work \(work)s")
                                        .font(.caption2)
                                        .fontWeight(.medium)
                                }
                                
                                if let rest = interval.rest_sec {
                                    Text("Rest \(rest)s")
                                        .font(.caption2)
                                        .fontWeight(.medium)
                                }
                                
                                Spacer()
                            }
                        }
                    }
                }
                
            case "bodyweight", "isometric":
                if let holds = exercise.hold_duration_sec, !holds.isEmpty {
                    DetailRowView(
                        label: "Hold Duration",
                        value: holds.map { "\($0)s" }.joined(separator: ", "),
                        icon: "timer"
                    )
                }
                
                if let level = exercise.progression_level {
                    DetailRowView(
                        label: "Level",
                        value: level,
                        icon: "chart.line.uptrend.xyaxis"
                    )
                }
                
            default:
                EmptyView()
            }
        }
    }
}

struct DetailRowView: View {
    let label: String
    let value: String
    let icon: String
    
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(.gray)
                .frame(width: 12)
            
            Text(label)
                .font(.caption)
                .foregroundColor(.gray)
            
            Spacer()
            
            Text(value)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(.white)
        }
    }
}

// MARK: - Exercise Type Views

struct StrengthExerciseView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let sets = exercise.sets {
                Text("\(sets) sets")
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
            
            if let reps = exercise.reps, let loads = exercise.load_kg_each {
                HStack {
                    Text("Reps:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(reps.map { "\($0)" }.joined(separator: ", "))
                        .font(.caption)
                        .fontWeight(.medium)
                }
                
                HStack {
                    Text("Weight:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(loads.map { "\(Int($0))kg" }.joined(separator: ", "))
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
            
            if let rest = exercise.rest_seconds {
                HStack {
                    Text("Rest:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(rest)s")
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct CardioDistanceView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let distance = exercise.distance_km {
                HStack {
                    Text("Distance:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(String(format: "%.1f", distance) + "km")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }
            
            if let duration = exercise.duration_min, duration > 0 {
                HStack {
                    Text("Duration:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(duration) min")
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
            
            if let pace = exercise.target_pace {
                HStack {
                    Text("Target Pace:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(pace)
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct CardioTimeView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let duration = exercise.duration_min {
                HStack {
                    Text("Duration:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(duration) min")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }
            
            if let intensity = exercise.target_intensity {
                HStack {
                    Text("Intensity:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(intensity)
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct HIITExerciseView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let rounds = exercise.rounds {
                HStack {
                    Text("Rounds:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(rounds)")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }
            
            if let intervals = exercise.intervals {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Intervals:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    
                    ForEach(intervals.indices, id: \.self) { index in
                        let interval = intervals[index]
                        HStack {
                            if let work = interval.work_sec {
                                Text("Work: \(work)s")
                                    .font(.caption)
                                    .fontWeight(.medium)
                            }
                            if let rest = interval.rest_sec {
                                Text("Rest: \(rest)s")
                                    .font(.caption)
                                    .fontWeight(.medium)
                            }
                        }
                    }
                }
            }
            
            if let duration = exercise.duration_min {
                HStack {
                    Text("Total:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(duration) min")
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct BodyweightExerciseView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let sets = exercise.sets {
                Text("\(sets) sets")
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
            
            if let reps = exercise.reps {
                HStack {
                    Text("Reps:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(reps.map { "\($0)" }.joined(separator: ", "))
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
            
            if let holds = exercise.hold_duration_sec {
                HStack {
                    Text("Hold:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(holds.map { "\($0)s" }.joined(separator: ", "))
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
            
            if let level = exercise.progression_level {
                HStack {
                    Text("Level:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(level)
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct GeneralExerciseView: View {
    let exercise: UIExercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let duration = exercise.duration_min, duration > 0 {
                HStack {
                    Text("Duration:")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(duration) min")
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
    }
}

struct MuscleUtilizationView: View {
    let muscles: [MuscleUtilization]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Muscles:")
                .font(.caption)
                .foregroundColor(.gray)
            
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 80))], spacing: 4) {
                ForEach(muscles.sorted(by: { $0.share > $1.share }), id: \.muscle) { muscle in
                    HStack(spacing: 4) {
                        Text(muscle.muscle.capitalized)
                            .font(.caption2)
                            .fontWeight(.medium)
                            .foregroundColor(.white)
                        Text("\(Int(muscle.share * 100))%")
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.gray.opacity(0.3))
                    .cornerRadius(0)
                }
            }
        }
    }
}

struct LocationView: View {
    let location: LocationInfo
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                Text("Location Settings")
                    .font(.title)
                Text(location.name)
                    .font(.headline)
                Spacer()
            }
            .navigationTitle("Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Data Models

struct UIExercise: Identifiable, Codable {
    let id: UUID
    let exercise_name: String
    let type: String // exercise type (strength, cardio_distance, etc.)
    let aliases: [String]?
    let duration_min: Int?
    
    // For rep-based exercises
    let reps: [Int]?
    let load_kg_each: [Double]?
    let sets: Int?
    
    // For distance-based cardio
    let distance_km: Double?
    
    // For interval exercises
    let intervals: [ExerciseInterval]?
    let rounds: Int?
    
    // Muscle utilization
    let muscles_utilized: [MuscleUtilization]?
    
    // Additional fields for different exercise types
    let rest_seconds: Int?
    let target_pace: String?
    let target_intensity: String?
    let hold_duration_sec: [Int]?
    let progression_level: String?
    
    // Custom initializer to generate UUID
    init(exercise_name: String, type: String, aliases: [String]? = nil, duration_min: Int? = nil, reps: [Int]? = nil, load_kg_each: [Double]? = nil, sets: Int? = nil, distance_km: Double? = nil, intervals: [ExerciseInterval]? = nil, rounds: Int? = nil, muscles_utilized: [MuscleUtilization]? = nil, rest_seconds: Int? = nil, target_pace: String? = nil, target_intensity: String? = nil, hold_duration_sec: [Int]? = nil, progression_level: String? = nil) {
        self.id = UUID()
        self.exercise_name = exercise_name
        self.type = type
        self.aliases = aliases
        self.duration_min = duration_min
        self.reps = reps
        self.load_kg_each = load_kg_each
        self.sets = sets
        self.distance_km = distance_km
        self.intervals = intervals
        self.rounds = rounds
        self.muscles_utilized = muscles_utilized
        self.rest_seconds = rest_seconds
        self.target_pace = target_pace
        self.target_intensity = target_intensity
        self.hold_duration_sec = hold_duration_sec
        self.progression_level = progression_level
    }
    
    enum CodingKeys: String, CodingKey {
        case id, exercise_name, type, aliases, duration_min, reps, load_kg_each, sets, distance_km, intervals, rounds, muscles_utilized, rest_seconds, target_pace, target_intensity, hold_duration_sec, progression_level
    }
    
    static var sampleExercises: [UIExercise] {
        let benchPress = UIExercise(
            exercise_name: "Barbell Bench Press",
            type: "strength",
            aliases: ["bb_bench_press"],
            duration_min: 0,
            reps: [8, 8, 6, 6],
            load_kg_each: [80, 80, 85, 85],
            sets: 4,
            distance_km: nil,
            intervals: nil,
            rounds: nil,
            muscles_utilized: [
                MuscleUtilization(muscle: "chest", share: 0.5),
                MuscleUtilization(muscle: "triceps", share: 0.3),
                MuscleUtilization(muscle: "shoulders", share: 0.2)
            ],
            rest_seconds: 90,
            target_pace: nil,
            target_intensity: nil,
            hold_duration_sec: nil,
            progression_level: nil
        )
        
        let run5k = UIExercise(
            exercise_name: "5K Run",
            type: "cardio_distance",
            aliases: ["running"],
            duration_min: 25,
            reps: nil,
            load_kg_each: nil,
            sets: nil,
            distance_km: 5.0,
            intervals: nil,
            rounds: nil,
            muscles_utilized: [
                MuscleUtilization(muscle: "legs", share: 0.7),
                MuscleUtilization(muscle: "core", share: 0.3)
            ],
            rest_seconds: nil,
            target_pace: "5:00/km",
            target_intensity: nil,
            hold_duration_sec: nil,
            progression_level: nil
        )
        
        let hiitCircuit = UIExercise(
            exercise_name: "HIIT Circuit",
            type: "hiit",
            aliases: ["high_intensity_intervals"],
            duration_min: 20,
            reps: nil,
            load_kg_each: nil,
            sets: nil,
            distance_km: nil,
            intervals: [
                ExerciseInterval(work_sec: 30, rest_sec: nil),
                ExerciseInterval(work_sec: nil, rest_sec: 60)
            ],
            rounds: 10,
            muscles_utilized: [
                MuscleUtilization(muscle: "full_body", share: 1.0)
            ],
            rest_seconds: nil,
            target_pace: nil,
            target_intensity: "High",
            hold_duration_sec: nil,
            progression_level: nil
        )
        
        return [benchPress, run5k, hiitCircuit]
    }
}

struct LocationInfo {
    let name: String
    let temperature: String?
    let weatherCondition: String?
    
    static let sample = LocationInfo(
        name: "San Francisco, CA",
        temperature: "72°F",
        weatherCondition: "Sunny"
    )
}


#Preview {
    HomeView()
}
