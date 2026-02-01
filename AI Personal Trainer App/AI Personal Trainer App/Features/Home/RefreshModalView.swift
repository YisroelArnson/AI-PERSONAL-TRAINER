//
//  RefreshModalView.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant
//

import SwiftUI

struct RefreshModalView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var feedbackText: String = ""
    @State private var isLoading: Bool = false
    
    var onRefresh: (String?) async -> Void
    
    var body: some View {
        NavigationView {
            ZStack {
                // Warm gradient background
                AppTheme.Gradients.background
                    .ignoresSafeArea()
                
                VStack(spacing: AppTheme.Spacing.xxl) {
                    // Title and description
                    VStack(spacing: AppTheme.Spacing.md) {
                        Text("Refresh Recommendations")
                            .font(AppTheme.Typography.screenTitle)
                            .foregroundColor(AppTheme.Colors.primaryText)
                        
                        Text("Get new exercise recommendations. Optionally, tell us what you'd like different.")
                            .font(AppTheme.Typography.cardSubtitle)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    .padding(.top, AppTheme.Spacing.xl)
                    
                    // Feedback text field
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Text("Feedback (optional)")
                            .font(AppTheme.Typography.label)
                            .foregroundColor(AppTheme.Colors.secondaryText)
                        
                        TextField("E.g., 'More leg exercises' or 'Less intense'", text: $feedbackText, axis: .vertical)
                            .font(AppTheme.Typography.input)
                            .lineLimit(3...6)
                            .padding(AppTheme.Spacing.md)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                    .fill(AppTheme.Colors.surface)
                            )
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    
                    Spacer()
                    
                    // Action buttons
                    VStack(spacing: AppTheme.Spacing.md) {
                        // Refresh with feedback button
                        if !feedbackText.isEmpty {
                            Button {
                                Task {
                                    isLoading = true
                                    await onRefresh(feedbackText)
                                    isLoading = false
                                    dismiss()
                                }
                            } label: {
                                HStack {
                                    if isLoading {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                                    } else {
                                        Image(systemName: "sparkles")
                                        Text("Refresh with Feedback")
                                    }
                                }
                                .font(AppTheme.Typography.button)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, AppTheme.Spacing.md)
                                .background(
                                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                        .fill(AppTheme.Colors.accent)
                                )
                                .foregroundColor(AppTheme.Colors.background)
                            }
                            .disabled(isLoading)
                        }
                        
                        // Quick refresh button
                        Button {
                            Task {
                                isLoading = true
                                await onRefresh(nil)
                                isLoading = false
                                dismiss()
                            }
                        } label: {
                            HStack {
                                if isLoading && feedbackText.isEmpty {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.primaryText))
                            } else {
                                Image(systemName: "arrow.clockwise")
                                Text("Quick Refresh")
                            }
                        }
                        .font(AppTheme.Typography.button)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, AppTheme.Spacing.md)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                                    .fill(AppTheme.Colors.surface)
                            )
                            .foregroundColor(AppTheme.Colors.primaryText)
                        }
                        .disabled(isLoading)
                    }
                    .padding(.horizontal, AppTheme.Spacing.xl)
                    .padding(.bottom, AppTheme.Spacing.xl)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                }
            }
        }
    }
}

#Preview {
    RefreshModalView { feedback in
        print("Refreshing with feedback: \(feedback ?? "none")")
    }
}
