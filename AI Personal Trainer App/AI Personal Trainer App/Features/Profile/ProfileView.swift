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
    
    @State private var showPermissionAlert = false
    @State private var showSettingsAlert = false
    @State private var isRequestingPermission = false
    
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
                    Button("Done") { dismiss() }
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
                // Auto-Detect Location Toggle
                autoDetectLocationRow
                
                // Permission status info (if toggle is ON but no permission)
                if userSettings.isAutoDetectLocationEnabled && !hasLocationPermission {
                    permissionStatusRow
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

