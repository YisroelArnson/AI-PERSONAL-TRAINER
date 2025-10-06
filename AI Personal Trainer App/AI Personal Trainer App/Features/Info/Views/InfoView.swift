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
    @State private var showingPreferencesManager = false
    
    // Category Goals state
    @State private var showingCategoryAIAssist = false
    @State private var showingCategoryGoalSetter = false
    
    // Muscle Goals state
    @State private var showingMuscleAIAssist = false
    @State private var showingMuscleGoalSetter = false
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.xxl) {
                        // Section 1: Active Preferences
                        ActivePreferencesSection(
                            showingAddPreference: $showingAddPreference,
                            showingPreferencesManager: $showingPreferencesManager
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
            }
            .sheet(isPresented: $showingPreferencesManager) {
                PreferencesManagerView()
            }
            // Category Goals sheets
            .sheet(isPresented: $showingCategoryAIAssist) {
                CategoryGoalsAIAssistSheet()
            }
            .sheet(isPresented: $showingCategoryGoalSetter) {
                CategoryGoalSetterView()
            }
            // Muscle Goals sheets
            .sheet(isPresented: $showingMuscleAIAssist) {
                MuscleGoalsAIAssistSheet()
            }
            .sheet(isPresented: $showingMuscleGoalSetter) {
                MuscleGoalSetterView()
            }
        }
    }
}

#Preview {
    InfoView()
        .environmentObject(UserDataStore.shared)
}

