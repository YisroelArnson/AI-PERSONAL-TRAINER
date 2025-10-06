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
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(AppTheme.Colors.secondaryText)
                                
                                Text("• \"I want to build muscle and strength\"")
                                    .font(.system(size: 13))
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                    .italic()
                                
                                Text("• \"Focus on longevity and injury prevention\"")
                                    .font(.system(size: 13))
                                    .foregroundColor(AppTheme.Colors.tertiaryText)
                                    .italic()
                                
                                Text("• \"Train like Peter Attia\"")
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

// MARK: - Category Preview Row
private struct CategoryPreviewRow: View {
    let name: String
    let weight: Double
    
    var color: Color {
        switch name {
        case "Strength": return .orange
        case "Cardio": return .blue
        case "Stability": return .purple
        default: return AppTheme.Colors.primaryText
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Text(name)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                Spacer()
                
                Text("\(Int(weight * 100))%")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(color)
            }
            
            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(AppTheme.Colors.background)
                        .frame(height: 8)
                    
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color)
                        .frame(width: geometry.size.width * weight, height: 8)
                }
            }
            .frame(height: 8)
        }
        .padding(AppTheme.Spacing.lg)
        .background(AppTheme.Colors.cardBackground)
        .cornerRadius(AppTheme.CornerRadius.medium)
        .shadow(
            color: AppTheme.Shadow.card,
            radius: AppTheme.Shadow.cardRadius,
            x: AppTheme.Shadow.cardOffset.width,
            y: AppTheme.Shadow.cardOffset.height
        )
    }
}

#Preview {
    CategoryGoalsAIAssistSheet()
}

