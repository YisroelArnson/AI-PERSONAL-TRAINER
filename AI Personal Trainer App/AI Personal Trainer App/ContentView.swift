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
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showProfile = false
    @State private var exerciseCount: Int = 8
    
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
                        
                        // Exercise Count Stepper
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Number of Exercises: \(exerciseCount)")
                                .font(.headline)
                            
                            Stepper(value: $exerciseCount, in: 1...20) {
                                Text("Adjust exercise count")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding()
                        .background(Color.orange.opacity(0.1))
                        .cornerRadius(10)
                        
                        // Fetch Exercises Button (Protected)
                        Button(action: fetchRecommendations) {
                            HStack {
                                if isLoading {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                }
                                Text("Get \(exerciseCount) Exercise Recommendations")
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                        .disabled(isLoading)
                        
                        // Exercises Display
                        if let recommendations = exerciseRecommendations {
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
        isLoading = true
        errorMessage = nil
        
        Task {
            do {
                let fetchedRecommendations = try await apiService.fetchRecommendations(exerciseCount: exerciseCount)
                
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
    
    private func fetchUserLocations() {
        Task {
            await locationManager.refreshLocations()
        }
    }
}

struct ExerciseCard: View {
    let exercise: Exercise
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(exercise.name)
                .font(.headline)
                .foregroundColor(.primary)
            
            HStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Sets: \(exercise.sets)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    if !exercise.reps.isEmpty {
                        Text("Reps: \(exercise.reps.map(String.init).joined(separator: ", "))")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    if exercise.duration_min > 0 {
                        Text("Duration: \(exercise.duration_min) min")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    
                    if !exercise.load_kg_each.isEmpty && exercise.load_kg_each.contains(where: { $0 > 0 }) {
                        Text("Load: \(exercise.load_kg_each.map { String(format: "%.1f", $0) }.joined(separator: ", ")) kg")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
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
