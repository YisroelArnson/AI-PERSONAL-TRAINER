//
//  PreferenceManagerView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct PreferenceManagerView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var userDataStore: UserDataStore
    
    let preference: UserPreference?
    
    // Editable fields - initialize with preference data if available
    @State private var type: String
    @State private var description: String
    @State private var userTranscription: String
    @State private var recommendationsGuidance: String
    @State private var expireTime: Date?
    @State private var hasExpireTime: Bool
    @State private var deleteAfterCall: Bool
    
    // UI State
    @State private var isSaving: Bool = false
    @State private var showError: Bool = false
    @State private var errorMessage: String = ""
    @State private var showDeleteConfirmation: Bool = false
    @State private var isDeleting: Bool = false
    
    init(preference: UserPreference? = nil) {
        self.preference = preference
        
        // Initialize state variables with preference data
        if let pref = preference {
            _type = State(initialValue: pref.type)
            _description = State(initialValue: pref.description)
            _userTranscription = State(initialValue: pref.userTranscription)
            _recommendationsGuidance = State(initialValue: pref.recommendationsGuidance)
            _expireTime = State(initialValue: pref.expireTime)
            _hasExpireTime = State(initialValue: pref.expireTime != nil)
            _deleteAfterCall = State(initialValue: pref.deleteAfterCall)
        } else {
            _type = State(initialValue: "")
            _description = State(initialValue: "")
            _userTranscription = State(initialValue: "")
            _recommendationsGuidance = State(initialValue: "")
            _expireTime = State(initialValue: nil)
            _hasExpireTime = State(initialValue: false)
            _deleteAfterCall = State(initialValue: false)
        }
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.xl) {
                        // Type Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Type", systemImage: "tag")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextField("e.g., workout, injury, equipment", text: $type)
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
                        
                        // User Transcription Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("User Transcription", systemImage: "mic")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextEditor(text: $userTranscription)
                                .frame(minHeight: 80)
                                .padding(AppTheme.Spacing.md)
                                .background(AppTheme.Colors.surface)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                                .scrollContentBackground(.hidden)
                        }
                        
                        // Recommendations Guidance Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Recommendations Guidance", systemImage: "lightbulb")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextEditor(text: $recommendationsGuidance)
                                .frame(minHeight: 80)
                                .padding(AppTheme.Spacing.md)
                                .background(AppTheme.Colors.surface)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                                .scrollContentBackground(.hidden)
                        }
                        
                        // Delete After Call Toggle
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Toggle(isOn: $deleteAfterCall) {
                                HStack(spacing: AppTheme.Spacing.sm) {
                                    Image(systemName: "hourglass")
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                    Text("Delete After Call")
                                        .font(.headline)
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                }
                            }
                            .padding(AppTheme.Spacing.md)
                            .background(AppTheme.Colors.surface)
                            .cornerRadius(AppTheme.CornerRadius.medium)
                            
                            Text("This preference will be removed after the next recommendation call")
                                .font(.caption)
                                .foregroundColor(AppTheme.Colors.secondaryText)
                                .padding(.horizontal, AppTheme.Spacing.sm)
                        }
                        
                        // Expiration Time
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Toggle(isOn: $hasExpireTime) {
                                HStack(spacing: AppTheme.Spacing.sm) {
                                    Image(systemName: "clock")
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                    Text("Set Expiration Time")
                                        .font(.headline)
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                }
                            }
                            .padding(AppTheme.Spacing.md)
                            .background(AppTheme.Colors.cardBackground)
                            .cornerRadius(AppTheme.CornerRadius.medium)
                            .onChange(of: hasExpireTime) { _, newValue in
                                if newValue && expireTime == nil {
                                    expireTime = Calendar.current.date(byAdding: .day, value: 7, to: Date())
                                } else if !newValue {
                                    expireTime = nil
                                }
                            }
                            
                            if hasExpireTime {
                                DatePicker("Expires on", selection: Binding(
                                    get: { expireTime ?? Date() },
                                    set: { expireTime = $0 }
                                ), displayedComponents: [.date, .hourAndMinute])
                                .padding(AppTheme.Spacing.md)
                                .background(AppTheme.Colors.surface)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                            }
                        }
                        
                        // Delete Button (only show when editing existing preference)
                        if preference != nil {
                            Button(action: {
                                showDeleteConfirmation = true
                            }) {
                                HStack {
                                    if isDeleting {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    } else {
                                        Image(systemName: "trash")
                                        Text("Delete Preference")
                                            .fontWeight(.semibold)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(AppTheme.Colors.danger)
                                .foregroundColor(.white)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                            }
                            .disabled(isDeleting || isSaving)
                        }
                    }
                    .padding(AppTheme.Spacing.xl)
                }
            }
            .navigationTitle(preference == nil ? "New Preference" : "Edit Preference")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isDeleting)
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: savePreference) {
                        Text("Save")
                            .fontWeight(.semibold)
                    }
                    .disabled(type.isEmpty || description.isEmpty || isSaving || isDeleting)
                }
            }
            .alert("Error", isPresented: $showError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(errorMessage)
            }
            .confirmationDialog("Are you sure you want to delete this preference?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    deletePreference()
                }
                Button("Cancel", role: .cancel) { }
            } message: {
                Text("This action cannot be undone.")
            }
        }
    }
    
    private func savePreference() {
        guard !type.isEmpty, !description.isEmpty else { return }
        
        isSaving = true
        
        Task {
            do {
                // Get current user ID
                let session = try await supabase.auth.session
                let userId = session.user.id
                
                if let existingPreference = preference {
                    // Update existing preference
                    struct PreferenceUpdate: Encodable {
                        let type: String
                        let description: String
                        let user_transcription: String
                        let recommendations_guidance: String
                        let expire_time: String?
                        let delete_after_call: Bool
                    }
                    
                    let updates = PreferenceUpdate(
                        type: type,
                        description: description,
                        user_transcription: userTranscription,
                        recommendations_guidance: recommendationsGuidance,
                        expire_time: expireTime?.ISO8601Format(),
                        delete_after_call: deleteAfterCall
                    )
                    
                    try await supabase
                        .from("preferences")
                        .update(updates)
                        .eq("id", value: existingPreference.id)
                        .execute()
                    
                    // Update local state
                    let updatedPreference = UserPreference(
                        id: existingPreference.id,
                        type: type,
                        description: description,
                        userTranscription: userTranscription,
                        recommendationsGuidance: recommendationsGuidance,
                        expireTime: expireTime,
                        deleteAfterCall: deleteAfterCall
                    )
                    
                    await MainActor.run {
                        userDataStore.updatePreference(updatedPreference)
                        isSaving = false
                        dismiss()
                    }
                } else {
                    // Create new preference
                    struct PreferenceInsert: Encodable {
                        let user_id: String
                        let type: String
                        let description: String
                        let user_transcription: String
                        let recommendations_guidance: String
                        let expire_time: String?
                        let delete_after_call: Bool
                    }
                    
                    let newPreference = PreferenceInsert(
                        user_id: userId.uuidString,
                        type: type,
                        description: description,
                        user_transcription: userTranscription,
                        recommendations_guidance: recommendationsGuidance,
                        expire_time: expireTime?.ISO8601Format(),
                        delete_after_call: deleteAfterCall
                    )
                    
                    let response: UserPreferenceDB = try await supabase
                        .from("preferences")
                        .insert(newPreference)
                        .select()
                        .single()
                        .execute()
                        .value
                    
                    // Update local state
                    let createdPreference = UserPreference(
                        id: response.id,
                        type: response.type,
                        description: response.description,
                        userTranscription: response.user_transcription ?? "",
                        recommendationsGuidance: response.recommendations_guidance ?? "",
                        expireTime: response.expire_time,
                        deleteAfterCall: response.delete_after_call ?? false
                    )
                    
                    await MainActor.run {
                        userDataStore.updatePreference(createdPreference)
                        isSaving = false
                        dismiss()
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to save preference: \(error.localizedDescription)"
                    showError = true
                    isSaving = false
                }
            }
        }
    }
    
    private func deletePreference() {
        guard let preferenceToDelete = preference else { return }
        
        isDeleting = true
        
        Task {
            do {
                // Delete from Supabase
                try await supabase
                    .from("preferences")
                    .delete()
                    .eq("id", value: preferenceToDelete.id)
                    .execute()
                
                // Update local state
                await MainActor.run {
                    userDataStore.removePreference(id: preferenceToDelete.id)
                    isDeleting = false
                    dismiss()
                }
                
                print("✅ Preference deleted successfully")
                
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to delete preference: \(error.localizedDescription)"
                    showError = true
                    isDeleting = false
                }
                print("❌ Error deleting preference: \(error)")
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
            .foregroundColor(AppTheme.Colors.primaryText)
    }
}

#Preview {
    PreferenceManagerView()
        .environmentObject(UserDataStore.shared)
}
