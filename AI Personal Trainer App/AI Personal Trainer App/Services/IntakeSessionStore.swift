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
                case "safety_flag":
                    break
                case "done":
                    self.isLoading = false
                default:
                    break
                }
            }
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }

    func confirmIntake() async {
        guard let sessionId = session?.id else { return }
        isConfirming = true
        do {
            let response = try await apiService.confirmIntake(sessionId: sessionId)
            summary = response.summary
        } catch {
            errorMessage = error.localizedDescription
        }
        isConfirming = false
    }
}
