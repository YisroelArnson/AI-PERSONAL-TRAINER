import Foundation
import SwiftUI

@MainActor
final class IntakeSessionStore: ObservableObject {
    static let shared = IntakeSessionStore()

    @Published var session: IntakeSession?
    @Published var checklist: [IntakeChecklistItem] = []
    @Published var progress: IntakeProgress?
    @Published var transcript: [String] = []
    @Published var currentQuestion: String = ""
    @Published var isLoading: Bool = false
    @Published var isConfirming: Bool = false
    @Published var isComplete: Bool = false  // Prevents further input
    @Published var summary: IntakeSummary?
    @Published var errorMessage: String?

    private let apiService = APIService()

    private init() {}

    func startOrResume() async {
        isLoading = true
        errorMessage = nil
        isComplete = false  // Reset completion state when starting/resuming
        do {
            let response = try await apiService.createIntakeSession()
            session = response.session
            if let checklist = response.checklist {
                self.checklist = checklist
            }
            if let prompt = response.prompt {
                currentQuestion = prompt
                transcript.append("Coach: \(prompt)")
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func submitAnswer(_ text: String) async {
        guard let sessionId = session?.id else { return }

        // Don't allow submissions if already complete
        guard !isComplete else { return }

        transcript.append("You: \(text)")
        isLoading = true

        var shouldConfirm = false

        do {
            try await apiService.streamIntakeAnswer(sessionId: sessionId, answerText: text) { event in
                switch event.type {
                case "assistant_message":
                    if let message = event.data?.text {
                        self.currentQuestion = message
                        self.transcript.append("Coach: \(message)")
                    }
                case "checklist":
                    if let items = event.data?.items {
                        self.checklist = items
                    }
                case "progress":
                    if let progress = event.data?.progress {
                        self.progress = progress
                    }
                case "conversation_complete":
                    shouldConfirm = true
                    self.isComplete = true  // Disable further input immediately
                case "safety_flag":
                    break
                case "done":
                    self.isLoading = false
                default:
                    break
                }
            }

            if shouldConfirm && !self.isConfirming {
                Task.detached { [weak self] in
                    await self?.confirmIntakeWithRetry()
                }
            }
        } catch is CancellationError {
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }

    func confirmIntake() async {
        await confirmIntakeWithRetry()
    }

    private func confirmIntakeWithRetry(retryCount: Int = 0) async {
        guard let sessionId = session?.id else { return }
        guard !isConfirming else { return }
        guard summary == nil else { return }

        isConfirming = true

        do {
            let response = try await apiService.confirmIntake(sessionId: sessionId)
            summary = response.summary
            isConfirming = false
        } catch is CancellationError {
            isConfirming = false
            // Retry on cancellation (up to 2 retries)
            if retryCount < 2 {
                try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                await confirmIntakeWithRetry(retryCount: retryCount + 1)
            }
        } catch {
            errorMessage = error.localizedDescription
            isConfirming = false
        }
    }
}
