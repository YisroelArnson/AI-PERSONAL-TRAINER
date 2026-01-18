//
//  MinimizedResponsePill.swift
//  AI Personal Trainer App
//
//  Compact pill shown when chat is minimized but agent has responded.
//  Shows preview of latest message with tap to expand.
//

import SwiftUI

struct MinimizedResponsePill: View {
    let message: ChatMessage?
    let pendingCount: Int
    let onTap: () -> Void
    
    // Animation state
    @State private var hasAppeared = false
    @State private var bounceOffset: CGFloat = 0
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: AppTheme.Spacing.md) {
                // Avatar
                avatar
                
                // Message preview
                VStack(alignment: .leading, spacing: 2) {
                    Text("AI Trainer")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.warmAccent)
                    
                    Text(messagePreview)
                        .font(.system(size: 14, weight: .regular, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText)
                        .lineLimit(1)
                }
                
                Spacer()
                
                // Badge and expand indicator
                HStack(spacing: AppTheme.Spacing.sm) {
                    if pendingCount > 1 {
                        badge
                    }
                    
                    Image(systemName: "chevron.up")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                }
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.md)
            .background(pillBackground)
        }
        .buttonStyle(.plain)
        .offset(y: bounceOffset)
        .opacity(hasAppeared ? 1 : 0)
        .scaleEffect(hasAppeared ? 1 : 0.9)
        .onAppear {
            // Entrance animation
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                hasAppeared = true
            }
            
            // Gentle bounce to draw attention
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                performBounce()
            }
        }
    }
    
    // MARK: - Subviews
    
    private var avatar: some View {
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
                .frame(width: 36, height: 36)
            
            Image(systemName: "waveform")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white)
        }
        .shadow(color: AppTheme.Shadow.orb.opacity(0.5), radius: 4, x: 0, y: 2)
    }
    
    private var badge: some View {
        Text("\(pendingCount)")
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .foregroundColor(.white)
            .frame(width: 20, height: 20)
            .background(
                Circle()
                    .fill(AppTheme.Colors.warmAccent)
            )
    }
    
    private var pillBackground: some View {
        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.xlarge)
            .fill(Color.white.opacity(0.95))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.xlarge)
                    .stroke(AppTheme.Colors.border, lineWidth: 0.5)
            )
            .shadow(color: AppTheme.Shadow.card, radius: AppTheme.Shadow.cardRadius, x: 0, y: 4)
    }
    
    // MARK: - Computed Properties
    
    private var messagePreview: String {
        guard let message = message else {
            return "New message"
        }
        
        // Truncate to first line or first 50 characters
        let content = message.content
        if let newlineIndex = content.firstIndex(of: "\n") {
            return String(content[..<newlineIndex])
        } else if content.count > 50 {
            return String(content.prefix(47)) + "..."
        } else {
            return content
        }
    }
    
    // MARK: - Animations
    
    private func performBounce() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
            bounceOffset = -8
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                bounceOffset = 0
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        AnimatedGradientBackground()
        
        VStack {
            Spacer()
            
            MinimizedResponsePill(
                message: ChatMessage(
                    role: .assistant,
                    content: "Great choice! I've prepared a workout focused on upper body strength."
                ),
                pendingCount: 1,
                onTap: { print("Tapped") }
            )
            .padding()
            
            MinimizedResponsePill(
                message: ChatMessage(
                    role: .assistant,
                    content: "I've added some core exercises too."
                ),
                pendingCount: 3,
                onTap: { print("Tapped") }
            )
            .padding()
        }
    }
}
