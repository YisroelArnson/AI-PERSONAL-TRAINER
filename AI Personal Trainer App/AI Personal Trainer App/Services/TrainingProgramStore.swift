import Foundation
import SwiftUI

@MainActor
final class TrainingProgramStore: ObservableObject {
    static let shared = TrainingProgramStore()

    @Published var program: TrainingProgram?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let apiService = APIService()

    private init() {}

    func draft() async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.draftTrainingProgram()
            program = response.program
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func edit(instruction: String) async {
        guard let programId = program?.id else { return }
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.editTrainingProgram(programId: programId, instruction: instruction)
            program = response.program
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func approve() async {
        guard let programId = program?.id else { return }
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.approveTrainingProgram(programId: programId)
            program = response.program
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func activate() async {
        guard let programId = program?.id else { return }
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.activateTrainingProgram(programId: programId)
            program = response.program
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
