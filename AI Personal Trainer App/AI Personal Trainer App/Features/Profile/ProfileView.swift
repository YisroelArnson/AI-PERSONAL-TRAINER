//
//  ProfileView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI
import CoreLocation

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var userSettings = UserSettings.shared
    @StateObject private var locationService = LocationService.shared
    @StateObject private var exerciseStore = ExerciseStore.shared
    
    @State private var showPermissionAlert = false
    @State private var showSettingsAlert = false
    @State private var isRequestingPermission = false
    @State private var hoursInputText: String = ""
    
    // Track initial unit values to detect changes
    @State private var initialWeightUnit: WeightUnit?
    @State private var initialDistanceUnit: DistanceUnit?
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.xxl) {
                        // Settings Section
                        settingsSection
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.top, AppTheme.Spacing.xl)
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        handleDismiss()
                    }
                }
            }
            .alert("Location Permission Required", isPresented: $showPermissionAlert) {
                Button("Cancel", role: .cancel) {
                    userSettings.isAutoDetectLocationEnabled = false
                }
            } message: {
                Text("Please select 'Allow While Using App' to enable auto-detect location. This allows the app to automatically switch to your nearest saved location when you open the app.")
            }
            .alert("Location Permission Needed", isPresented: $showSettingsAlert) {
                Button("Open Settings", role: .none) {
                    if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(settingsUrl)
                    }
                }
                Button("Cancel", role: .cancel) {
                    userSettings.isAutoDetectLocationEnabled = false
                }
            } message: {
                Text("Location access is currently denied. To enable auto-detect, please go to Settings and allow location access 'While Using App'.")
            }
            .task {
                // Fetch user settings from database when view appears
                await userSettings.fetchSettings()
                
                // Capture initial values after fetch to detect changes on dismiss
                initialWeightUnit = userSettings.weightUnit
                initialDistanceUnit = userSettings.distanceUnit
            }
        }
    }
    
    // MARK: - Settings Section
    
    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text("Settings")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.horizontal, AppTheme.Spacing.md)
            
            VStack(spacing: 0) {
                // Weight Unit Picker
                weightUnitRow
                
                Divider()
                    .background(AppTheme.Colors.border)
                
                // Distance Unit Picker
                distanceUnitRow
                
                Divider()
                    .background(AppTheme.Colors.border)
                
                // Auto-Detect Location Toggle
                autoDetectLocationRow
                
                // Permission status info (if toggle is ON but no permission)
                if userSettings.isAutoDetectLocationEnabled && !hasLocationPermission {
                    permissionStatusRow
                }
                
                Divider()
                    .background(AppTheme.Colors.border)
                
                // Auto-Refresh Exercises Toggle
                autoRefreshExercisesRow
                
                // Hours input (only visible when toggle is ON)
                if userSettings.isAutoRefreshExercisesEnabled {
                    autoRefreshHoursRow
                }
            }
            .background(AppTheme.Colors.cardBackground)
            .cornerRadius(AppTheme.CornerRadius.medium)
            .shadow(
                color: AppTheme.Shadow.card,
                radius: AppTheme.Shadow.cardRadius,
                x: AppTheme.Shadow.cardOffset.width,
                y: AppTheme.Shadow.cardOffset.height
            )
        }
    }
    
    private var autoDetectLocationRow: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Toggle(isOn: $userSettings.isAutoDetectLocationEnabled) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Auto-Detect Location")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    
                    Text("Automatically switch to your nearest saved location (within 500m) when you open the app.")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .toggleStyle(SwitchToggleStyle(tint: AppTheme.Colors.primaryText))
            .disabled(isRequestingPermission)
            .onChange(of: userSettings.isAutoDetectLocationEnabled) { oldValue, newValue in
                if newValue {
                    handleToggleOn()
                }
            }
        }
        .padding(AppTheme.Spacing.md)
    }
    
    private var permissionStatusRow: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Divider()
                .background(AppTheme.Colors.border)
            
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(.orange)
                
                Text("Location permission needed")
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.secondaryText)
                
                Spacer()
                
                Button(action: {
                    if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(settingsUrl)
                    }
                }) {
                    Text("Grant Access")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(AppTheme.Colors.background)
                        .cornerRadius(AppTheme.CornerRadius.small)
                }
            }
            .padding(AppTheme.Spacing.md)
        }
    }
    
    private var autoRefreshExercisesRow: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Toggle(isOn: $userSettings.isAutoRefreshExercisesEnabled) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Auto-Refresh Exercises")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                    
                    Text("Automatically fetch new exercises when you open the app after the specified time has passed.")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .toggleStyle(SwitchToggleStyle(tint: AppTheme.Colors.primaryText))
            .onChange(of: userSettings.isAutoRefreshExercisesEnabled) { _, newValue in
                if newValue {
                    // Initialize the text field with current value
                    hoursInputText = String(userSettings.autoRefreshExercisesHours)
                }
            }
        }
        .padding(AppTheme.Spacing.md)
    }
    
    private var autoRefreshHoursRow: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Divider()
                .background(AppTheme.Colors.border)
            
            HStack(spacing: AppTheme.Spacing.md) {
                Text("Refresh after")
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                TextField("12", text: $hoursInputText)
                    .keyboardType(.numberPad)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .frame(width: 50)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(AppTheme.Colors.background)
                    .cornerRadius(AppTheme.CornerRadius.small)
                    .onChange(of: hoursInputText) { _, newValue in
                        // Filter to only digits
                        let filtered = newValue.filter { $0.isNumber }
                        if filtered != newValue {
                            hoursInputText = filtered
                        }
                        // Update the setting
                        if let hours = Int(filtered), hours > 0 {
                            userSettings.autoRefreshExercisesHours = hours
                        }
                    }
                
                Text("hours")
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                
                Spacer()
            }
            .padding(AppTheme.Spacing.md)
        }
        .onAppear {
            hoursInputText = String(userSettings.autoRefreshExercisesHours)
        }
    }
    
    // MARK: - Unit Preference Rows
    
    private var weightUnitRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Weight Unit")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Text("Used for exercise weights and body stats")
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            
            Spacer()
            
            Picker("Weight", selection: Binding(
                get: { userSettings.weightUnit },
                set: { newValue in
                    Task {
                        await userSettings.updateWeightUnit(newValue)
                    }
                }
            )) {
                ForEach(WeightUnit.allCases, id: \.self) { unit in
                    Text(unit.rawValue).tag(unit)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 120)
        }
        .padding(AppTheme.Spacing.md)
    }
    
    private var distanceUnitRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Distance Unit")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Text("Used for cardio and running exercises")
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            
            Spacer()
            
            Picker("Distance", selection: Binding(
                get: { userSettings.distanceUnit },
                set: { newValue in
                    Task {
                        await userSettings.updateDistanceUnit(newValue)
                    }
                }
            )) {
                ForEach(DistanceUnit.allCases, id: \.self) { unit in
                    Text(unit.rawValue).tag(unit)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 120)
        }
        .padding(AppTheme.Spacing.md)
    }
    
    // MARK: - Dismiss Handler
    
    private func handleDismiss() {
        // Check if unit settings changed during this session
        let weightChanged = initialWeightUnit != nil && initialWeightUnit != userSettings.weightUnit
        let distanceChanged = initialDistanceUnit != nil && initialDistanceUnit != userSettings.distanceUnit
        
        if weightChanged || distanceChanged {
            // Units changed - trigger refresh to get exercises in new units
            print("📐 Unit settings changed - triggering exercise refresh")
            exerciseStore.triggerRefresh()
        }
        
        dismiss()
    }
    
    // MARK: - Permission Helpers
    
    private var hasLocationPermission: Bool {
        locationService.authorizationStatus == .authorizedWhenInUse ||
        locationService.authorizationStatus == .authorizedAlways
    }
    
    private func handleToggleOn() {
        let status = locationService.authorizationStatus
        
        // If already authorized, nothing to do
        if hasLocationPermission {
            return
        }
        
        // If permission was previously denied, show alert to open Settings
        if status == .denied || status == .restricted {
            showSettingsAlert = true
            return
        }
        
        // If permission not determined, request it
        if status == .notDetermined {
            isRequestingPermission = true
            showPermissionAlert = true
            
            Task {
                locationService.requestPermission()
                let finalStatus = await locationService.waitForAuthorization()
                
                await MainActor.run {
                    isRequestingPermission = false
                    
                    // Check if user granted "While Using App" permission
                    if finalStatus != .authorizedWhenInUse && finalStatus != .authorizedAlways {
                        // User either denied or chose "Allow Once"
                        userSettings.isAutoDetectLocationEnabled = false
                        
                        if finalStatus == .denied || finalStatus == .restricted {
                            // Show settings alert for explicit denial
                            showSettingsAlert = true
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    ProfileView()
}

