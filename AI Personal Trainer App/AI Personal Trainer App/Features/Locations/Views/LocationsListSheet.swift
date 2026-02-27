//
//  LocationsListSheet.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

// MARK: - Editor Location Wrapper

private struct EditorLocation: Identifiable, Equatable {
    let id: UUID
    let location: Location?

    init(location: Location?) {
        self.location = location
        // Use a UUID for the wrapper ID - always unique
        self.id = UUID()
    }

    static func == (lhs: EditorLocation, rhs: EditorLocation) -> Bool {
        return lhs.id == rhs.id && lhs.location == rhs.location
    }
}

struct LocationsListSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var userDataStore: UserDataStore

    @Binding var selectedLocation: Location?
    @Binding var shouldShowEditor: Bool
    var showsNavigationChrome: Bool = true
    @State private var showingDeleteConfirmation: Bool = false
    @State private var locationToDelete: Location?
    @State private var isDeleting: Bool = false
    @State private var deleteError: String?
    @State private var editingLocation: EditorLocation? = nil

    var body: some View {
        Group {
            if showsNavigationChrome {
                NavigationView {
                    content
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
                                addButton
                            }
                        }
                }
            } else {
                content
            }
        }
        .sheet(item: $editingLocation) { editorLocation in
            LocationEditorView(location: editorLocation.location)
                .environmentObject(userDataStore)
        }
        .onChange(of: editingLocation) { oldValue, newValue in
            if newValue == nil {
                shouldShowEditor = false
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
    }

    private var content: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                if !showsNavigationChrome {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Your Locations")
                                .font(AppTheme.Typography.screenTitle)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            Spacer()
                            addButton
                        }
                        Text("Pick your current training spot so workouts match your setup.")
                            .font(AppTheme.Typography.cardSubtitle)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 16)
                }

                if userDataStore.locations.isEmpty {
                    emptyState
                } else {
                    List {
                        ForEach(userDataStore.locations) { location in
                            LocationRow(
                                location: location,
                                isCurrent: location.currentLocation,
                                onTap: {
                                    guard !location.currentLocation else { return }
                                    Task {
                                        try? await userDataStore.setCurrentLocation(location.id)
                                    }
                                },
                                onEdit: {
                                    editingLocation = EditorLocation(location: location)
                                },
                                onDelete: {
                                    locationToDelete = location
                                    showingDeleteConfirmation = true
                                }
                            )
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(
                                top: AppTheme.Spacing.xs,
                                leading: 20,
                                bottom: AppTheme.Spacing.xs,
                                trailing: 20
                            ))
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
        }
    }

    private var addButton: some View {
        Button(action: {
            editingLocation = EditorLocation(location: nil)
        }) {
            Image(systemName: "plus")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 44, height: 44)
                .background(AppTheme.Colors.surface)
                .clipShape(Circle())
        }
    }

    private var emptyState: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            ZStack {
                Circle()
                    .fill(AppTheme.Colors.surface)
                    .frame(width: 80, height: 80)
                Image(systemName: "mappin.slash")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }

            VStack(spacing: AppTheme.Spacing.sm) {
                Text("No locations yet")
                    .font(AppTheme.Typography.screenTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text("Add where you train so workouts match your equipment.")
                    .font(AppTheme.Typography.cardSubtitle)
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
            }

            Button(action: {
                editingLocation = EditorLocation(location: nil)
            }) {
                HStack(spacing: 8) {
                    Image(systemName: "plus.circle.fill")
                    Text("Add Location")
                }
                .font(AppTheme.Typography.button)
                .foregroundColor(AppTheme.Colors.background)
                .padding(.horizontal, AppTheme.Spacing.xl)
                .padding(.vertical, AppTheme.Spacing.md)
                .background(AppTheme.Colors.accent)
                .cornerRadius(AppTheme.CornerRadius.medium)
            }
        }
        .padding(AppTheme.Spacing.xxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: AppTheme.Spacing.md) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 7) {
                    Text(location.name)
                        .font(AppTheme.Typography.cardTitle)
                        .foregroundColor(AppTheme.Colors.primaryText)
                    if isCurrent {
                        Text("Current")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(AppTheme.Colors.background)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(AppTheme.Colors.primaryText)
                            .clipShape(Capsule())
                    }
                }

                if let desc = location.description, !desc.isEmpty {
                    Text(desc)
                        .font(AppTheme.Typography.cardSubtitle)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .lineLimit(2)
                }

                if !location.equipment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    HStack(spacing: 5) {
                        let lineCount = location.equipment
                            .split(whereSeparator: \.isNewline)
                            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                            .filter { !$0.isEmpty }
                            .count
                        metaTag("\(max(lineCount, 1)) items", icon: "dumbbell.fill")
                    }
                    .padding(.top, 1)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
        .contentShape(Rectangle())
        .onTapGesture { onTap() }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if !isCurrent {
                Button(action: onTap) {
                    Label("Set Current", systemImage: "checkmark.circle.fill")
                }
                .tint(AppTheme.Colors.accent)
            }
        }
        .contextMenu {
            Button(action: onEdit) {
                Label("Edit", systemImage: "pencil")
            }
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    @ViewBuilder
    private func metaTag(_ text: String, icon: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .medium))
            Text(text)
                .font(.system(size: 13, weight: .medium))
        }
        .foregroundColor(AppTheme.Colors.secondaryText)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(AppTheme.Colors.surfaceHover)
        .clipShape(Capsule())
    }
}

#Preview {
    LocationsListSheet(
        selectedLocation: .constant(nil),
        shouldShowEditor: .constant(false)
    )
        .environmentObject(UserDataStore.shared)
}
