//
//  ContentView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/21/25.
//

import SwiftUI
import Supabase

struct ContentView: View {
    @StateObject private var apiService = APIService()
    @StateObject private var locationManager = UserLocationManager()
    @State private var message: String = "Loading..."
    @State private var exerciseRecommendations: ExerciseRecommendations?
    @State private var streamingExercises: [Exercise] = []
    @State private var isLoading = false
    @State private var isStreaming = false
    @State private var streamingProgress: String = ""
    @State private var streamingComplete = false
    @State private var errorMessage: String?
    @State private var showProfile = false
    @State private var exerciseCount: Int = 8
    @State private var useSpecificCount: Bool = true
    @State private var useStreaming: Bool = true
    
    // Agent testing state
    @State private var agentMessage: String = ""
    @State private var agentResponse: AgentResponse?
    @State private var agentError: String?
    @State private var isAgentLoading = false
    @State private var useTools = true
    
    var currentLocation: UserLocationRow? {
        locationManager.currentLocation
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    Image(systemName: "globe")
                        .imageScale(.large)
                        .foregroundStyle(.tint)
                    
                    Text("AI Personal Trainer")
                        .font(.title)
                        .fontWeight(.bold)
                    
                    // Agent Testing Section
                    AgentTestingView(
                        apiService: apiService,
                        agentMessage: $agentMessage,
                        agentResponse: $agentResponse,
                        agentError: $agentError,
                        isAgentLoading: $isAgentLoading,
                        useTools: $useTools
                    )
                    
                    // Current Location Display
                    if let currentLocation = currentLocation {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Image(systemName: "location.fill")
                                    .foregroundColor(.blue)
                                Text("Current Location")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                Spacer()
                                Button(action: {
                                    Task {
                                        await locationManager.refreshLocations()
                                    }
                                }) {
                                    Image(systemName: "arrow.clockwise")
                                        .foregroundColor(.blue)
                                        .font(.caption)
                                }
                            }
                            
                            Text(currentLocation.name)
                                .font(.title3)
                                .fontWeight(.semibold)
                            
                            if let description = currentLocation.description, !description.isEmpty {
                                Text(description)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            
                            if let equipment = currentLocation.equipment, !equipment.isEmpty {
                                Text("Equipment: \(equipment.joined(separator: ", "))")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding()
                        .background(Color.blue.opacity(0.1))
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                        )
                    } else {
                        // No current location - show refresh button
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Image(systemName: "location.slash")
                                    .foregroundColor(.orange)
                                Text("No Current Location")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                Spacer()
                                Button(action: {
                                    Task {
                                        await locationManager.refreshLocations()
                                    }
                                }) {
                                    Image(systemName: "arrow.clockwise")
                                        .foregroundColor(.blue)
                                        .font(.caption)
                                }
                            }
                            
                            Text("Set a current location in your profile")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding()
                        .background(Color.orange.opacity(0.1))
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.orange.opacity(0.3), lineWidth: 1)
                        )
                    }
                    
                    VStack(spacing: 15) {
                        // API Message
                        VStack {
                            Text("API Response:")
                                .font(.headline)
                            Text(message)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .padding()
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(10)
                        
                        // Error Message
                        if let errorMessage = errorMessage {
                            Text(errorMessage)
                                .foregroundColor(.red)
                                .font(.caption)
                                .multilineTextAlignment(.center)
                                .padding()
                                .background(Color.red.opacity(0.1))
                                .cornerRadius(10)
                        }
                        
                        // Refresh Button
                        Button(action: fetchData) {
                            HStack {
                                if isLoading {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                }
                                Text("Refresh Data")
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                        .disabled(isLoading)
                        
                        // Exercise Count Control
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Text("Exercise Count")
                                    .font(.headline)
                                Spacer()
                                Toggle("Specify Count", isOn: $useSpecificCount)
                                    .labelsHidden()
                            }
                            
                            if useSpecificCount {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Number of Exercises: \(exerciseCount)")
                                        .font(.subheadline)
                                        .foregroundColor(.primary)
                                    
                                    Stepper(value: $exerciseCount, in: 1...20) {
                                        Text("Adjust exercise count")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                            } else {
                                Text("Let AI decide the optimal number of exercises")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                    .italic()
                            }
                            
                            Divider()
                            
                            // Streaming Toggle
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Streaming Mode")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                    Text("See exercises as they're generated")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                Toggle("Use Streaming", isOn: $useStreaming)
                                    .labelsHidden()
                            }
                        }
                        .padding()
                        .background(Color.orange.opacity(0.1))
                        .cornerRadius(10)
                        
                        // Fetch Exercises Button (Protected)
                        Button(action: fetchRecommendations) {
                            HStack {
                                if isLoading || isStreaming {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                }
                                if useStreaming {
                                    Text(useSpecificCount ? "Stream \(exerciseCount) Exercise Recommendations" : "Stream Exercise Recommendations")
                                } else {
                                    Text(useSpecificCount ? "Get \(exerciseCount) Exercise Recommendations" : "Get Exercise Recommendations")
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(useStreaming ? Color.purple : Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                        .disabled(isLoading || isStreaming)
                        
                        // Streaming Progress
                        if isStreaming && !streamingProgress.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Image(systemName: "waveform.path")
                                        .foregroundColor(.purple)
                                    Text("Streaming in progress...")
                                        .font(.headline)
                                        .foregroundColor(.primary)
                                    Spacer()
                                    if streamingComplete {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundColor(.green)
                                    }
                                }
                                
                                Text(streamingProgress)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                
                                if !streamingExercises.isEmpty {
                                    Text("\(streamingExercises.count) exercises received")
                                        .font(.caption)
                                        .foregroundColor(.purple)
                                }
                            }
                            .padding()
                            .background(Color.purple.opacity(0.1))
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color.purple.opacity(0.3), lineWidth: 1)
                            )
                        }
                        
                        // Exercises Display - Streaming
                        if !streamingExercises.isEmpty {
                            VStack(alignment: .leading, spacing: 15) {
                                HStack {
                                    Text("Your Workout Plan")
                                        .font(.title2)
                                        .fontWeight(.bold)
                                    
                                    Spacer()
                                    
                                    if isStreaming {
                                        HStack(spacing: 4) {
                                            ProgressView()
                                                .scaleEffect(0.6)
                                            Text("\(streamingExercises.count)")
                                                .font(.caption)
                                                .foregroundColor(.purple)
                                        }
                                    } else {
                                        Text("(\(streamingExercises.count) exercises)")
                                            .font(.title3)
                                            .foregroundColor(.secondary)
                                    }
                                }
                                .padding(.top)
                                
                                ForEach(streamingExercises) { exercise in
                                    ExerciseCard(exercise: exercise)
                                        .transition(.asymmetric(
                                            insertion: .move(edge: .trailing).combined(with: .opacity),
                                            removal: .opacity
                                        ))
                                }
                            }
                            .padding()
                            .background(Color.purple.opacity(0.05))
                            .cornerRadius(10)
                        }
                        
                        // Exercises Display - Regular (non-streaming)
                        if let recommendations = exerciseRecommendations, streamingExercises.isEmpty {
                            VStack(alignment: .leading, spacing: 15) {
                                Text("Your Workout Plan (\(recommendations.exercises.count) exercises)")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .padding(.top)
                                
                                ForEach(recommendations.exercises) { exercise in
                                    ExerciseCard(exercise: exercise)
                                }
                            }
                            .padding()
                            .background(Color.blue.opacity(0.05))
                            .cornerRadius(10)
                        }
                    }
                    .padding()
                }
                .padding()
            }
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: {
                        showProfile = true
                    }) {
                        Image(systemName: "person.circle.fill")
                            .font(.title2)
                            .foregroundColor(.blue)
                    }
                }
            }
        }
        .onAppear {
            fetchData()
            fetchUserLocations()
        }
        .sheet(isPresented: $showProfile) {
            ProfileView(locationManager: locationManager)
        }
        .onChange(of: showProfile) { _, isShowing in
            if !isShowing {
                // Refresh locations when profile is dismissed
                Task {
                    await locationManager.refreshLocations()
                }
            }
        }
    }
    
    private func fetchData() {
        isLoading = true
        errorMessage = nil
        
        Task {
            do {
                let messageText = try await apiService.fetchMessage()
                
                await MainActor.run {
                    self.message = messageText
                    self.isLoading = false
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = error.localizedDescription
                    self.isLoading = false
                }
            }
        }
    }
    
    private func fetchRecommendations() {
        // Clear previous results
        exerciseRecommendations = nil
        streamingExercises = []
        streamingComplete = false
        errorMessage = nil
        
        if useStreaming {
            fetchStreamingRecommendations()
        } else {
            fetchRegularRecommendations()
        }
    }
    
    private func fetchRegularRecommendations() {
        isLoading = true
        
        Task {
            do {
                let fetchedRecommendations = try await apiService.fetchRecommendations(exerciseCount: useSpecificCount ? exerciseCount : nil)
                
                await MainActor.run {
                    self.exerciseRecommendations = fetchedRecommendations
                    self.isLoading = false
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = error.localizedDescription
                    self.isLoading = false
                }
            }
        }
    }
    
    private func fetchStreamingRecommendations() {
        isStreaming = true
        streamingProgress = "Connecting to AI trainer..."
        
        Task {
            do {
                try await apiService.streamRecommendations(
                    exerciseCount: useSpecificCount ? exerciseCount : nil,
                    onExercise: { exercise in
                        withAnimation(.easeInOut(duration: 0.5)) {
                            self.streamingExercises.append(exercise)
                        }
                        self.streamingProgress = "Generating exercise \(self.streamingExercises.count)..."
                    },
                    onComplete: { totalExercises in
                        self.streamingProgress = "Completed! Generated \(totalExercises) exercises."
                        self.streamingComplete = true
                        
                        // Auto-hide progress after delay
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                            withAnimation {
                                self.isStreaming = false
                                self.streamingProgress = ""
                            }
                        }
                    },
                    onError: { error in
                        self.errorMessage = "Streaming error: \(error)"
                        self.isStreaming = false
                        self.streamingProgress = ""
                    }
                )
            } catch {
                await MainActor.run {
                    self.errorMessage = error.localizedDescription
                    self.isStreaming = false
                    self.streamingProgress = ""
                }
            }
        }
    }
    
    private func fetchUserLocations() {
        Task {
            await locationManager.refreshLocations()
        }
    }
}

