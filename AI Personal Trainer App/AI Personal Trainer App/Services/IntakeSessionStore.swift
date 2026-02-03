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
    @Published var summary: IntakeSummary?
    @Published var errorMessage: String?

    private let apiService = APIService()

    private init() {}

    func startOrResume() async {
        isLoading = true
        errorMessage = nil
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
                        print("[Intake] Progress updated: \(progress.requiredDone)/\(progress.requiredTotal)")
                    }
                case "conversation_complete":
                    // Backend signals conversation is complete
                    print("[Intake] Received conversation_complete event")
                    shouldConfirm = true
                case "safety_flag":
                    break
                case "done":
                    self.isLoading = false
                default:
                    break
                }
            }

            // Trigger confirmation if backend signaled completion
            print("[Intake] Stream complete. shouldConfirm=\(shouldConfirm), summary=\(summary != nil), isConfirming=\(isConfirming)")
            if shouldConfirm && self.summary == nil && !self.isConfirming {
                print("[Intake] Calling confirmIntake()...")
                await self.confirmIntake()
                print("[Intake] confirmIntake() finished. summary=\(summary != nil)")
            }
        } catch {
            print("[Intake] Error in submitAnswer: \(error)")
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }

    func confirmIntake() async {
        guard let sessionId = session?.id else {
            print("[Intake] confirmIntake: No session ID")
            return
        }
        print("[Intake] confirmIntake: Starting with sessionId=\(sessionId)")
        isConfirming = true
        do {
            let response = try await apiService.confirmIntake(sessionId: sessionId)
            print("[Intake] confirmIntake: Got response, summary=\(response.summary != nil)")
            summary = response.summary
        } catch {
            print("[Intake] confirmIntake: Error - \(error)")
            errorMessage = error.localizedDescription
        }
        isConfirming = false
    }
}
