//
//  LocationsListSheet.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

// MARK: - Editor Location Wrapper

private struct EditorLocation: Identifiable {
    let id: UUID
    let location: Location?
    
    init(location: Location?) {
        self.location = location
        // Use a UUID for the wrapper ID - always unique
        self.id = UUID()
    }
}

struct LocationsListSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var userDataStore: UserDataStore
    
    @Binding var selectedLocation: Location?
    @Binding var shouldShowEditor: Bool
    @State private var showingDeleteConfirmation: Bool = false
    @State private var locationToDelete: Location?
    @State private var isDeleting: Bool = false
    @State private var deleteError: String?
    @State private var editingLocation: EditorLocation? = nil
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                if userDataStore.locations.isEmpty {
                    // Empty state
                    VStack(spacing: AppTheme.Spacing.lg) {
                        Image(systemName: "location.slash")
                            .font(.system(size: 48))
                            .foregroundColor(AppTheme.Colors.secondaryText)
                        
                        Text("No locations yet")
                            .font(.headline)
                            .foregroundColor(AppTheme.Colors.primaryText)
                        
                        Text("Add your first location to get started")
                            .font(.caption)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .multilineTextAlignment(.center)
                        
                        Button(action: {
                            editingLocation = EditorLocation(location: nil)
                        }) {
                            Text("Add Location")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, AppTheme.Spacing.xl)
                                .padding(.vertical, AppTheme.Spacing.md)
                                .background(AppTheme.Colors.primaryText)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                        }
                    }
                    .padding(AppTheme.Spacing.xxl)
                } else {
                    ScrollView {
                        VStack(spacing: AppTheme.Spacing.md) {
                            ForEach(userDataStore.locations) { location in
                                LocationRow(
                                    location: location,
                                    isCurrent: location.currentLocation,
                                    onTap: {
                                        editingLocation = EditorLocation(location: location)
                                    },
                                    onSetCurrent: {
                                        Task {
                                            try? await userDataStore.setCurrentLocation(location.id)
                                        }
                                    },
                                    onDelete: {
                                        locationToDelete = location
                                        showingDeleteConfirmation = true
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, AppTheme.Spacing.xl)
                        .padding(.vertical, AppTheme.Spacing.lg)
                    }
                }
            }
            .navigationTitle("Locations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        shouldShowEditor = false
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        editingLocation = EditorLocation(location: nil)
                    }) {
                        Image(systemName: "plus")
                            .font(.system(size: 16, weight: .semibold))
                    }
                }
            }
            .alert("Delete Location", isPresented: $showingDeleteConfirmation) {
                Button("Cancel", role: .cancel) {
                    locationToDelete = nil
                }
                Button("Delete", role: .destructive) {
                    if let location = locationToDelete {
                        deleteLocation(location)
                    }
                }
            } message: {
                if let location = locationToDelete {
                    Text("Are you sure you want to delete \"\(location.name)\"? This action cannot be undone.")
                }
            }
            .sheet(item: $editingLocation) { editorLocation in
                LocationEditorView(location: editorLocation.location)
                    .environmentObject(userDataStore)
            }
        }
    }
    
    private func deleteLocation(_ location: Location) {
        isDeleting = true
        Task {
            do {
                try await userDataStore.deleteLocation(id: location.id)
                isDeleting = false
            } catch {
                await MainActor.run {
                    deleteError = error.localizedDescription
                    isDeleting = false
                }
            }
        }
    }
}

// MARK: - Location Row

private struct LocationRow: View {
    let location: Location
    let isCurrent: Bool
    let onTap: () -> Void
    let onSetCurrent: () -> Void
    let onDelete: () -> Void
    
    var body: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            // Current location indicator
            if isCurrent {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.green)
            } else {
                Image(systemName: "circle")
                    .font(.system(size: 20))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            
            // Location info
            VStack(alignment: .leading, spacing: 4) {
                Text(location.name)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                if let description = location.description, !description.isEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .lineLimit(2)
                }
                
                HStack(spacing: AppTheme.Spacing.sm) {
                    Label("\(location.equipment.count)", systemImage: "dumbbell.fill")
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                    
                    if location.geoData != nil {
                        Label("GPS", systemImage: "location.fill")
                            .font(.caption2)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                }
            }
            
            Spacer()
            
            // Set as current button (if not already current)
            if !isCurrent {
                Button(action: onSetCurrent) {
                    Text("Set Current")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .padding(.horizontal, AppTheme.Spacing.md)
                        .padding(.vertical, AppTheme.Spacing.xs)
                        .background(AppTheme.Colors.cardBackground)
                        .cornerRadius(AppTheme.CornerRadius.small)
                        .overlay(
                            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                .stroke(AppTheme.Colors.border, lineWidth: 1)
                        )
                }
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(AppTheme.Colors.cardBackground)
        .cornerRadius(AppTheme.CornerRadius.medium)
        .shadow(
            color: AppTheme.Shadow.card,
            radius: AppTheme.Shadow.cardRadius,
            x: AppTheme.Shadow.cardOffset.width,
            y: AppTheme.Shadow.cardOffset.height
        )
        .contentShape(Rectangle())
        .onTapGesture {
            onTap()
        }
        .contextMenu {
            Button(action: onTap) {
                Label("Edit", systemImage: "pencil")
            }
            
            if !isCurrent {
                Button(action: onSetCurrent) {
                    Label("Set as Current", systemImage: "checkmark.circle")
                }
            }
            
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
    }
}

#Preview {
    LocationsListSheet(
        selectedLocation: .constant(nil),
        shouldShowEditor: .constant(false)
    )
        .environmentObject(UserDataStore.shared)
}

