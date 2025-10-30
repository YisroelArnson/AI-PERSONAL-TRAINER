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
            VStack(spacing: 24) {
                // Title and description
                VStack(spacing: 12) {
                    Text("Refresh Recommendations")
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    Text("Get new exercise recommendations. Optionally, tell us what you'd like different.")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .padding(.top, 20)
                
                // Feedback text field
                VStack(alignment: .leading, spacing: 8) {
                    Text("Feedback (Optional)")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.gray)
                    
                    TextField("E.g., 'More leg exercises' or 'Less intense'", text: $feedbackText, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(3...6)
                        .padding(.horizontal, 4)
                }
                .padding(.horizontal, 20)
                
                Spacer()
                
                // Action buttons
                VStack(spacing: 12) {
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
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                } else {
                                    Image(systemName: "sparkles")
                                    Text("Refresh with Feedback")
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(AppTheme.Colors.primaryText)
                            .foregroundColor(.white)
                            .cornerRadius(12)
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
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(AppTheme.Colors.background)
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(AppTheme.Colors.primaryText.opacity(0.3), lineWidth: 1)
                        )
                    }
                    .disabled(isLoading)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        dismiss()
                    }
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

