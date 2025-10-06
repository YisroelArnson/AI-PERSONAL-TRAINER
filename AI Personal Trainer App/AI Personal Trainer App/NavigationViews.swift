//
//  NavigationViews.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/5/25.
//

import SwiftUI

// MARK: - Stats View
struct StatsView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                Text("Stats & Analytics")
                    .font(.title)
                Spacer()
            }
            .navigationTitle("Stats")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Info View (Updated from ContentView)
struct InfoView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var showingAddPreference = false
    @State private var showingPreferencesManager = false
    
    var body: some View {
        NavigationView {
            ZStack {
                // Background - matching home page
                Color(hex: "f5f6f7")
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 24) {
                        // Section 1: Active Preferences
                        ActivePreferencesSection(
                            showingAddPreference: $showingAddPreference,
                            showingPreferencesManager: $showingPreferencesManager
                        )
                        
                        // Placeholder for Section 2: Category Goals (to be implemented)
                        // Placeholder for Section 3: Muscle Goals (to be implemented)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle("Info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showingAddPreference) {
                AddPreferenceSheet()
            }
            .sheet(isPresented: $showingPreferencesManager) {
                PreferencesManagerView()
            }
        }
    }
}

// MARK: - Active Preferences Section
struct ActivePreferencesSection: View {
    @Binding var showingAddPreference: Bool
    @Binding var showingPreferencesManager: Bool
    
    var body: some View {
        // In SwiftUI, the `spacing` parameter in VStack sets the vertical space between each child view.
        VStack(alignment: .leading, spacing: 16) {
            // Section Header
            HStack(alignment: .center) {
                Text("Active Preferences")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(Color(hex: "212529"))
                
                // Spacer() is a SwiftUI view that takes up all available space along the parent stack's axis.
                // In an HStack, it pushes views to opposite ends, creating flexible spacing.
                Spacer()
                
                HStack(spacing: 12) {
                    // AI Assist Button
                    Button(action: {
                        showingAddPreference = true
                    }) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(Color(hex: "212529"))
                            .frame(width: 36, height: 36)
                            .background(Color(hex: "ffffff"))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color(hex: "e0e0e0").opacity(0.4), lineWidth: 1)
                            )
                    }
                    
                    // Edit Button
                    Button(action: {
                        showingPreferencesManager = true
                    }) {
                        Image(systemName: "pencil")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(Color(hex: "212529"))
                            .frame(width: 36, height: 36)
                            .background(Color(hex: "ffffff"))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color(hex: "e0e0e0").opacity(0.4), lineWidth: 1)
                            )
                    }
                }
            }
            
            // Body Content - Empty State
            VStack(spacing: 16) {
                EmptyPreferencesState(showingAddPreference: $showingAddPreference)
            }
        }
        .padding(20)
        .background(Color(hex: "ffffff"))
        .cornerRadius(20)
        .shadow(color: Color.black.opacity(0.06), radius: 12, x: 0, y: 4)
    }
}

// MARK: - Empty State
struct EmptyPreferencesState: View {
    @Binding var showingAddPreference: Bool
    
    var body: some View {
        VStack(spacing: 12) {
            Text("No active preferences.")
                .font(.body)
                .foregroundColor(Color(hex: "212529").opacity(0.6))
            
            Text("Try: ")
                .font(.body)
                .foregroundColor(Color(hex: "212529").opacity(0.6))
            + Text("'I only have 20 minutes'")
                .font(.body)
                .italic()
                .foregroundColor(Color(hex: "212529").opacity(0.8))
            + Text(", ")
                .font(.body)
                .foregroundColor(Color(hex: "212529").opacity(0.6))
            + Text("'Avoid burpees'")
                .font(.body)
                .italic()
                .foregroundColor(Color(hex: "212529").opacity(0.8))
            
            Button(action: {
                showingAddPreference = true
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Add with AI")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(Color(hex: "ffffff"))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color(hex: "212529"))
                .cornerRadius(8)
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }
}

// MARK: - Add Preference Sheet (Placeholder)
struct AddPreferenceSheet: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(hex: "f5f6f7")
                    .ignoresSafeArea()
                
                VStack {
                    Text("Add/Parse Preference")
                        .font(.title2)
                        .foregroundColor(Color(hex: "212529"))
                    Text("Voice or text input")
                        .font(.body)
                        .foregroundColor(Color(hex: "212529").opacity(0.6))
                        .padding(.top, 4)
                    Spacer()
                }
                .padding(.top, 40)
            }
            .navigationTitle("AI Assist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Preferences Manager View (Placeholder)
struct PreferencesManagerView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(hex: "f5f6f7")
                    .ignoresSafeArea()
                
                VStack {
                    Text("Preferences Manager")
                        .font(.title2)
                        .foregroundColor(Color(hex: "212529"))
                    Text("Bulk edit, reorder, search")
                        .font(.body)
                        .foregroundColor(Color(hex: "212529").opacity(0.6))
                        .padding(.top, 4)
                    Spacer()
                }
                .padding(.top, 40)
            }
            .navigationTitle("Edit Preferences")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - AI Assistant View
struct AssistantView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                Text("AI Assistant")
                    .font(.title)
                Spacer()
            }
            .navigationTitle("Assistant")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Writing Mode View
struct WritingModeView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                Text("Writing Mode")
                    .font(.title)
                Spacer()
            }
            .navigationTitle("Writing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Profile View (Updated from ContentView)
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

