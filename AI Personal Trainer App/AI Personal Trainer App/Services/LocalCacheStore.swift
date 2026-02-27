import Foundation

struct LocalCacheRecord<Value: Codable>: Codable {
    let value: Value
    let fetchedAt: Date
}

struct CalendarEventsCachePayload: Codable {
    let requestedStart: Date
    let requestedEnd: Date
    let events: [CalendarEvent]

    func covers(start: Date, end: Date) -> Bool {
        requestedStart <= start && requestedEnd >= end
    }

    func filtered(start: Date, end: Date) -> [CalendarEvent] {
        events.filter { event in
            event.startAt >= start && event.startAt <= end
        }
    }
}

actor LocalCacheStore {
    static let shared = LocalCacheStore()

    private let defaults = UserDefaults.standard
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    func load<Value: Codable>(_ type: Value.Type, key: String) -> LocalCacheRecord<Value>? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? decoder.decode(LocalCacheRecord<Value>.self, from: data)
    }

    func save<Value: Codable>(_ value: Value, key: String, fetchedAt: Date = Date()) {
        let record = LocalCacheRecord(value: value, fetchedAt: fetchedAt)
        guard let encoded = try? encoder.encode(record) else { return }
        defaults.set(encoded, forKey: key)
    }

    func remove(key: String) {
        defaults.removeObject(forKey: key)
    }

    func removeAll(prefix: String) {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(prefix) {
            defaults.removeObject(forKey: key)
        }
    }
}
