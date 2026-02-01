//
//  FloatingMessageStack.swift
//  AI Personal Trainer App
//
//  Scrollable stack of chat messages with expand/collapse functionality.
//

import SwiftUI

struct FloatingMessageStack: View {
    let messages: [ChatMessage]
    let isExpanded: Bool
    var currentStep: StepItem? = nil  // For streaming updates
    let onExpandToggle: () -> Void

    // Artifact action callbacks
    var onStartWorkout: ((Artifact) -> Void)? = nil
    var onAddToCurrent: ((Artifact) -> Void)? = nil
    var onReplaceCurrent: ((Artifact) -> Void)? = nil

    // Question option selection callback
    var onOptionSelected: ((String) -> Void)? = nil

    // Scroll state
    @State private var scrollProxy: ScrollViewProxy?
    @Namespace private var bottomID

    // Computed heights
    private var collapsedHeight: CGFloat { 200 }
    private var expandedHeight: CGFloat { UIScreen.main.bounds.height * 0.6 }

    private var currentHeight: CGFloat {
        isExpanded ? expandedHeight : collapsedHeight
    }

    var body: some View {
        VStack(spacing: 0) {
            // Expand/collapse handle
            expandHandle

            // Messages scroll view
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: AppTheme.Spacing.md) {
                        ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                            VStack(spacing: AppTheme.Spacing.sm) {
                                // Show steps BEFORE an assistant message (between user and assistant)
                                if message.role == .assistant {
                                    // Show steps row if this message has steps or is streaming
                                    if !message.steps.isEmpty || message.isStreaming {
                                        StepsRow(
                                            steps: message.steps,
                                            isStreaming: message.isStreaming,
                                            currentStep: message.isStreaming ? currentStep : nil
                                        )
                                    }
                                }

                                // Only show message bubble if there's content
                                if !message.content.isEmpty {
                                    MessageBubble(message: message)
                                }

                                // Show artifact card if message has an artifact attached
                                if let artifact = message.artifact, message.role == .assistant {
                                    ArtifactCard(
                                        artifact: artifact,
                                        onStartWorkout: { onStartWorkout?(artifact) },
                                        onAddToCurrent: { onAddToCurrent?(artifact) },
                                        onReplaceCurrent: { onReplaceCurrent?(artifact) }
                                    )
                                    .padding(.top, AppTheme.Spacing.xs)
                                }

                                // Show question options if message has options (from message_ask_user)
                                if let options = message.questionOptions,
                                   !options.isEmpty,
                                   message.role == .assistant,
                                   !message.isStreaming {
                                    QuestionOptionsView(
                                        options: options,
                                        onOptionSelected: { option in
                                            onOptionSelected?(option)
                                        }
                                    )
                                    .padding(.top, AppTheme.Spacing.xs)
                                }
                            }
                        }

                        // Anchor for auto-scroll
                        Color.clear
                            .frame(height: 1)
                            .id(bottomID)
                    }
                    .padding(.horizontal, AppTheme.Spacing.sm)
                    .padding(.vertical, AppTheme.Spacing.md)
                }
                .frame(maxHeight: currentHeight)
                .onAppear {
                    scrollProxy = proxy
                }
                .onChange(of: messages.count) { _, _ in
                    scrollToBottom(animated: true)
                }
                .onChange(of: currentStep?.id) { _, _ in
                    // Also scroll when step updates during streaming
                    scrollToBottom(animated: true)
                }
            }
        }
        .background(stackBackground)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.xlarge))
        .gesture(expandGesture)
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: isExpanded)
    }
    
    // MARK: - Subviews
    
    private var expandHandle: some View {
        VStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2)
                .fill(AppTheme.Colors.tertiaryText.opacity(0.4))
                .frame(width: 36, height: 4)
        }
        .frame(height: 24)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture {
            onExpandToggle()
        }
    }
    
    private var stackBackground: some View {
        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.xlarge)
            .fill(AppTheme.Colors.surface)
    }
    
    // MARK: - Gestures
    
    private var expandGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onEnded { value in
                // Swipe up to expand
                if value.translation.height < -50 && !isExpanded {
                    onExpandToggle()
                }
                // Swipe down to collapse
                else if value.translation.height > 50 && isExpanded {
                    onExpandToggle()
                }
            }
    }
    
    // MARK: - Helpers
    
    private func scrollToBottom(animated: Bool) {
        if animated {
            withAnimation(.easeOut(duration: 0.3)) {
                scrollProxy?.scrollTo(bottomID, anchor: .bottom)
            }
        } else {
            scrollProxy?.scrollTo(bottomID, anchor: .bottom)
        }
    }
}

// MARK: - Steps Row (shown between messages)

/// A row displaying agent steps between messages
/// During streaming: shows animated current step
/// After completion: shows collapsible "X steps" summary
struct StepsRow: View {
    let steps: [StepItem]
    let isStreaming: Bool
    let currentStep: StepItem?

    var body: some View {
        HStack {
            // Left-align steps
            if isStreaming {
                StreamingStepsLine(
                    currentStep: currentStep,
                    completedCount: steps.filter { $0.status == .done }.count
                )
            } else if !steps.isEmpty {
                CollapsedStepsSummary(steps: steps)
            }

            Spacer()
        }
        .padding(.horizontal, AppTheme.Spacing.sm)
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        AnimatedGradientBackground()

        VStack {
            Spacer()

            FloatingMessageStack(
                messages: ChatMessage.samples,
                isExpanded: false,
                onExpandToggle: { print("Toggle expand") }
            )
            .padding()
        }
    }
}

#Preview("Expanded") {
    ZStack {
        AnimatedGradientBackground()

        VStack {
            Spacer()

            FloatingMessageStack(
                messages: ChatMessage.samples + ChatMessage.samples,
                isExpanded: true,
                onExpandToggle: { print("Toggle expand") }
            )
            .padding()
        }
    }
}

#Preview("With Streaming") {
    ZStack {
        AnimatedGradientBackground()

        VStack {
            Spacer()

            FloatingMessageStack(
                messages: [
                    ChatMessage(role: .user, content: "I want to work out today"),
                    ChatMessage.streamingSample
                ],
                isExpanded: false,
                currentStep: StepItem(
                    tool: "fetch_preferences",
                    displayName: "Loading preferences",
                    status: .running
                ),
                onExpandToggle: { print("Toggle expand") }
            )
            .padding()
        }
    }
}

#Preview("With Question Options") {
    ZStack {
        AnimatedGradientBackground()

        VStack {
            Spacer()

            FloatingMessageStack(
                messages: [
                    ChatMessage(role: .user, content: "Generate me a workout"),
                    ChatMessage(
                        role: .assistant,
                        content: "Would you like me to generate a new workout to replace your current one, or would you prefer to continue with your existing workout?",
                        steps: [
                            StepItem(tool: "fetch_workout_history", displayName: "Fetched workout history", status: .done),
                            StepItem(tool: "fetch_preferences", displayName: "Loaded preferences", status: .done)
                        ],
                        questionOptions: [
                            "Generate a new workout",
                            "Keep my current workout"
                        ]
                    )
                ],
                isExpanded: true,
                onExpandToggle: { print("Toggle expand") },
                onOptionSelected: { option in
                    print("Selected: \(option)")
                }
            )
            .padding()
        }
    }
}
