//
//  ContentView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/21/25.
//

import SwiftUI
import Supabase

struct ContentView: View {
    @State private var currentExerciseIndex = 0
    @State private var exercises = UIExercise.sampleExercises
    @State private var chatMessages: [ChatMessage] = []
    @State private var messageText = ""
    @State private var isTextFieldExpanded = false
    @State private var showingProfile = false
    @State private var showingInfo = false
    @State private var showingLocation = false
    @State private var currentLocation = LocationInfo.sample
    
    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Top Navigation Bar
                HStack {
                    // Profile and Info Buttons (Top Left)
                    HStack(spacing: 12) {
                        Button(action: { showingProfile = true }) {
                            Image(systemName: "person.circle")
                                .font(.title2)
                                .foregroundColor(.primary)
                        }
                        
                        Button(action: { showingInfo = true }) {
                            Image(systemName: "exclamationmark.circle")
                                .font(.title2)
                                .foregroundColor(.primary)
                        }
                    }
                    
                    Spacer()
                    
                    // Location Display (Top Middle)
                    Button(action: { showingLocation = true }) {
                        VStack(spacing: 2) {
                            Text(currentLocation.name)
                                .font(.caption)
                                .fontWeight(.medium)
                            if let temp = currentLocation.temperature {
                                Text(temp)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    Spacer()
                    
                    // AI Trainer Orb (Top Right)
                    TrainerOrbView()
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                
                Spacer()
                
                // Exercise Carousel
                ExerciseCarouselView(
                    exercises: exercises,
                    currentIndex: $currentExerciseIndex
                )
                
                Spacer()
                
                // Chat Interface
                ChatInterfaceView(
                    messages: $chatMessages,
                    messageText: $messageText,
                    isExpanded: $isTextFieldExpanded
                )
                .padding(.bottom, 20)
            }
        }
        .sheet(isPresented: $showingProfile) {
            ProfileView()
        }
        .sheet(isPresented: $showingInfo) {
            InfoView()
        }
        .sheet(isPresented: $showingLocation) {
            LocationView(location: currentLocation)
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
    
    private let cardHeight: CGFloat = 140
    private let cardSpacing: CGFloat = 4
    
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
                                
                                let scale = 1.0 - (normalizedDistance * 0.3) // Scale from 1.0 to 0.7
                                let opacity = 1.0 - (normalizedDistance * 0.6) // Opacity from 1.0 to 0.4
                                
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
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(exercise.name)
                .font(.title2)
                .fontWeight(.bold)
            
            Text(exercise.description)
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            Text(exercise.duration)
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct ChatInterfaceView: View {
    @Binding var messages: [ChatMessage]
    @Binding var messageText: String
    @Binding var isExpanded: Bool
    
    var body: some View {
        VStack(spacing: 12) {
            if !messages.isEmpty {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(messages) { message in
                            ChatBubbleView(message: message)
                        }
                    }
                    .padding(.horizontal)
                }
                .frame(maxHeight: 200)
                .background(Color(.systemGray6))
                .cornerRadius(12)
                .padding(.horizontal, 20)
            }
            
            HStack {
                TextField("Ask your trainer anything...", text: $messageText)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .frame(width: isExpanded ? nil : 200)
                    .onTapGesture {
                        withAnimation(.spring()) {
                            isExpanded = true
                        }
                    }
                
                if isExpanded && !messageText.isEmpty {
                    Button("Send") {
                        sendMessage()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(.horizontal, 20)
        }
    }
    
    private func sendMessage() {
        guard !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        
        let userMessage = ChatMessage(content: messageText, isFromUser: true)
        messages.append(userMessage)
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            let aiResponse = ChatMessage(content: "Great question! Let me help you with that exercise.", isFromUser: false)
            messages.append(aiResponse)
        }
        
        messageText = ""
    }
}

struct ChatBubbleView: View {
    let message: ChatMessage
    
    var body: some View {
        HStack {
            if message.isFromUser {
                Spacer()
            }
            
            Text(message.content)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(message.isFromUser ? Color.blue : Color(.systemGray5))
                .foregroundColor(message.isFromUser ? .white : .primary)
                .cornerRadius(16)
            
            if !message.isFromUser {
                Spacer()
            }
        }
    }
}

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                Text("Profile View")
                    .font(.title)
                Spacer()
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

struct InfoView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                Text("App Information")
                    .font(.title)
                Spacer()
            }
            .navigationTitle("Info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
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
    let id = UUID()
    let name: String
    let description: String
    let duration: String
    let difficulty: String
    let muscleGroups: [String]
    let instructions: [String]
    
    static let sampleExercises = [
        UIExercise(
            name: "Push-ups",
            description: "Classic upper body exercise",
            duration: "3 sets of 12 reps",
            difficulty: "Beginner",
            muscleGroups: ["Chest", "Shoulders", "Triceps"],
            instructions: ["Start in plank position", "Lower body to ground", "Push back up"]
        ),
        UIExercise(
            name: "Squats",
            description: "Lower body strength exercise",
            duration: "3 sets of 15 reps",
            difficulty: "Beginner",
            muscleGroups: ["Quadriceps", "Glutes", "Hamstrings"],
            instructions: ["Stand with feet shoulder-width apart", "Lower into squat position", "Return to standing"]
        ),
        UIExercise(
            name: "Plank",
            description: "Core strengthening exercise",
            duration: "Hold for 30 seconds",
            difficulty: "Intermediate",
            muscleGroups: ["Core", "Shoulders"],
            instructions: ["Start in push-up position", "Hold body straight", "Engage core muscles"]
        )
    ]
}

struct ChatMessage: Identifiable {
    let id = UUID()
    let content: String
    let isFromUser: Bool
    let timestamp: Date
    
    init(content: String, isFromUser: Bool) {
        self.content = content
        self.isFromUser = isFromUser
        self.timestamp = Date()
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
    ContentView()
}
