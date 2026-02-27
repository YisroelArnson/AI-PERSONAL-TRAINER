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
    @State private var equipment: String
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
            _equipment = State(initialValue: "")
            _currentLocation = State(initialValue: false)
            _geoData = State(initialValue: nil)
        }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving
    }

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 16) {
                        // Name
                        fieldBlock(title: "Name") {
                            TextField("e.g., Home Gym, Fitness Center", text: $name)
                                .textFieldStyle(EditorTextFieldStyle())
                        }

                        // Description
                        fieldBlock(title: "Description") {
                            TextField("Add details about this training spot", text: $description, axis: .vertical)
                                .lineLimit(2...10)
                                .font(.system(size: 15, weight: .medium))
                        }

                        // Equipment
                        fieldBlock(title: "Equipment") {
                            TextEditor(text: $equipment)
                                .font(.system(size: 15, weight: .medium))
                                .frame(minHeight: 120)
                                .scrollContentBackground(.hidden)
                                .overlay(alignment: .topLeading) {
                                    if equipment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text("- Dumbbells: 15-30 lb\n- Barbell + plates\n- Adjustable bench\n- Pull-up bar")
                                            .font(.system(size: 14, weight: .regular))
                                            .foregroundColor(AppTheme.Colors.tertiaryText)
                                            .padding(.top, 8)
                                            .padding(.leading, 5)
                                            .allowsHitTesting(false)
                                    }
                                }
                        }

                        // GPS
                        fieldBlock(title: "GPS Location") {
                            Text("Used for automatic location switching and better equipment context.")
                                .font(.system(size: 12, weight: .regular))
                                .foregroundColor(AppTheme.Colors.secondaryText)

                            HStack(spacing: 10) {
                                secondaryActionButton(
                                    title: "Current Location",
                                    icon: "location.fill",
                                    isLoading: isRequestingLocation
                                ) {
                                    requestCurrentLocation()
                                }
                                .disabled(isRequestingLocation)

                                secondaryActionButton(title: "Set on Map", icon: "map") {
                                    showingMapPicker = true
                                }
                            }

                            geoDataRow
                        }

                        // Set as current
                        fieldBlock(title: "Current Location") {
                            Toggle(isOn: $currentLocation) {
                                HStack(spacing: 10) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 16))
                                        .foregroundColor(currentLocation ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryText)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Set as current location")
                                            .font(.system(size: 15, weight: .medium))
                                            .foregroundColor(AppTheme.Colors.primaryText)
                                        Text("Use this location for today's workouts")
                                            .font(.system(size: 12))
                                            .foregroundColor(AppTheme.Colors.secondaryText)
                                    }
                                }
                            }
                            .toggleStyle(SwitchToggleStyle(tint: AppTheme.Colors.primaryText))
                        }

                        if location != nil {
                            Button(role: .destructive) {
                                showDeleteConfirmation = true
                            } label: {
                                HStack {
                                    Image(systemName: "trash")
                                    Text("Delete Location")
                                }
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(AppTheme.Colors.danger)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(AppTheme.Colors.surface)
                                .cornerRadius(AppTheme.CornerRadius.large)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 24)
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
            }
            .safeAreaInset(edge: .bottom) {
                bottomSaveButton
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

    @ViewBuilder
    private var geoDataRow: some View {
        if let geoData = geoData {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .font(.system(size: 14))
                Text("Lat: \(geoData.latitude, specifier: "%.6f"), Lon: \(geoData.longitude, specifier: "%.6f")")
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer()
                Button("Clear") {
                    self.geoData = nil
                }
                .font(.caption)
                .foregroundColor(AppTheme.Colors.danger)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(AppTheme.Colors.surfaceHover)
            .cornerRadius(AppTheme.CornerRadius.medium)
        } else {
            HStack(spacing: 8) {
                Image(systemName: "mappin.slash")
                    .font(.system(size: 13, weight: .semibold))
                Text("No GPS pin saved")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(AppTheme.Colors.secondaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(AppTheme.Colors.surfaceHover)
            .cornerRadius(AppTheme.CornerRadius.medium)
        }
    }

    private var bottomSaveButton: some View {
        VStack(spacing: 0) {
            Button(action: saveLocation) {
                HStack {
                    if isSaving {
                        ProgressView()
                            .tint(AppTheme.Colors.background)
                            .scaleEffect(0.85)
                    } else {
                        Text(location != nil ? "Save Changes" : "Create Location")
                    }
                }
                .font(AppTheme.Typography.button)
                .foregroundColor(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(canSave ? AppTheme.Colors.accent : AppTheme.Colors.accent.opacity(0.4))
                .cornerRadius(AppTheme.CornerRadius.pill)
            }
            .disabled(!canSave)
            .padding(.horizontal, 20)
            .padding(.top, AppTheme.Spacing.md)
            .padding(.bottom, AppTheme.Spacing.md)
        }
        .background(AppTheme.Colors.background)
    }

    private func fieldBlock<HeaderAccessory: View, Content: View>(
        title: String,
        @ViewBuilder headerAccessory: () -> HeaderAccessory = { EmptyView() },
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.6)
                    .foregroundColor(AppTheme.Colors.secondaryText)
                Spacer()
                headerAccessory()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 8)

            VStack(alignment: .leading, spacing: 10) {
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func secondaryActionButton(
        title: String,
        icon: String,
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                        .frame(width: 14, height: 14)
                } else {
                    Image(systemName: icon)
                }
                Text(title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(AppTheme.Colors.primaryText)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12)
            .padding(.vertical, 14)
            .background(AppTheme.Colors.surfaceHover)
            .cornerRadius(AppTheme.CornerRadius.medium)
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                    .stroke(AppTheme.Colors.primaryText.opacity(0.08), lineWidth: 1)
            )
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
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }

        isSaving = true

        Task {
            do {
                if let existingLocation = location {
                    // Update existing - create new Location with updated values
                    let updatedLocation = Location(
                        id: existingLocation.id,
                        name: trimmedName,
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
                        name: trimmedName,
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

private struct EditorTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(.system(size: 15, weight: .medium))
    }
}

#Preview {
    LocationEditorView(location: nil)
        .environmentObject(UserDataStore.shared)
}
