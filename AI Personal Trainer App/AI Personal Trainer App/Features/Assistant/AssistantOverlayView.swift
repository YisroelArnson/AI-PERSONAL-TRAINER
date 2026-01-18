//
//  AssistantOverlayView.swift
//  AI Personal Trainer App
//
//  Main container for the floating AI assistant overlay.
//  Handles blur backdrop, message display, input, and state transitions.
//

import SwiftUI

struct AssistantOverlayView: View {
    @Environment(\.assistantManager) private var manager
    @StateObject private var agentService = AgentService.shared

    // Create binding for Observable properties
    private var inputTextBinding: Binding<String> {
        Binding(
            get: { manager.inputText },
            set: { manager.inputText = $0 }
        )
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottom) {
                // Blur backdrop (when overlay is active)
                if manager.showBlurBackdrop {
                    blurBackdrop
                        .transition(.opacity)
                        .onTapGesture {
                            dismissOverlay()
                        }
                }
                
                // Main content stack
                VStack(spacing: 0) {
                    Spacer()

                    // Error toast (if any)
                    if let error = manager.errorMessage {
                        errorToast(error)
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .padding(.bottom, AppTheme.Spacing.md)
                    }

                    // Floating message stack (now contains inline steps)
                    if manager.showMessages || manager.isProcessing {
                        FloatingMessageStack(
                            messages: manager.messages,
                            isExpanded: manager.state == .expanded,
                            currentStep: manager.currentStreamingStep,
                            onExpandToggle: {
                                if manager.state == .expanded {
                                    manager.collapse()
                                } else {
                                    manager.expand()
                                }
                            }
                        )
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .padding(.horizontal, AppTheme.Spacing.lg)
                        .padding(.bottom, AppTheme.Spacing.sm)
                    }
                    
                    // Input bar
                    if manager.showInputBar {
                        ChatInputBar(
                            text: inputTextBinding,
                            isProcessing: manager.isProcessing,
                            onSend: sendMessage,
                            onMinimize: {
                                manager.minimize()
                            },
                            onFocusChange: { focused in
                                if focused {
                                    manager.startTyping()
                                } else {
                                    manager.stopTyping()
                                }
                            }
                        )
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .padding(.horizontal, AppTheme.Spacing.lg)
                        .padding(.bottom, AppTheme.Spacing.lg)
                    }
                    
                    // Minimized response pill
                    if manager.showMinimizedPill {
                        MinimizedResponsePill(
                            message: manager.latestAssistantMessage,
                            pendingCount: manager.pendingResponseCount,
                            onTap: {
                                manager.open()
                            }
                        )
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .padding(.horizontal, AppTheme.Spacing.lg)
                        .padding(.bottom, AppTheme.Spacing.lg)
                    }
                    
                    // AI Button (always visible at bottom right when idle or minimized)
                    if manager.state == .idle || manager.state == .minimized {
                        HStack {
                            Spacer()
                            FloatingAIButton(
                                state: buttonState,
                                pendingCount: manager.pendingResponseCount,
                                action: {
                                    manager.open()
                                }
                            )
                            .padding(.trailing, AppTheme.Spacing.xl)
                            .padding(.bottom, AppTheme.Spacing.xxxl)
                        }
                        .transition(.scale.combined(with: .opacity))
                    }
                }
            }
            .animation(.spring(response: 0.4, dampingFraction: 0.8), value: manager.state)
            .animation(.spring(response: 0.3, dampingFraction: 0.85), value: manager.isProcessing)
            .animation(.spring(response: 0.3, dampingFraction: 0.85), value: manager.messages.count)
        }
    }
    
    // MARK: - Subviews
    
    private var blurBackdrop: some View {
        Color.black.opacity(0.25)
            .background(.ultraThinMaterial)
            .ignoresSafeArea()
    }
    
    private func errorToast(_ message: String) -> some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 16))
                .foregroundColor(.white)
            
            Text(message)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(2)
            
            Spacer()
            
            Button {
                manager.clearError()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.vertical, AppTheme.Spacing.md)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                .fill(Color.red.opacity(0.9))
        )
        .shadow(color: Color.black.opacity(0.15), radius: 10, x: 0, y: 5)
    }
    
    // MARK: - Computed Properties
    
    private var buttonState: AIButtonState {
        if manager.isProcessing {
            return .processing
        } else if manager.pendingResponseCount > 0 {
            return .hasPending
        } else {
            return .idle
        }
    }
    
    // MARK: - Actions
    
    private func dismissOverlay() {
        // If we have messages, minimize instead of closing
        if !manager.messages.isEmpty {
            manager.minimize()
        } else {
            manager.close()
        }
    }
    
    private func sendMessage() {
        let message = manager.inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else { return }

        // Clear input
        manager.inputText = ""

        // Add user message
        manager.addUserMessage(message)

        // Start processing and create streaming message
        manager.startProcessing()
        manager.startStreamingMessage()

        // Send to agent
        Task {
            do {
                try await agentService.streamMessage(
                    message,
                    sessionId: manager.currentSessionId
                ) { event in
                    handleStreamEvent(event)
                }
            } catch {
                await MainActor.run {
                    manager.finalizeStreamingMessage()
                    manager.stopProcessing()
                    manager.showError(error.localizedDescription)
                }
            }
        }
    }
    
    private func handleStreamEvent(_ event: AgentStreamEventType) {
        switch event {
        case .action(let tool, let status, let formatted):
            // Don't show "idle" tool as a step - it's just the completion signal
            guard tool != "idle" else { return }
            // Add step to streaming message (displayed inline in message bubble)
            let details = extractPlainText(from: formatted)
            manager.addStepToStreamingMessage(tool: tool, status: status, details: details)

        case .status(let message, let tool, let phase):
            // Convert phase to status and add step
            let status: ActionStatus = phase == .done ? .done : (phase == .error ? .failed : .running)
            manager.addStepToStreamingMessage(tool: tool, status: status, details: message)

        case .message(let content):
            if !content.isEmpty {
                // Update streaming message content
                manager.updateStreamingContent(content)
            }

        case .question(let text, _):
            if !text.isEmpty {
                manager.updateStreamingContent(text)
            }

        case .exercises(let exercises):
            // TODO: Handle exercises if needed in chat context
            print("Received \(exercises.count) exercises from agent")

        case .done(let sessionId):
            manager.currentSessionId = sessionId
            manager.finalizeStreamingMessage()
            manager.stopProcessing()

        case .error(let message):
            manager.finalizeStreamingMessage()
            manager.stopProcessing()
            manager.showError(message)
        }
    }

    /// Extract plain text from XML-formatted result string
    /// Converts "<result>text</result>" to "text"
    private func extractPlainText(from formatted: String?) -> String? {
        guard let formatted = formatted else { return nil }

        // Remove <result> and </result> tags
        let pattern = "<result[^>]*>([\\s\\S]*?)</result>"
        if let regex = try? NSRegularExpression(pattern: pattern, options: []),
           let match = regex.firstMatch(in: formatted, options: [], range: NSRange(formatted.startIndex..., in: formatted)),
           let range = Range(match.range(at: 1), in: formatted) {
            return String(formatted[range])
        }

        // If no XML tags, return as-is
        return formatted
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        // Background content
        AnimatedGradientBackground()
        
        VStack {
            Text("Home Screen Content")
                .font(AppTheme.Typography.titleFont)
                .foregroundColor(AppTheme.Colors.primaryText)
        }
        
        // Overlay
        AssistantOverlayView()
            .environment(\.assistantManager, {
                let manager = AssistantOverlayManager()
                manager.state = .active
                manager.messages = ChatMessage.samples
                return manager
            }())
    }
}