struct ExerciseCard: View {
    let exercise: Exercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(exercise.name)
                    .font(.headline)
                    .foregroundColor(.primary)
                
                if let description = exercise.exercise_description, !description.isEmpty {
                    Text(description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .italic()
                }
            }
            
            VStack(alignment: .leading, spacing: 8) {
                // Exercise Format Information
                HStack(spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        // Rounds/Sets
                        if let rounds = exercise.rounds, rounds > 0 {
                            Text("Rounds: \(rounds)")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        } else if exercise.sets > 1 {
                            Text("Sets: \(exercise.sets)")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        
                        // Reps
                        if !exercise.reps.isEmpty {
                            Text("Reps: \(exercise.reps.map(String.init).joined(separator: ", "))")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        
                        // Distance
                        if let distance = exercise.distance_km, distance > 0 {
                            Text("Distance: \(String(format: "%.1f", distance)) km")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    VStack(alignment: .leading, spacing: 4) {
                        // Duration
                        if exercise.duration_min > 0 {
                            Text("Duration: \(exercise.duration_min) min")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        
                        // Load/Weight
                        if !exercise.load_kg_each.isEmpty && exercise.load_kg_each.contains(where: { $0 > 0 }) {
                            Text("Load: \(exercise.load_kg_each.map { String(format: "%.1f", $0) }.joined(separator: ", ")) kg")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                // Intervals Information
                if let intervals = exercise.intervals, !intervals.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Intervals:")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.primary)
                        
                        ForEach(intervals.indices, id: \.self) { index in
                            let interval = intervals[index]
                            HStack {
                                if let workSec = interval.work_sec {
                                    Text("Work: \(workSec)s")
                                        .font(.caption)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 2)
                                        .background(Color.green.opacity(0.2))
                                        .foregroundColor(.green)
                                        .cornerRadius(4)
                                }
                                
                                if let restSec = interval.rest_sec {
                                    Text("Rest: \(restSec)s")
                                        .font(.caption)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 2)
                                        .background(Color.blue.opacity(0.2))
                                        .foregroundColor(.blue)
                                        .cornerRadius(4)
                                }
                                Spacer()
                            }
                        }
                    }
                }
            }
            
            // Display muscle utilization
            if let muscles = exercise.muscles_utilized, !muscles.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Muscles Targeted:")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                    
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], spacing: 4) {
                        ForEach(muscles, id: \.muscle) { muscle in
                            HStack {
                                Text(muscle.muscle)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                Spacer()
                                Text("\(Int(muscle.share * 100))%")
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .foregroundColor(.blue)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.1))
                            .cornerRadius(6)
                        }
                    }
                }
            }
            
            // Display goals addressed
            if let goals = exercise.goals_addressed, !goals.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Goals Addressed:")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                    
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 4) {
                        ForEach(goals, id: \.self) { goal in
                            Text(goal)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.green.opacity(0.1))
                                .foregroundColor(.green)
                                .cornerRadius(6)
                        }
                    }
                }
            }
            
            if !exercise.reasoning.isEmpty {
                Text(exercise.reasoning)
                    .font(.caption)
                    .foregroundColor(.blue)
                    .italic()
                    .padding(.top, 4)
            }
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .cornerRadius(10)
    }
}

#Preview {
    ContentView()
}
