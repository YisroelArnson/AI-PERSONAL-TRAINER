//
//  AssistantOverlayManager.swift
//  AI Personal Trainer App
//
//  Global state manager for the AI Assistant overlay.
//  Manages overlay visibility, chat messages, and interaction states.
//

import SwiftUI
import Observation

// Note: StatusPhase is defined in AgentService.swift

/// State machine for the assistant overlay
enum AssistantOverlayState: Equatable {
    /// Overlay is hidden, only AI button visible
    case idle
    /// Overlay is open with blur backdrop, messages visible
    case active
    /// User is typing in the input bar
    case typing
    /// Messages expanded to full height for scrolling
    case expanded
    /// Overlay minimized to a pill (after user dismisses but agent may respond)
    case minimized
}

/// A step queued for display with minimum timing
private struct QueuedStep {
    let tool: String
    let status: ActionStatus
    let details: String?
}

/// Observable state manager for the assistant overlay
@Observable
final class AssistantOverlayManager {
    // MARK: - State

    /// Current state of the overlay
    var state: AssistantOverlayState = .idle

    /// Chat messages in the current session
    var messages: [ChatMessage] = []

    /// Whether the agent is currently processing a request
    var isProcessing: Bool = false

    /// Number of unread responses when minimized
    var pendingResponseCount: Int = 0

    /// Current session ID for the chat
    var currentSessionId: String?

    /// Current input text
    var inputText: String = ""

    /// Error message to display (if any)
    var errorMessage: String?

    /// The height offset for the message stack (for drag gestures)
    var dragOffset: CGFloat = 0

    /// Current streaming step (for inline display in message bubble)
    var currentStreamingStep: StepItem?

    /// ID of the message currently being streamed (if any)
    private var streamingMessageId: UUID?

    // MARK: - Step Queue (for minimum display time)

    /// Queue of steps waiting to be displayed
    private var stepQueue: [QueuedStep] = []

    /// Whether the queue processor is currently running
    private var isProcessingQueue: Bool = false

    /// Minimum time to display each step (in seconds)
    private let minimumStepDisplayTime: TimeInterval = 1.0

    /// Task for processing the step queue
    private var queueProcessorTask: Task<Void, Never>?
    
    // MARK: - Computed Properties
    
    /// Whether the overlay should show (any state except idle)
    var isOverlayVisible: Bool {
        state != .idle
    }
    
    /// Whether the blur backdrop should be visible
    var showBlurBackdrop: Bool {
        state == .active || state == .typing || state == .expanded
    }
    
    /// Whether the input bar should be visible
    var showInputBar: Bool {
        state == .active || state == .typing || state == .expanded
    }
    
    /// Whether messages should be visible
    var showMessages: Bool {
        (state == .active || state == .typing || state == .expanded) && !messages.isEmpty
    }
    
    /// Whether the minimized pill should be visible
    var showMinimizedPill: Bool {
        state == .minimized && pendingResponseCount > 0
    }
    
    /// The latest assistant message (for minimized pill)
    var latestAssistantMessage: ChatMessage? {
        messages.last(where: { $0.role == .assistant })
    }
    
    // MARK: - State Transitions
    
