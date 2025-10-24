//
//  MuscleGoalsAIAssistSheet.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct MuscleGoalsAIAssistSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var inputText: String = ""
    @State private var isProcessing: Bool = false
    @State private var showingPreview: Bool = false
    
    // Preview weights
    @State private var previewWeights: [String: Double] = [:]
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                VStack(spacing: AppTheme.Spacing.xl) {
                    if !showingPreview {
                        // Input view
                        VStack(spacing: AppTheme.Spacing.xl) {
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                                Text("Describe Your Muscle Focus")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .foregroundColor(AppTheme.Colors.primaryText)
                                
                                Text("Tell me which muscles you want to prioritize, and I'll suggest weight distribution.")
                                    .font(.body)
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                            }
                            .padding(.horizontal, AppTheme.Spacing.xl)
                            .padding(.top, AppTheme.Spacing.xl)
                            
                            // Text input
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                                Text("Examples:")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                                
                                Text("• \"Focus on glutes and hamstrings\"")
                                    .font(.system(size: 13))
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                    .italic()
                                
                                Text("• \"Build upper body, especially chest and back\"")
                                    .font(.system(size: 13))
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                    .italic()
                                
                                Text("• \"Balanced full body with leg emphasis\"")
                                    .font(.system(size: 13))
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                    .italic()
                                
                                TextEditor(text: $inputText)
                                    .frame(minHeight: 120)
                                    .padding(AppTheme.Spacing.md)
                                    .background(AppTheme.Colors.cardBackground)
                                    .cornerRadius(AppTheme.CornerRadius.medium)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                            .stroke(AppTheme.Colors.border, lineWidth: 1)
                                    )
                                    .scrollContentBackground(.hidden)
                                    .colorScheme(.light)
                            }
                            .padding(.horizontal, AppTheme.Spacing.xl)
                            
                            Spacer()
                            
                            // Generate button
                            Button(action: generateSuggestions) {
                                HStack(spacing: 8) {
                                    if isProcessing {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.cardBackground))
                                    } else {
                                        Image(systemName: "sparkles")
                                            .font(.system(size: 16, weight: .semibold))
                                    }
                                    
                                    Text(isProcessing ? "Generating..." : "Generate Suggestions")
                                        .font(.system(size: 16, weight: .semibold))
                                }
                                .foregroundColor(AppTheme.Colors.cardBackground)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(inputText.isEmpty ? AppTheme.Colors.border : AppTheme.Colors.primaryText)
                                .cornerRadius(AppTheme.CornerRadius.small)
                            }
                            .disabled(inputText.isEmpty || isProcessing)
                            .padding(.horizontal, AppTheme.Spacing.xl)
                            .padding(.bottom, AppTheme.Spacing.xl)
                        }
                    } else {
                        // Preview view
                        PreviewView(
                            weights: previewWeights,
                            onAccept: acceptSuggestions,
                            onReject: {
                                showingPreview = false
                                previewWeights = [:]
                            }
                        )
                    }
                }
            }
            .navigationTitle("Muscle Goals — AI Assist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
    
    private func generateSuggestions() {
        isProcessing = true
        
        // TODO: Call AI API to generate suggestions
        // Mock response for now
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            previewWeights = [
                "Glutes": 0.20,
                "Hamstrings": 0.15,
                "Quadriceps": 0.15,
                "Back": 0.12,
                "Chest": 0.10,
                "Shoulders": 0.08,
                "Abs": 0.08,
                "Lower Back": 0.06,
                "Calves": 0.06
            ]
            showingPreview = true
            isProcessing = false
        }
    }
    
    private func acceptSuggestions() {
        // TODO: Save to backend/user defaults
        dismiss()
    }
}

// MARK: - Preview View
private struct PreviewView: View {
    let weights: [String: Double]
    let onAccept: () -> Void
    let onReject: () -> Void
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                Text("Suggested Muscle Goals")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Text("Based on your input, here's what I recommend:")
                    .font(.body)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.top, AppTheme.Spacing.xl)
            
            ScrollView {
                VStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(weights.sorted(by: { $0.value > $1.value }), id: \.key) { key, value in
                        MusclePreviewRow(name: key, weight: value)
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.xl)
            }
            
            // Action buttons
            VStack(spacing: AppTheme.Spacing.md) {
                Button(action: onAccept) {
                    Text("Accept & Save")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.cardBackground)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(AppTheme.Colors.primaryText)
                        .cornerRadius(AppTheme.CornerRadius.small)
                }
                
                Button(action: onReject) {
                    Text("Try Again")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(AppTheme.Colors.cardBackground)
                        .cornerRadius(AppTheme.CornerRadius.small)
                        .overlay(
                            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.small)
                                .stroke(AppTheme.Colors.border, lineWidth: 1)
                        )
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.bottom, AppTheme.Spacing.xl)
        }
    }
}

// MARK: - Muscle Preview Row
private struct MusclePreviewRow: View {
    let name: String
    let weight: Double
    
    var body: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            Text(name)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 100, alignment: .leading)
            
            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(AppTheme.Colors.background)
                        .frame(height: 6)
                    
                    RoundedRectangle(cornerRadius: 4)
                        .fill(AppTheme.Colors.primaryText)
                        .frame(width: geometry.size.width * (weight * 2), height: 6)
                }
            }
            .frame(height: 6)
            
            Text("\(Int(weight * 100))%")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .frame(width: 45, alignment: .trailing)
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.vertical, AppTheme.Spacing.md)
        .background(AppTheme.Colors.cardBackground)
        .cornerRadius(AppTheme.CornerRadius.small)
    }
}

#Preview {
    MuscleGoalsAIAssistSheet()
}

