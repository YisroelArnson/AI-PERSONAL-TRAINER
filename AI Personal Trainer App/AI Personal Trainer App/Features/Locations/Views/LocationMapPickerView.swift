//
//  LocationMapPickerView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI
import MapKit
import CoreLocation

struct LocationMapPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedCoordinate: CLLocationCoordinate2D?
    
    @State private var cameraPosition: MapCameraPosition
    @State private var annotationCoordinate: CLLocationCoordinate2D?
    @StateObject private var locationService = LocationService.shared
    @State private var showError: Bool = false
    @State private var errorMessage: String = ""
    @State private var isRequestingLocation: Bool = false
    
    init(selectedCoordinate: Binding<CLLocationCoordinate2D?>) {
        self._selectedCoordinate = selectedCoordinate
        
        // Initialize camera position with selected coordinate or default location
        if let coordinate = selectedCoordinate.wrappedValue {
            let initialRegion = MKCoordinateRegion(
                center: coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
            )
            _cameraPosition = State(initialValue: .region(initialRegion))
            _annotationCoordinate = State(initialValue: coordinate)
        } else {
            // Default to a central location (can be changed to user's current location)
            let defaultCoordinate = CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
            let initialRegion = MKCoordinateRegion(
                center: defaultCoordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.1, longitudeDelta: 0.1)
            )
            _cameraPosition = State(initialValue: .region(initialRegion))
        }
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Map(position: $cameraPosition) {
                    if let coordinate = annotationCoordinate {
                        Annotation("Selected Location", coordinate: coordinate) {
                            Image(systemName: "mappin.circle.fill")
                                .foregroundColor(AppTheme.Colors.primaryText)
                                .font(.system(size: 30))
                        }
                    }
                }
                .onMapCameraChange { context in
                    annotationCoordinate = context.region.center
                }
                .ignoresSafeArea()
                
                // Center indicator
                VStack {
                    Spacer()
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 40))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .offset(y: -20)
                    Spacer()
                }
                
                // Controls overlay
                VStack {
                    Spacer()
                    HStack(spacing: AppTheme.Spacing.md) {
                        Button(action: {
                            useCurrentLocation()
                        }) {
                            HStack {
                                if isRequestingLocation {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                        .frame(width: 14, height: 14)
                                        .tint(AppTheme.Colors.background)
                                } else {
                                    Image(systemName: "location.fill")
                                }
                                Text("Current Location")
                            }
                            .font(AppTheme.Typography.button)
                            .foregroundColor(AppTheme.Colors.primaryText)
                            .padding(.horizontal, AppTheme.Spacing.md)
                            .padding(.vertical, AppTheme.Spacing.sm)
                            .background(AppTheme.Colors.surface)
                            .cornerRadius(AppTheme.CornerRadius.medium)
                        }
                        .disabled(isRequestingLocation)
                        
                        Spacer()
                        
                        Button(action: {
                            confirmLocation()
                        }) {
                            Text("Confirm")
                                .font(AppTheme.Typography.button)
                                .foregroundColor(AppTheme.Colors.background)
                                .padding(.horizontal, AppTheme.Spacing.xl)
                                .padding(.vertical, AppTheme.Spacing.sm)
                                .background(AppTheme.Colors.accent)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.bottom, AppTheme.Spacing.xl)
                }
            }
            .navigationTitle("Select Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .alert("Error", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage)
            }
        }
    }
    
    private func useCurrentLocation() {
        // Prevent multiple simultaneous requests
        guard !isRequestingLocation else {
            print("⚠️ useCurrentLocation: Already requesting, ignoring duplicate request")
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
                
                // If permission was previously denied, show error
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
                        let newRegion = MKCoordinateRegion(
                            center: coordinate,
                            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                        )
                        cameraPosition = .region(newRegion)
                        annotationCoordinate = coordinate
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    showError = true
                }
            }
        }
    }
    
    private func confirmLocation() {
        if let coordinate = annotationCoordinate {
            selectedCoordinate = coordinate
        }
        dismiss()
    }
}

#Preview {
    LocationMapPickerView(selectedCoordinate: .constant(nil))
}
