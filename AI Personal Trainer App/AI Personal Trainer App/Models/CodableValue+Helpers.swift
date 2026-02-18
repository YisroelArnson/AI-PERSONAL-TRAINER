import Foundation

extension CodableValue {
    var stringValue: String? {
        switch self {
        case .string(let value):
            return value
        case .int(let value):
            return String(value)
        case .double(let value):
            return String(value)
        case .bool(let value):
            return value ? "yes" : "no"
        case .stringArray(let value):
            return value.joined(separator: ", ")
        case .array(let value):
            return value.compactMap { $0.stringValue }.joined(separator: ", ")
        case .object:
            return nil
        case .null:
            return nil
        }
    }

    var intValue: Int? {
        switch self {
        case .int(let value):
            return value
        case .double(let value):
            return Int(value)
        case .string(let value):
            return Int(value)
        default:
            return nil
        }
    }
}
