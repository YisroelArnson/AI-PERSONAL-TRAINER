//
//  MessageBubble.swift
//  AI Personal Trainer App
//
//  Individual chat message bubble with glassmorphism styling.
//

import SwiftUI

struct MessageBubble: View {
    let message: ChatMessage

    // Animation state
    @State private var hasAppeared = false

    private var isUser: Bool {
        message.role == .user
    }
    
    var body: some View {
        HStack(alignment: .bottom, spacing: AppTheme.Spacing.sm) {
            if isUser {
                Spacer(minLength: 60)
            }
            
            // Avatar for assistant messages
            if !isUser {
                assistantAvatar
            }
            
            // Message content
            messageContent
            
            // Avatar placeholder for user messages (for alignment)
            if isUser {
                Color.clear
                    .frame(width: 28, height: 28)
            }
            
            if !isUser {
                Spacer(minLength: 60)
            }
        }
        .opacity(hasAppeared ? 1 : 0)
        .offset(y: hasAppeared ? 0 : 20)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                hasAppeared = true
            }
        }
    }
    
    // MARK: - Subviews
    
    private var assistantAvatar: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            AppTheme.Colors.warmAccentLight,
                            AppTheme.Colors.warmAccent
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 28, height: 28)
            
            Image(systemName: "waveform")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white)
        }
        .shadow(color: AppTheme.Shadow.orb.opacity(0.5), radius: 4, x: 0, y: 2)
    }
    
    private var messageContent: some View {
        Text(message.content)
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundColor(isUser ? .white : AppTheme.Colors.primaryText)
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.md)
            .background(messageBackground)
            .fixedSize(horizontal: false, vertical: true)
    }
    
    @ViewBuilder
    private var messageBackground: some View {
        if isUser {
            // User message - warm accent gradient
            RoundedRectangle(cornerRadius: 20)
                .fill(
                    LinearGradient(
                        colors: [
                            AppTheme.Colors.warmAccent,
                            AppTheme.Colors.warmAccent.opacity(0.9)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(color: AppTheme.Colors.warmAccent.opacity(0.3), radius: 8, x: 0, y: 4)
        } else {
            // Assistant message - glassmorphism
            RoundedRectangle(cornerRadius: 20)
                .fill(Color.white.opacity(0.9))
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(.ultraThinMaterial)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(AppTheme.Colors.border, lineWidth: 0.5)
                )
                .shadow(color: AppTheme.Shadow.card, radius: 10, x: 0, y: 4)
        }
    }
}

// MARK: - Preview

#Preview("Basic Messages") {
    ZStack {
        AnimatedGradientBackground()

        VStack(spacing: AppTheme.Spacing.lg) {
            MessageBubble(
                message: ChatMessage(
                    role: .user,
                    content: "I want to focus on upper body today"
                )
            )

            MessageBubble(
                message: ChatMessage(
                    role: .assistant,
                    content: "Great choice! Based on your recent workouts, I'll focus on chest and shoulders since you've been working back more frequently."
                )
            )
        }
        .padding()
    }
}

#Preview("Long Message") {
    ZStack {
        AnimatedGradientBackground()

        VStack(spacing: AppTheme.Spacing.lg) {
            MessageBubble(
                message: ChatMessage(
                    role: .assistant,
                    content: "Great choice! Based on your recent workouts, I'll focus on upper body strength since you've been working legs more frequently. Let me put together a personalized workout for you."
                )
            )
        }
        .padding()
    }
}
