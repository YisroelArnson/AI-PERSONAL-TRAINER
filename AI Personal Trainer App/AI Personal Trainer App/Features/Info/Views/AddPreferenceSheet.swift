//
//  AddPreferenceSheet.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct AddPreferenceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var userDataStore: UserDataStore
    @StateObject private var apiService = APIService()
    
    // Field State variables
    @State private var type: String = ""
    @State private var description: String = ""
    @State private var userTranscription: String = ""
    @State private var recommendationsGuidance: String = ""
    @State private var deleteAfterCall: Bool = false
    @State private var hasExpireTime: Bool = false
    @State private var expireTime: Date?
    
    // AI State variables
    @State private var aiInputText: String = ""
    @State private var isProcessingAI: Bool = false
    
    // UI State
    @State private var isSaving: Bool = false
    @State private var errorMessage: String?
    @State private var showError: Bool = false
    
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
                                .disabled(isProcessingAI)
                                .opacity(isProcessingAI ? 0.5 : 1.0)
                        }
                        
                        // Description Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Description", systemImage: "text.alignleft")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextEditor(text: $description)
                                .frame(minHeight: 100)
                                .padding(AppTheme.Spacing.md)
                                .background(AppTheme.Colors.cardBackground)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                        .stroke(AppTheme.Colors.border, lineWidth: 1)
                                )
                                .scrollContentBackground(.hidden)
                                .colorScheme(.light)
                                .disabled(isProcessingAI)
                                .opacity(isProcessingAI ? 0.5 : 1.0)
                        }
                        
                        // User Transcription Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("User Transcription", systemImage: "mic")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextEditor(text: $userTranscription)
                                .frame(minHeight: 80)
                                .padding(AppTheme.Spacing.md)
                                .background(AppTheme.Colors.cardBackground)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                        .stroke(AppTheme.Colors.border, lineWidth: 1)
                                )
                                .scrollContentBackground(.hidden)
                                .colorScheme(.light)
                                .disabled(isProcessingAI)
                                .opacity(isProcessingAI ? 0.5 : 1.0)
                        }
                        
                        // Recommendations Guidance Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Recommendations Guidance", systemImage: "lightbulb")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextEditor(text: $recommendationsGuidance)
                                .frame(minHeight: 80)
                                .padding(AppTheme.Spacing.md)
                                .background(AppTheme.Colors.cardBackground)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                        .stroke(AppTheme.Colors.border, lineWidth: 1)
                                )
                                .scrollContentBackground(.hidden)
                                .colorScheme(.light)
                                .disabled(isProcessingAI)
                                .opacity(isProcessingAI ? 0.5 : 1.0)
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
                            .background(AppTheme.Colors.cardBackground)
                            .cornerRadius(AppTheme.CornerRadius.medium)
                            .disabled(isProcessingAI)
                            
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
                            .disabled(isProcessingAI)
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
                                .background(AppTheme.Colors.cardBackground)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                                .disabled(isProcessingAI)
                            }
                        }
                        
                        // Save Button
                        Button(action: savePreference) {
                            HStack {
                                if isSaving {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                } else {
                                Image(systemName: "checkmark.circle.fill")
                                Text("Save Preference")
                                    .fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(type.isEmpty || description.isEmpty ? AppTheme.Colors.secondaryText : Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(AppTheme.CornerRadius.medium)
                        }
                        .disabled(type.isEmpty || description.isEmpty || isProcessingAI || isSaving)
                    }
                    .padding(AppTheme.Spacing.xl)
                    .padding(.bottom, 80) // Add padding for floating input
                }
                
                // Floating AI Input Field
                VStack {
                    Spacer()
                    
                    HStack(spacing: AppTheme.Spacing.md) {
                        TextField("Describe your preference...", text: $aiInputText)
                            .textFieldStyle(PlainTextFieldStyle())
                            .padding(AppTheme.Spacing.md)
                            .background(AppTheme.Colors.cardBackground)
                            .cornerRadius(AppTheme.CornerRadius.medium)
                            .disabled(isProcessingAI)
                        
                        SendButton(
                            isProcessing: isProcessingAI,
                            isEnabled: !aiInputText.isEmpty,
                            action: handleSendTap
                        )
                    }
                    .padding(AppTheme.Spacing.md)
                    .background(AppTheme.Colors.background)
                    .shadow(color: AppTheme.Shadow.card, radius: 8, x: 0, y: -2)
                }
            }
            .navigationTitle("Add Preference")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isProcessingAI || isSaving)
                }
            }
            .alert("Error", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "An unknown error occurred")
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
                
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to save preference: \(error.localizedDescription)"
                    showError = true
                    isSaving = false
                }
            }
        }
    }
    
    private func handleSendTap() {
        guard !aiInputText.isEmpty else { return }
        processWithAI()
    }
    
    private func processWithAI() {
        isProcessingAI = true
        errorMessage = nil
        showError = false
        
        let inputText = aiInputText
        
        // Build current preference context if any fields have values
        let context = buildCurrentPreferenceContext()
        
        Task {
            do {
                // Call the API to parse the preference with context
                let parsedPreference = try await apiService.parsePreference(
                    preferenceText: inputText,
                    currentPreference: context
                )
                
                await MainActor.run {
                    // Populate the form fields with the parsed data
                    type = parsedPreference.type
                    description = parsedPreference.description
                    userTranscription = inputText
                    recommendationsGuidance = parsedPreference.recommendationsGuidance
                    deleteAfterCall = parsedPreference.deleteAfterCall
                    
                    // Handle expireTime
                    if let expireTimeString = parsedPreference.expireTime {
                        // Parse ISO 8601 date string with fractional seconds support
                        let formatter = ISO8601DateFormatter()
                        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                        if let date = formatter.date(from: expireTimeString) {
                            expireTime = date  // Set date FIRST
                            hasExpireTime = true  // Then set toggle AFTER
                        } else {
                            expireTime = nil
                            hasExpireTime = false
                        }
                    } else {
                        expireTime = nil
                        hasExpireTime = false
                    }
                    
                    // Clear the input after successful processing
                    aiInputText = ""
                    isProcessingAI = false
                }
                
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to parse preference: \(error.localizedDescription)"
                    showError = true
                    isProcessingAI = false
                }
            }
        }
    }
    
    private func buildCurrentPreferenceContext() -> CurrentPreferenceContext? {
        // Only build context if at least one field has a value
        let hasAnyValue = !type.isEmpty || !description.isEmpty || 
                         !userTranscription.isEmpty || !recommendationsGuidance.isEmpty ||
                         deleteAfterCall || hasExpireTime
        
        guard hasAnyValue else { return nil }
        
        // Convert expireTime to ISO8601 string if present
        let expireTimeString: String?
        if hasExpireTime, let expireTime = expireTime {
            expireTimeString = ISO8601DateFormatter().string(from: expireTime)
        } else {
            expireTimeString = nil
        }
        
        return CurrentPreferenceContext(
            type: type.isEmpty ? nil : type,
            description: description.isEmpty ? nil : description,
            userTranscription: userTranscription.isEmpty ? nil : userTranscription,
            recommendationsGuidance: recommendationsGuidance.isEmpty ? nil : recommendationsGuidance,
            deleteAfterCall: deleteAfterCall ? true : nil,
            hasExpireTime: hasExpireTime ? true : nil,
            expireTime: expireTimeString
        )
    }
}

// MARK: - Custom Text Field Style
private struct CustomTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(AppTheme.Spacing.md)
            .background(AppTheme.Colors.cardBackground)
            .cornerRadius(AppTheme.CornerRadius.medium)
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                    .stroke(AppTheme.Colors.border, lineWidth: 1)
            )
            .foregroundColor(AppTheme.Colors.primaryText)
            .colorScheme(.light)
    }
}

// MARK: - Send Button
private struct SendButton: View {
    let isProcessing: Bool
    let isEnabled: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            ZStack {
                // Background circle
                Circle()
                    .fill(isEnabled && !isProcessing ? Color.blue : AppTheme.Colors.secondaryText)
                    .frame(width: 44, height: 44)
                
                // Icon
                if isProcessing {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.9)
                } else {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
        }
        .disabled(!isEnabled || isProcessing)
    }
}

#Preview {
    AddPreferenceSheet()
        .environmentObject(UserDataStore.shared)
}