    /// Open the assistant overlay
    func open() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            state = .active
            pendingResponseCount = 0
        }
    }
    
    /// Close the overlay completely
    func close() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            state = .idle
            dragOffset = 0
        }
    }

    /// Minimize the overlay to a pill
    func minimize() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            state = .minimized
            dragOffset = 0
        }
    }
    
    /// Expand messages to full height
    func expand() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            state = .expanded
        }
    }
    
    /// Collapse from expanded to active
    func collapse() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            state = .active
        }
    }
    
    /// Enter typing state
    func startTyping() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            state = .typing
        }
    }
    
    /// Exit typing state
    func stopTyping() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            if state == .typing {
                state = .active
            }
        }
    }
    
    // MARK: - Message Management

    /// Add a user message to the chat
    func addUserMessage(_ content: String) {
        let message = ChatMessage(role: .user, content: content)
        messages.append(message)
    }

    /// Add an assistant message to the chat (for non-streaming responses)
    func addAssistantMessage(_ content: String) {
        let message = ChatMessage(role: .assistant, content: content)
        messages.append(message)

        // Increment pending count if minimized
        if state == .minimized {
            pendingResponseCount += 1
        }
    }

    /// Clear all messages and start fresh
    func clearMessages() {
        messages.removeAll()
        currentSessionId = nil
        pendingResponseCount = 0
        streamingMessageId = nil
        currentStreamingStep = nil

        // Clear the step queue
        stepQueue.removeAll()
        isProcessingQueue = false
        queueProcessorTask?.cancel()
        queueProcessorTask = nil
    }

    // MARK: - Streaming Message Management

    /// Start a new streaming assistant message
    func startStreamingMessage() {
        let message = ChatMessage(
            role: .assistant,
            content: "",
            steps: [],
            isStreaming: true
        )
        streamingMessageId = message.id
        messages.append(message)

        // Clear any existing queue and start fresh
        stepQueue.removeAll()
        isProcessingQueue = false
        queueProcessorTask?.cancel()
        queueProcessorTask = nil
    }

    /// Add or update a step in the current streaming message
    /// Steps are queued to ensure minimum display time of 1 second each
    func addStepToStreamingMessage(tool: String, status: ActionStatus, details: String? = nil) {
        guard streamingMessageId != nil else { return }

        // Queue the step for display
        let queuedStep = QueuedStep(tool: tool, status: status, details: details)
        stepQueue.append(queuedStep)

        // Start processing if not already running
        if !isProcessingQueue {
            startQueueProcessor()
        }
    }

    /// Start the queue processor task
    private func startQueueProcessor() {
        guard !isProcessingQueue else { return }
        isProcessingQueue = true

        queueProcessorTask = Task { @MainActor in
            while !stepQueue.isEmpty {
                // Get the next step from the queue
                let step = stepQueue.removeFirst()

                // Display this step
                displayStep(step)

                // Wait for minimum display time before showing next step
                // (unless this is the last step in queue)
                if !stepQueue.isEmpty {
                    try? await Task.sleep(nanoseconds: UInt64(minimumStepDisplayTime * 1_000_000_000))
                }
            }

            isProcessingQueue = false
        }
    }

    /// Actually display a step in the message and update currentStreamingStep
    private func displayStep(_ queuedStep: QueuedStep) {
        guard let messageId = streamingMessageId,
              let index = messages.firstIndex(where: { $0.id == messageId }) else { return }

        let tool = queuedStep.tool
        let status = queuedStep.status
        let details = queuedStep.details

        let isCompleted = status == .done || status == .failed
        let displayName = StepItem.humanFriendlyName(for: tool, completed: isCompleted)

        // Check if this tool already exists (update it) or is new (append)
        if let stepIndex = messages[index].steps.firstIndex(where: { $0.tool == tool }) {
            // Update existing step
            messages[index].steps[stepIndex] = StepItem(
                id: messages[index].steps[stepIndex].id,
                tool: tool,
                displayName: displayName,
                status: status,
                details: details
            )
        } else {
            // Add new step
            let step = StepItem(
                tool: tool,
                displayName: displayName,
                status: status,
                details: details
            )
            messages[index].steps.append(step)
        }

        // Update current streaming step for UI (always show the step being processed)
        currentStreamingStep = StepItem(
            tool: tool,
            displayName: StepItem.humanFriendlyName(for: tool, completed: false),
            status: .running,
            details: details
        )
    }

    /// Update the content of the streaming message
    /// If the current streaming message already has content, creates a new message
    func updateStreamingContent(_ content: String) {
        guard let messageId = streamingMessageId,
              let index = messages.firstIndex(where: { $0.id == messageId }) else { return }

        // If current message is empty, set the content
        if messages[index].content.isEmpty {
            messages[index].content = content
        } else {
            // Current message already has content - finalize it and create a new one
            messages[index].isStreaming = false

            // Create a new streaming message for this content
            let newMessage = ChatMessage(
                role: .assistant,
                content: content,
                steps: [],  // Steps stay with the first message
                isStreaming: true
            )
            streamingMessageId = newMessage.id
            messages.append(newMessage)
        }
    }

    /// Update the streaming message content and attach an artifact
    /// If the current streaming message already has content, creates a new message with the artifact
    func updateStreamingContentWithArtifact(_ content: String, artifact: Artifact) {
        guard let messageId = streamingMessageId,
              let index = messages.firstIndex(where: { $0.id == messageId }) else { return }

        // If current message is empty, set the content and artifact
        if messages[index].content.isEmpty {
            messages[index].content = content
            messages[index].artifact = artifact
        } else {
            // Current message already has content - finalize it and create a new one
            messages[index].isStreaming = false

            // Create a new streaming message for this content with artifact
            let newMessage = ChatMessage(
                role: .assistant,
                content: content,
                steps: [],  // Steps stay with the first message
                isStreaming: true,
                artifact: artifact
            )
            streamingMessageId = newMessage.id
            messages.append(newMessage)
        }
    }

    /// Update the streaming message content with question options
    /// If the current streaming message already has content, creates a new message with the options
    func updateStreamingContentWithOptions(_ content: String, options: [String]) {
        guard let messageId = streamingMessageId,
              let index = messages.firstIndex(where: { $0.id == messageId }) else { return }

        // If current message is empty, set the content and options
        if messages[index].content.isEmpty {
            messages[index].content = content
            messages[index].questionOptions = options
        } else {
            // Current message already has content - finalize it and create a new one
            messages[index].isStreaming = false

            // Create a new streaming message for this content with options
            let newMessage = ChatMessage(
                role: .assistant,
                content: content,
                steps: [],  // Steps stay with the first message
                isStreaming: true,
                questionOptions: options
            )
            streamingMessageId = newMessage.id
            messages.append(newMessage)
        }
    }

    /// Finalize the streaming message (mark as complete)
    /// Waits for any remaining queued steps to be displayed before finalizing
    func finalizeStreamingMessage() {
        let messageId = streamingMessageId

        // Process any remaining steps in the queue before finalizing
        Task { @MainActor in
            // Wait for queue to finish processing
            while isProcessingQueue || !stepQueue.isEmpty {
                try? await Task.sleep(nanoseconds: 100_000_000) // Check every 100ms
            }

            // Now finalize the message
            guard let messageId = messageId,
                  let index = messages.firstIndex(where: { $0.id == messageId }) else { return }

            messages[index].isStreaming = false
            streamingMessageId = nil
            currentStreamingStep = nil

            // Clean up queue state
            queueProcessorTask?.cancel()
            queueProcessorTask = nil

            // Increment pending count if minimized
            if state == .minimized && !messages[index].content.isEmpty {
                pendingResponseCount += 1
            }
        }
    }
    
    // MARK: - Error Handling
    
    /// Show an error message
    func showError(_ message: String) {
        errorMessage = message
        
        // Auto-clear error after 5 seconds
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if self.errorMessage == message {
                self.errorMessage = nil
            }
        }
    }
    
    /// Clear the current error
    func clearError() {
        errorMessage = nil
    }
    
    // MARK: - Processing State

    /// Start processing (show thinking indicator)
    func startProcessing() {
        isProcessing = true
    }

    /// Stop processing
    func stopProcessing() {
        isProcessing = false
        // Note: Don't clear currentStreamingStep here - let finalizeStreamingMessage handle it
        // after the queue finishes processing
    }
}

// MARK: - Environment Key

struct AssistantOverlayManagerKey: EnvironmentKey {
    static let defaultValue: AssistantOverlayManager = AssistantOverlayManager()
}

extension EnvironmentValues {
    var assistantManager: AssistantOverlayManager {
        get { self[AssistantOverlayManagerKey.self] }
        set { self[AssistantOverlayManagerKey.self] = newValue }
    }
}
