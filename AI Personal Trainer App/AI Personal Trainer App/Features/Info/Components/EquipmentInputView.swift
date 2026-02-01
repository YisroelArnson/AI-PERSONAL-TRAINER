//
//  EquipmentInputView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct EquipmentInputView: View {
    @Binding var equipment: [EquipmentItem]
    
    @State private var showingAddEquipment = false
    @State private var showingEquipmentDetail: EquipmentItem?
    @State private var equipmentToEdit: EquipmentItem?
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            // Equipment List
            if equipment.isEmpty {
                VStack(spacing: AppTheme.Spacing.sm) {
                    Text("No equipment added")
                        .font(.caption)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.lg)
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: AppTheme.Spacing.md) {
                    ForEach(equipment) { item in
                        EquipmentChip(item: item) {
                            equipmentToEdit = item
                            showingEquipmentDetail = item
                        } onDelete: {
                            equipment.removeAll { $0.id == item.id }
                        }
                    }
                }
            }
            
            // Add Equipment Button
            Button(action: {
                showingAddEquipment = true
            }) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Add Equipment")
                }
                .font(AppTheme.Typography.button)
                .foregroundColor(AppTheme.Colors.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.sm)
                .background(AppTheme.Colors.accent)
                .cornerRadius(AppTheme.CornerRadius.small)
            }
        }
        .sheet(isPresented: $showingAddEquipment) {
            EquipmentDetailView(
                equipment: nil,
                onSave: { newEquipment in
                    equipment.append(newEquipment)
                }
            )
        }
        .sheet(item: $showingEquipmentDetail) { item in
            EquipmentDetailView(
                equipment: item,
                onSave: { updatedEquipment in
                    if let index = equipment.firstIndex(where: { $0.id == item.id }) {
                        equipment[index] = updatedEquipment
                    }
                }
            )
        }
    }
}

// MARK: - Equipment Chip

private struct EquipmentChip: View {
    let item: EquipmentItem
    let onTap: () -> Void
    let onDelete: () -> Void
    
    var body: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .lineLimit(1)
                
                if let weights = item.weights, !weights.isEmpty {
                    Text(weights.map { "\(Int($0))\(item.unit ?? "kg")" }.joined(separator: ", "))
                        .font(.caption2)
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .lineLimit(1)
                }
                
                Text(item.type.replacingOccurrences(of: "_", with: " ").capitalized)
                    .font(.caption2)
                    .foregroundColor(typeColor)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(typeColor.opacity(0.1))
                    .cornerRadius(4)
            }
            
            Spacer()
            
            Button(action: onDelete) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
        }
        .padding(AppTheme.Spacing.sm)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.small)
        .contentShape(Rectangle())
        .onTapGesture {
            onTap()
        }
    }
    
    private var typeColor: Color {
        AppTheme.Colors.primaryText
    }
}

// MARK: - Equipment Detail View

struct EquipmentDetailView: View {
    @Environment(\.dismiss) private var dismiss
    
    let equipment: EquipmentItem?
    let onSave: (EquipmentItem) -> Void
    
    @State private var name: String
    @State private var type: String
    @State private var weights: [Double]
    @State private var unit: String
    @State private var brand: String
    @State private var notes: String
    @State private var showingVoiceInput = false
    
    private let equipmentTypes = ["free_weights", "machine", "cardio", "bodyweight", "other"]
    private let units = ["kg", "lbs"]
    
