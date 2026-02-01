//
//  LocationEditorView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI
import CoreLocation

struct LocationEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var userDataStore: UserDataStore
    
    let location: Location?
    
    // Editable fields
    @State private var name: String
    @State private var description: String
    @State private var equipment: [EquipmentItem]
    @State private var currentLocation: Bool
    @State private var geoData: CLLocationCoordinate2D?
    
    // UI State
    @State private var isSaving: Bool = false
    @State private var showError: Bool = false
    @State private var errorMessage: String = ""
    @State private var showDeleteConfirmation: Bool = false
    @State private var isDeleting: Bool = false
    @State private var showingMapPicker: Bool = false
    @State private var isRequestingLocation: Bool = false
    
    // Location service
    @StateObject private var locationService = LocationService.shared
    
    init(location: Location? = nil) {
        self.location = location
        
        if let loc = location {
            _name = State(initialValue: loc.name)
            _description = State(initialValue: loc.description ?? "")
            _equipment = State(initialValue: loc.equipment)
            _currentLocation = State(initialValue: loc.currentLocation)
            _geoData = State(initialValue: loc.geoData)
            
            // Debug: Print geoData to see if it's being initialized
            if let geoData = loc.geoData {
                print("📍 LocationEditorView init: geoData found - Lat: \(geoData.latitude), Lon: \(geoData.longitude)")
            } else {
                print("📍 LocationEditorView init: geoData is nil")
            }
        } else {
            _name = State(initialValue: "")
            _description = State(initialValue: "")
            _equipment = State(initialValue: [])
            _currentLocation = State(initialValue: false)
            _geoData = State(initialValue: nil)
        }
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.xl) {
                        // Name Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Location Name", systemImage: "location")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextField("e.g., Home Gym, Fitness Center", text: $name)
                                .textFieldStyle(CustomTextFieldStyle())
                        }
                        
                        // Description Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Description", systemImage: "text.alignleft")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextEditor(text: $description)
                                .frame(minHeight: 100)
                                .padding(AppTheme.Spacing.md)
                                .background(AppTheme.Colors.surface)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                                .scrollContentBackground(.hidden)
                        }
                        
                        // GPS Location Section
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("GPS Location", systemImage: "location.fill")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            VStack(spacing: AppTheme.Spacing.md) {
                                HStack(spacing: AppTheme.Spacing.md) {
                                    Button(action: {
                                        requestCurrentLocation()
                                    }) {
                                        HStack {
                                            if isRequestingLocation {
                                                ProgressView()
                                                    .scaleEffect(0.8)
                                                    .frame(width: 14, height: 14)
                                            } else {
                                                Image(systemName: "location.fill")
                                            }
                                            Text("Use Current Location")
                                        }
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .padding(.horizontal, AppTheme.Spacing.md)
                                        .padding(.vertical, AppTheme.Spacing.sm)
                                        .background(AppTheme.Colors.surface)
                                        .cornerRadius(AppTheme.CornerRadius.small)
                                    }
                                    .disabled(isRequestingLocation)
                                    
                                    Button(action: {
                                        showingMapPicker = true
                                    }) {
                                        HStack {
                                            Image(systemName: "map")
                                            Text("Set on Map")
                                        }
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .padding(.horizontal, AppTheme.Spacing.md)
                                        .padding(.vertical, AppTheme.Spacing.sm)
                                        .background(AppTheme.Colors.surface)
                                        .cornerRadius(AppTheme.CornerRadius.small)
                                    }
                                }
                                
                                if let geoData = geoData {
                                    HStack {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundColor(AppTheme.Colors.primaryText)
                                        Text("Lat: \(geoData.latitude, specifier: "%.6f"), Lon: \(geoData.longitude, specifier: "%.6f")")
                                            .font(.caption)
                                            .foregroundColor(AppTheme.Colors.secondaryText)
                                        Spacer()
                                        Button("Clear") {
                                            self.geoData = nil
                                        }
                                        .font(.caption)
                                        .foregroundColor(AppTheme.Colors.danger)
                                    }
                                    .padding(.horizontal, AppTheme.Spacing.md)
                                    .padding(.vertical, AppTheme.Spacing.sm)
                                    .background(AppTheme.Colors.surface)
                                    .cornerRadius(AppTheme.CornerRadius.small)
                                }
                            }
                        }
                        
                        // Equipment Section
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Equipment", systemImage: "dumbbell.fill")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            EquipmentInputView(equipment: $equipment)
                        }
                        
                        // Set as Current Location Toggle
                        Toggle(isOn: $currentLocation) {
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                Text("Set as current location")
                            }
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        }
                        .toggleStyle(SwitchToggleStyle(tint: AppTheme.Colors.primaryText))
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.vertical, AppTheme.Spacing.lg)
                }
            }
            .navigationTitle(location != nil ? "Edit Location" : "New Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        saveLocation()
                    }
                    .disabled(isSaving || name.isEmpty)
                }
            }
            .sheet(isPresented: $showingMapPicker) {
                LocationMapPickerView(selectedCoordinate: $geoData)
            }
            .alert("Error", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage)
            }
            .alert("Delete Location", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    deleteLocation()
                }
            } message: {
                Text("Are you sure you want to delete this location? This action cannot be undone.")
            }
        }
    }
    
    /// Request current location with user interaction (shows errors)
    private func requestCurrentLocation() {
        // Prevent multiple simultaneous requests
        guard !isRequestingLocation else {
            print("⚠️ requestCurrentLocation: Already requesting, ignoring duplicate request")
            return
        }
        
        isRequestingLocation = true
        
        Task {
            defer {
                Task { @MainActor in
                    isRequestingLocation = false
                }
            }
            
            do {
                // Check current authorization status
                let status = locationService.authorizationStatus
                
                // If permission is not determined, request it and wait for response
                if status == .notDetermined {
                    locationService.requestPermission()
                    let finalStatus = await locationService.waitForAuthorization()
                    
                    // If permission was denied, show error
                    if finalStatus != .authorizedWhenInUse && finalStatus != .authorizedAlways {
                        await MainActor.run {
                            if finalStatus == .denied || finalStatus == .restricted {
                                errorMessage = "Location permission denied. Please enable location access in Settings."
                            } else {
                                errorMessage = "Location permission is required to use your current location."
                            }
                            showError = true
                        }
                        return
                    }
                }
                
                // If permission was previously denied, show error with option to open settings
                if status == .denied || status == .restricted {
                    await MainActor.run {
                        errorMessage = "Location permission denied. Please enable location access in Settings."
                        showError = true
                    }
                    return
                }
                
                // Now try to get the location
                if let coordinate = try await locationService.getCurrentLocation() {
                    await MainActor.run {
                        self.geoData = coordinate
                    }
                } else {
                    await MainActor.run {
                        errorMessage = "Unable to determine current location. Please check your GPS settings and try again."
                        showError = true
                    }
                }
            } catch let error as LocationError {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    showError = true
                }
            } catch {
                await MainActor.run {
                    // Check if it's a CLError
                    if let clError = error as? CLError {
                        switch clError.code {
                        case .locationUnknown:
                            errorMessage = "Location temporarily unavailable. Please wait a moment and try again."
                        case .denied:
                            errorMessage = "Location permission denied. Please enable location access in Settings."
                        case .network:
                            errorMessage = "Network error while getting location. Please check your internet connection."
                        default:
                            errorMessage = "Unable to determine current location: \(error.localizedDescription)"
                        }
                    } else {
                        errorMessage = "Unable to determine current location: \(error.localizedDescription)"
                    }
                    showError = true
                }
            }
        }
    }
    
    private func saveLocation() {
        guard !name.isEmpty else { return }
        
        isSaving = true
        
        Task {
            do {
                if let existingLocation = location {
                    // Update existing - create new Location with updated values
                    let updatedLocation = Location(
                        id: existingLocation.id,
                        name: name,
                        description: description.isEmpty ? nil : description,
                        equipment: equipment,
                        currentLocation: currentLocation,
                        geoData: geoData,
                        createdAt: existingLocation.createdAt
                    )
                    try await userDataStore.updateLocation(updatedLocation)
                } else {
                    // Create new - Location struct needs a valid id, but we'll create a temporary one
                    // The actual id will be assigned by the database
                    let newLocation = Location(
                        id: 0, // Temporary, will be replaced by database
                        name: name,
                        description: description.isEmpty ? nil : description,
                        equipment: equipment,
                        currentLocation: currentLocation,
                        geoData: geoData,
                        createdAt: nil
                    )
                    try await userDataStore.createLocation(newLocation)
                }
                
                await MainActor.run {
                    isSaving = false
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = error.localizedDescription
                    showError = true
                }
            }
        }
    }
    
    private func deleteLocation() {
        guard let location = location else { return }
        
        isDeleting = true
        Task {
            do {
                try await userDataStore.deleteLocation(id: location.id)
                await MainActor.run {
                    isDeleting = false
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    isDeleting = false
                    errorMessage = error.localizedDescription
                    showError = true
                }
            }
        }
    }
}

// MARK: - Custom Text Field Style

private struct CustomTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(AppTheme.Spacing.md)
            .background(AppTheme.Colors.surface)
            .cornerRadius(AppTheme.CornerRadius.medium)
    }
}

#Preview {
    LocationEditorView(location: nil)
        .environmentObject(UserDataStore.shared)
}
