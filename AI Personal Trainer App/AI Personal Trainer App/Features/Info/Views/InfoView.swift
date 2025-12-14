//
//  InfoView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct InfoView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var userDataStore: UserDataStore
    
    // Active Preferences state
    @State private var showingAddPreference = false
    @State private var selectedPreference: UserPreference? = nil
    
    // Category Goals state
    @State private var showingCategoryAIAssist = false
    @State private var showingCategoryGoalSetter = false
    
    // Muscle Goals state
    @State private var showingMuscleAIAssist = false
    @State private var showingMuscleGoalSetter = false
    
    // Location state
    @State private var showingLocationsList = false
    @State private var selectedLocation: Location? = nil
    @State private var showingLocationEditor = false
    @State private var shouldShowLocationEditor = false
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.lg) {
                        // Current Location Pill
                        CurrentLocationPill(showingLocationsList: $showingLocationsList)
                            .padding(.horizontal, AppTheme.Spacing.xl)
                            .padding(.top, AppTheme.Spacing.md)
                        
                        VStack(spacing: AppTheme.Spacing.xxl) {
                            // Section 1: Active Preferences
                            ActivePreferencesSection(
                                showingAddPreference: $showingAddPreference,
                                selectedPreference: $selectedPreference
                            )
                            
                            // Section 2: Category Goals
                            CategoryGoalsSection(
                                showingCategoryAIAssist: $showingCategoryAIAssist,
                                showingCategoryGoalSetter: $showingCategoryGoalSetter
                            )
                            
                            // Section 3: Muscle Goals
                            MuscleGoalsSection(
                                showingMuscleAIAssist: $showingMuscleAIAssist,
                                showingMuscleGoalSetter: $showingMuscleGoalSetter
                            )
                        }
                        .padding(.horizontal, AppTheme.Spacing.xl)
                        .padding(.top, AppTheme.Spacing.xl)
                        .padding(.bottom, 40)
                    }
                }
            }
            .navigationTitle("Info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            // Active Preferences sheets
            .sheet(isPresented: $showingAddPreference) {
                AddPreferenceSheet()
                    .environmentObject(userDataStore)
            }
            .sheet(item: $selectedPreference) { preference in
                PreferenceManagerView(preference: preference)
            }
            // Category Goals sheets
            .sheet(isPresented: $showingCategoryAIAssist) {
                CategoryGoalsAIAssistSheet()
            }
            .sheet(isPresented: $showingCategoryGoalSetter) {
                CategoryGoalSetterView()
                    .environmentObject(userDataStore)
            }
            // Muscle Goals sheets
            .sheet(isPresented: $showingMuscleAIAssist) {
                MuscleGoalsAIAssistSheet()
            }
            .sheet(isPresented: $showingMuscleGoalSetter) {
                MuscleGoalSetterView()
                    .environmentObject(userDataStore)
            }
            // Location sheets
            .sheet(isPresented: $showingLocationsList) {
                LocationsListSheet(
                    selectedLocation: $selectedLocation,
                    shouldShowEditor: $shouldShowLocationEditor
                )
                    .environmentObject(userDataStore)
            }
        }
    }
}

// MARK: - Info Content View (for full-page navigation)

struct InfoContentView: View {
    @EnvironmentObject var userDataStore: UserDataStore
    
    // Active Preferences state
    @State private var showingAddPreference = false
    @State private var selectedPreference: UserPreference? = nil
    
    // Category Goals state
    @State private var showingCategoryAIAssist = false
    @State private var showingCategoryGoalSetter = false
    
    // Muscle Goals state
    @State private var showingMuscleAIAssist = false
    @State private var showingMuscleGoalSetter = false
    
    // Location state
    @State private var showingLocationsList = false
    @State private var selectedLocation: Location? = nil
    @State private var showingLocationEditor = false
    @State private var shouldShowLocationEditor = false
    
    var body: some View {
        ScrollView {
            VStack(spacing: AppTheme.Spacing.lg) {
                // Current Location Pill
                CurrentLocationPill(showingLocationsList: $showingLocationsList)
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.top, AppTheme.Spacing.md)
                
                VStack(spacing: AppTheme.Spacing.xxl) {
                    // Section 1: Active Preferences
                    ActivePreferencesSection(
                        showingAddPreference: $showingAddPreference,
                        selectedPreference: $selectedPreference
                    )
                    
                    // Section 2: Category Goals
                    CategoryGoalsSection(
                        showingCategoryAIAssist: $showingCategoryAIAssist,
                        showingCategoryGoalSetter: $showingCategoryGoalSetter
                    )
                    
                    // Section 3: Muscle Goals
                    MuscleGoalsSection(
                        showingMuscleAIAssist: $showingMuscleAIAssist,
                        showingMuscleGoalSetter: $showingMuscleGoalSetter
                    )
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.top, AppTheme.Spacing.xl)
                .padding(.bottom, 40)
            }
        }
        // Active Preferences sheets
        .sheet(isPresented: $showingAddPreference) {
            AddPreferenceSheet()
                .environmentObject(userDataStore)
        }
        .sheet(item: $selectedPreference) { preference in
            PreferenceManagerView(preference: preference)
        }
        // Category Goals sheets
        .sheet(isPresented: $showingCategoryAIAssist) {
            CategoryGoalsAIAssistSheet()
        }
        .sheet(isPresented: $showingCategoryGoalSetter) {
            CategoryGoalSetterView()
                .environmentObject(userDataStore)
        }
        // Muscle Goals sheets
        .sheet(isPresented: $showingMuscleAIAssist) {
            MuscleGoalsAIAssistSheet()
        }
        .sheet(isPresented: $showingMuscleGoalSetter) {
            MuscleGoalSetterView()
                .environmentObject(userDataStore)
        }
        // Location sheets
        .sheet(isPresented: $showingLocationsList) {
            LocationsListSheet(
                selectedLocation: $selectedLocation,
                shouldShowEditor: $shouldShowLocationEditor
            )
                .environmentObject(userDataStore)
        }
    }
}

#Preview {
    InfoView()
        .environmentObject(UserDataStore.shared)
}