    init(equipment: EquipmentItem?, onSave: @escaping (EquipmentItem) -> Void) {
        self.equipment = equipment
        self.onSave = onSave
        
        if let eq = equipment {
            _name = State(initialValue: eq.name)
            _type = State(initialValue: eq.type)
            _weights = State(initialValue: eq.weights ?? [])
            _unit = State(initialValue: eq.unit ?? "kg")
            _brand = State(initialValue: eq.brand ?? "")
            _notes = State(initialValue: eq.notes ?? "")
        } else {
            _name = State(initialValue: "")
            _type = State(initialValue: "free_weights")
            _weights = State(initialValue: [])
            _unit = State(initialValue: "kg")
            _brand = State(initialValue: "")
            _notes = State(initialValue: "")
        }
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.lg) {
                        // Name Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Equipment Name", systemImage: "dumbbell.fill")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            HStack {
                                TextField("e.g., Dumbbells, Pull-up bar", text: $name)
                                    .textFieldStyle(CustomTextFieldStyle())
                                
                                Button(action: {
                                    showingVoiceInput = true
                                }) {
                                    Image(systemName: "mic.fill")
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                        .padding(AppTheme.Spacing.md)
                                        .background(AppTheme.Colors.cardBackground)
                                        .cornerRadius(AppTheme.CornerRadius.small)
                                }
                            }
                        }
                        
                        // Type Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Type", systemImage: "tag")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            Picker("Type", selection: $type) {
                                ForEach(equipmentTypes, id: \.self) { type in
                                    Text(type.replacingOccurrences(of: "_", with: " ").capitalized)
                                        .tag(type)
                                }
                            }
                            .pickerStyle(MenuPickerStyle())
                            .padding(AppTheme.Spacing.md)
                            .background(AppTheme.Colors.cardBackground)
                            .cornerRadius(AppTheme.CornerRadius.medium)
                        }
                        
                        // Weights (for free weights)
                        if type == "free_weights" {
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                                Label("Weights", systemImage: "scalemass")
                                    .font(.headline)
                                    .foregroundColor(AppTheme.Colors.primaryText)
                                
                                VStack(spacing: AppTheme.Spacing.sm) {
                                    ForEach(weights.indices, id: \.self) { index in
                                        HStack {
                                            TextField("Weight", value: $weights[index], format: .number)
                                                .keyboardType(.decimalPad)
                                                .textFieldStyle(CustomTextFieldStyle())
                                            
                                            Text(unit)
                                                .foregroundColor(AppTheme.Colors.secondaryText)
                                            
                                            Button(action: {
                                                weights.remove(at: index)
                                            }) {
                                                Image(systemName: "minus.circle.fill")
                                                    .foregroundColor(AppTheme.Colors.danger)
                                            }
                                        }
                                    }
                                    
                                    Button(action: {
                                        weights.append(0)
                                    }) {
                                        HStack {
                                            Image(systemName: "plus.circle")
                                            Text("Add Weight")
                                        }
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(AppTheme.Colors.primaryText)
                                    }
                                }
                                
                                Picker("Unit", selection: $unit) {
                                    ForEach(units, id: \.self) { unit in
                                        Text(unit).tag(unit)
                                    }
                                }
                                .pickerStyle(SegmentedPickerStyle())
                            }
                        }
                        
                        // Brand Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Brand (Optional)", systemImage: "tag.fill")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextField("e.g., Rogue, Concept2", text: $brand)
                                .textFieldStyle(CustomTextFieldStyle())
                        }
                        
                        // Notes Field
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Label("Notes (Optional)", systemImage: "note.text")
                                .font(.headline)
                                .foregroundColor(AppTheme.Colors.primaryText)
                            
                            TextEditor(text: $notes)
                                .frame(minHeight: 80)
                                .padding(AppTheme.Spacing.md)
                                .background(AppTheme.Colors.surface)
                                .cornerRadius(AppTheme.CornerRadius.medium)
                                .scrollContentBackground(.hidden)
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.vertical, AppTheme.Spacing.lg)
                }
            }
            .navigationTitle(equipment != nil ? "Edit Equipment" : "Add Equipment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        saveEquipment()
                    }
                    .disabled(name.isEmpty)
                }
            }
            .sheet(isPresented: $showingVoiceInput) {
                VoiceInputView(transcription: $name)
            }
        }
    }
    
    private func saveEquipment() {
        let equipmentItem = EquipmentItem(
            id: equipment?.id ?? UUID(),
            name: name,
            type: type,
            weights: type == "free_weights" && !weights.isEmpty ? weights : nil,
            unit: type == "free_weights" ? unit : nil,
            brand: brand.isEmpty ? nil : brand,
            notes: notes.isEmpty ? nil : notes
        )
        
        onSave(equipmentItem)
        dismiss()
    }
}

// MARK: - Voice Input View

struct VoiceInputView: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var transcription: String
    
    @StateObject private var speechManager = SpeechManager()
    
    var body: some View {
        NavigationView {
            VStack(spacing: AppTheme.Spacing.xl) {
                Text("Voice Input")
                    .font(.headline)
                
                Text(speechManager.partialTranscript.isEmpty ? "Tap to start recording" : speechManager.partialTranscript)
                    .padding()
                    .frame(maxWidth: .infinity, minHeight: 100)
                    .background(AppTheme.Colors.cardBackground)
                    .cornerRadius(AppTheme.CornerRadius.medium)
                
                Button(action: {
                    if speechManager.isListening {
                        stopRecording()
                    } else {
                        startRecording()
                    }
                }) {
                    Image(systemName: speechManager.isListening ? "stop.circle.fill" : "mic.circle.fill")
                        .font(.system(size: 60))
                        .foregroundColor(speechManager.isListening ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryText)
                }
            }
            .padding()
            .navigationTitle("Voice Input")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        let text = speechManager.finalTranscript.isEmpty ? speechManager.partialTranscript : speechManager.finalTranscript
                        transcription = text
                        dismiss()
                    }
                }
            }
            .alert("Speech Error", isPresented: Binding(get: { speechManager.errorMessage != nil }, set: { _ in speechManager.errorMessage = nil })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(speechManager.errorMessage ?? "Speech recognition failed.")
            }
            .onDisappear {
                speechManager.stopListening()
            }
        }
    }
    
    private func startRecording() {
        Task {
            await speechManager.startListening()
        }
    }
    
    private func stopRecording() {
        speechManager.stopListening()
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
    EquipmentInputView(equipment: .constant([]))
}
