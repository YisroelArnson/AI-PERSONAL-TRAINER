//
//  ChatInputBar.swift
//  AI Personal Trainer App
//
//  Text input bar for the AI assistant with send functionality.
//  Includes placeholder for future voice input.
//

import SwiftUI

struct ChatInputBar: View {
    @Binding var text: String
    let isProcessing: Bool
    let onSend: () -> Void
    let onMinimize: () -> Void
    var onFocusChange: ((Bool) -> Void)? = nil
    
    // Focus state (owned by this view)
    @FocusState private var isInputFocused: Bool
    
    var body: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            // Text input field
            inputField

            // Send/Mic button
            actionButton
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.vertical, AppTheme.Spacing.md)
        .background(inputBackground)
        .gesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    // Swipe down to minimize (keep gesture, remove visual indicator)
                    if value.translation.height > 50 {
                        isInputFocused = false
                        onMinimize()
                    }
                }
        )
        .onChange(of: isInputFocused) { _, focused in
            onFocusChange?(focused)
        }
    }

    // MARK: - Subviews

    private var inputField: some View {
        TextField("Ask your trainer...", text: $text, axis: .vertical)
            .font(AppTheme.Typography.input)
            .foregroundColor(AppTheme.Colors.primaryText)
            .lineLimit(1...4)
            .focused($isInputFocused)
            .disabled(isProcessing)
            .submitLabel(.send)
            .onSubmit {
                if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    onSend()
                }
            }
    }
    
    // MARK: - Public Methods
    
    /// Dismiss the keyboard
    func dismissKeyboard() {
        isInputFocused = false
    }
    
    private var actionButton: some View {
        Button(action: {
            if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                onSend()
            }
        }) {
            ZStack {
                Circle()
                    .fill(canSend ? AppTheme.Colors.accent : AppTheme.Colors.surface)
                    .frame(width: 40, height: 40)
                
                // Icon
                if isProcessing {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.primaryText))
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: canSend ? "arrow.up" : "mic.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(canSend ? AppTheme.Colors.background : AppTheme.Colors.tertiaryText)
                }
            }
        }
        .disabled(isProcessing || (!canSend && text.isEmpty))
        .animation(.easeInOut(duration: 0.2), value: canSend)
    }
    
    private var inputBackground: some View {
        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
            .fill(AppTheme.Colors.surface)
    }
    
    // MARK: - Computed Properties
    
    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isProcessing
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        AppTheme.Gradients.background
            .ignoresSafeArea()
        
        VStack {
            Spacer()
            
            ChatInputBar(
                text: .constant(""),
                isProcessing: false,
                onSend: { print("Send") },
                onMinimize: { print("Minimize") }
            )
            .padding()
            
            ChatInputBar(
                text: .constant("I want to work on my legs today"),
                isProcessing: false,
                onSend: { print("Send") },
                onMinimize: { print("Minimize") }
            )
            .padding()
            
            ChatInputBar(
                text: .constant("Processing..."),
                isProcessing: true,
                onSend: { print("Send") },
                onMinimize: { print("Minimize") }
            )
            .padding()
        }
    }
}
