import Foundation
import SwiftUI

@MainActor
final class GoalContractStore: ObservableObject {
    static let shared = GoalContractStore()

    @Published var contract: GoalContract?
    @Published var goalOptions: [GoalOption] = []
    @Published var selectedOptionId: String?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let apiService = APIService()

    private init() {}

    // MARK: - New Goal Options Flow

    func fetchGoalOptions() async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.generateGoalOptions()
            goalOptions = response.options
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func refineOptions(instruction: String) async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.refineGoalOptions(instruction: instruction)
            goalOptions = response.options
            selectedOptionId = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func selectOption(_ option: GoalOption) async {
        selectedOptionId = option.id
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.selectGoalOption(option)
            contract = response.goal
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Legacy Single-Draft Flow

    func draft() async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.draftGoalContract()
            contract = response.goal
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func edit(instruction: String) async {
        guard let goalId = contract?.id else { return }
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.editGoalContract(goalId: goalId, instruction: instruction)
            contract = response.goal
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func approve() async {
        guard let goalId = contract?.id else { return }
        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiService.approveGoalContract(goalId: goalId)
            contract = response.goal
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
