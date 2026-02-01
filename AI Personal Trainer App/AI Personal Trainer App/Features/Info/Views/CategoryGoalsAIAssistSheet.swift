//
//  CategoryGoalsAIAssistSheet.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

struct CategoryGoalsAIAssistSheet: View {
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
                                Text("Describe Your Goals")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .foregroundColor(AppTheme.Colors.primaryText)
                                
                                Text("Tell me what you want to focus on, and I'll suggest category weights.")
                                    .font(.body)
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                            }
                            .padding(.horizontal, AppTheme.Spacing.xl)
                            .padding(.top, AppTheme.Spacing.xl)
                            
                            // Text input
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                                Text("Examples:")
                                    .font(AppTheme.Typography.label)
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                                
                                Text("• \"I want to build muscle and strength\"")
                                    .font(AppTheme.Typography.cardSubtitle)
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                    .italic()
                                
                                Text("• \"Focus on longevity and injury prevention\"")
                                    .font(AppTheme.Typography.cardSubtitle)
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                    .italic()
                                
                                Text("• \"Train like Peter Attia\"")
                                    .font(AppTheme.Typography.cardSubtitle)
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                    .italic()
                                
                                TextEditor(text: $inputText)
                                    .frame(minHeight: 120)
                                    .padding(AppTheme.Spacing.md)
                                    .background(AppTheme.Colors.surface)
                                    .cornerRadius(AppTheme.CornerRadius.medium)
                                    .scrollContentBackground(.hidden)
                            }
                            .padding(.horizontal, AppTheme.Spacing.xl)
                            
                            Spacer()
                            
                            // Generate button
                            Button(action: generateSuggestions) {
                                HStack(spacing: 8) {
                                    if isProcessing {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                                    } else {
                                        Image(systemName: "sparkles")
                                            .font(.system(size: 16, weight: .semibold))
                                    }
                                    
                                    Text(isProcessing ? "Generating..." : "Generate Suggestions")
                                        .font(AppTheme.Typography.button)
                                }
                                .foregroundColor(inputText.isEmpty ? AppTheme.Colors.tertiaryText : AppTheme.Colors.background)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(inputText.isEmpty ? AppTheme.Colors.surface : AppTheme.Colors.accent)
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
            .navigationTitle("Category Goals — AI Assist")
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
                "Strength": 0.50,
                "Cardio": 0.35,
                "Stability": 0.15
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
                Text("Suggested Category Goals")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Text("Based on your input, here's what I recommend:")
                    .font(.body)
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.top, AppTheme.Spacing.xl)
            
            // Category previews
            VStack(spacing: AppTheme.Spacing.md) {
                ForEach(weights.sorted(by: { $0.value > $1.value }), id: \.key) { key, value in
                    CategoryPreviewRow(name: key, weight: value)
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            
            Spacer()
            
            // Action buttons
            VStack(spacing: AppTheme.Spacing.md) {
                Button(action: onAccept) {
                    Text("Accept & Save")
                        .font(AppTheme.Typography.button)
                        .foregroundColor(AppTheme.Colors.background)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(AppTheme.Colors.accent)
                        .cornerRadius(AppTheme.CornerRadius.small)
                }
                
                Button(action: onReject) {
                    Text("Try Again")
                        .font(AppTheme.Typography.button)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(AppTheme.Colors.surface)
                        .cornerRadius(AppTheme.CornerRadius.small)
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.bottom, AppTheme.Spacing.xl)
        }
    }
}

// MARK: - Category Preview Row
private struct CategoryPreviewRow: View {
    let name: String
    let weight: Double
    
    var color: Color {
        AppTheme.Colors.primaryText
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Text(name)
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Spacer()
                
                Text("\(Int(weight * 100))%")
                    .font(AppTheme.Typography.statNumber)
                    .foregroundColor(color)
            }
            
            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(AppTheme.Colors.highlight)
                        .frame(height: 8)
                    
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color)
                        .frame(width: geometry.size.width * weight, height: 8)
                }
            }
            .frame(height: 8)
        }
        .padding(AppTheme.Spacing.lg)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.medium)
    }
}

#Preview {
    CategoryGoalsAIAssistSheet()
}
