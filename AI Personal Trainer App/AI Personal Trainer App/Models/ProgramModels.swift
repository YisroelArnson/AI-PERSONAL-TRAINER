import Foundation

struct ProgramResponse: Codable {
    let success: Bool
    let program: TrainingProgram
}

struct TrainingProgram: Codable, Identifiable {
    let id: String
    let status: String
    let version: Int
    let programMarkdown: String?

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case version
        case programMarkdown = "program_markdown"
    }
}

struct ProgramEditRequest: Encodable {
    let instruction: String
}
