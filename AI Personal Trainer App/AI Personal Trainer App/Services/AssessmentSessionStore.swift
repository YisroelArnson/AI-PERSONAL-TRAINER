import Foundation
import SwiftUI

@MainActor
final class AssessmentSessionStore: ObservableObject {
    static let shared = AssessmentSessionStore()

    @Published var session: AssessmentSession?
    @Published var steps: [AssessmentStep] = []
    @Published var currentStep: AssessmentStep?
    @Published var baseline: AssessmentBaseline?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let apiService = APIService()

    private init() {}

    func startOrResume() async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.createAssessmentSession()
            session = response.session
            steps = try await apiService.fetchAssessmentSteps()
            if let currentId = response.session.currentStepId {
                currentStep = steps.first { $0.id == currentId } ?? steps.first
            } else {
                currentStep = steps.first
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func submit(result: [String: CodableValue]) async {
        guard let sessionId = session?.id, let step = currentStep else { return }
        isLoading = true
        do {
            let next = try await apiService.submitAssessmentStep(sessionId: sessionId, stepId: step.id, result: result)
            currentStep = next
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func skip(reason: String) async {
        guard let sessionId = session?.id, let step = currentStep else { return }
        isLoading = true
        do {
            let next = try await apiService.skipAssessmentStep(sessionId: sessionId, stepId: step.id, reason: reason)
            currentStep = next
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func complete() async {
        guard let sessionId = session?.id else { return }
        isLoading = true
        do {
            let response = try await apiService.completeAssessment(sessionId: sessionId)
            baseline = response.baseline
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
