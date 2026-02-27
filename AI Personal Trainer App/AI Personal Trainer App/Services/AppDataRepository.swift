import Foundation

actor AppDataRepository {
    static let shared = AppDataRepository()

    private let apiService = APIService.shared
    private let cache = LocalCacheStore.shared

    private enum TTL {
        static let dailyMessage: TimeInterval = 24 * 60 * 60
        static let calendar: TimeInterval = 15 * 60
        static let historyRecent: TimeInterval = 10 * 60
        static let historyOlder: TimeInterval = 24 * 60 * 60
        static let workoutDetail: TimeInterval = 24 * 60 * 60
        static let weeklyReports: TimeInterval = 15 * 60
    }

    private enum CacheKey {
        static let calendarEvents = "cache.calendar.events"
        static let calendarHistoryIndex = "cache.calendar.history_index"
        static let weeklyReports = "cache.weekly.reports"
        static let historyPagePrefix = "cache.history.page"
        static let workoutDetailPrefix = "cache.workout.detail"
    }

    func loadDailyMessage(forceRefresh: Bool = false, timeZone: String = TimeZone.current.identifier) async throws -> DailyMessage {
        let key = "cache.daily.message.\(sanitizeCacheComponent(timeZone))"
        let cached: LocalCacheRecord<DailyMessage>? = await cache.load(DailyMessage.self, key: key)
        let today = messageDateString(for: Date(), timeZone: timeZone)

        if !forceRefresh, let cached, cached.value.messageDate == today {
            return cached.value
        }

        do {
            let fresh = try await apiService.fetchDailyMessage(timeZone: timeZone)
            await cache.save(fresh, key: key)
            return fresh
        } catch {
            if let cached {
                return cached.value
            }
            throw error
        }
    }

    func loadCalendarEvents(start: Date, end: Date, forceRefresh: Bool = false) async throws -> [CalendarEvent] {
        let cached: LocalCacheRecord<CalendarEventsCachePayload>? = await cache.load(CalendarEventsCachePayload.self, key: CacheKey.calendarEvents)

        if !forceRefresh,
           let cached,
           !isStale(cached.fetchedAt, ttl: TTL.calendar),
           cached.value.covers(start: start, end: end) {
            return cached.value.filtered(start: start, end: end)
        }

        do {
            let events = try await apiService.listCalendarEvents(start: start, end: end)
            let payload = CalendarEventsCachePayload(requestedStart: start, requestedEnd: end, events: events)
            await cache.save(payload, key: CacheKey.calendarEvents)
            return events
        } catch {
            if let cached, cached.value.covers(start: start, end: end) {
                return cached.value.filtered(start: start, end: end)
            }
            throw error
        }
    }

    func loadWeeklyReports(forceRefresh: Bool = false) async throws -> [WeeklyReport] {
        let cached: LocalCacheRecord<[WeeklyReport]>? = await cache.load([WeeklyReport].self, key: CacheKey.weeklyReports)
        if !forceRefresh, let cached, !isStale(cached.fetchedAt, ttl: TTL.weeklyReports) {
            return cached.value
        }

        do {
            let reports = try await apiService.listWeeklyReports()
            await cache.save(reports, key: CacheKey.weeklyReports)
            return reports
        } catch {
            if let cached {
                return cached.value
            }
            throw error
        }
    }

    func loadWorkoutHistoryPage(limit: Int = 20, cursor: String? = nil, forceRefresh: Bool = false) async throws -> WorkoutHistoryResponse {
        let key = historyPageKey(limit: limit, cursor: cursor)
        let cached: LocalCacheRecord<WorkoutHistoryResponse>? = await cache.load(WorkoutHistoryResponse.self, key: key)
        let ttl = (cursor == nil || cursor?.isEmpty == true) ? TTL.historyRecent : TTL.historyOlder

        if !forceRefresh, let cached, !isStale(cached.fetchedAt, ttl: ttl) {
            return cached.value
        }

        do {
            let response = try await apiService.fetchWorkoutHistory(limit: limit, cursor: cursor)
            await cache.save(response, key: key)
            return response
        } catch {
            if let cached {
                return cached.value
            }
            throw error
        }
    }

    func loadWorkoutSessionDetail(sessionId: String, forceRefresh: Bool = false) async throws -> WorkoutTrackingSessionResponse {
        let key = "\(CacheKey.workoutDetailPrefix).\(sanitizeCacheComponent(sessionId))"
        let cached: LocalCacheRecord<WorkoutTrackingSessionResponse>? = await cache.load(WorkoutTrackingSessionResponse.self, key: key)

        if !forceRefresh, let cached, !isStale(cached.fetchedAt, ttl: TTL.workoutDetail) {
            return cached.value
        }

        do {
            let detail = try await apiService.fetchWorkoutTrackingSession(sessionId: sessionId)
            await cache.save(detail, key: key)
            return detail
        } catch {
            if let cached {
                return cached.value
            }
            throw error
        }
    }

    func loadCalendarHistoryIndex(forceRefresh: Bool = false, maxPages: Int = 3, pageLimit: Int = 50) async throws -> [String: WorkoutHistorySessionItem] {
        let cached: LocalCacheRecord<[String: WorkoutHistorySessionItem]>? = await cache.load([String: WorkoutHistorySessionItem].self, key: CacheKey.calendarHistoryIndex)
        if !forceRefresh, let cached, !isStale(cached.fetchedAt, ttl: TTL.historyRecent) {
            return cached.value
        }

        do {
            var cursor: String?
            var allItems: [WorkoutHistorySessionItem] = []

            for _ in 0..<maxPages {
                let page = try await loadWorkoutHistoryPage(limit: pageLimit, cursor: cursor, forceRefresh: forceRefresh)
                allItems.append(contentsOf: page.items)
                guard let next = page.nextCursor, !next.isEmpty else { break }
                cursor = next
            }

            let index = allItems.reduce(into: [String: WorkoutHistorySessionItem]()) { acc, item in
                guard let eventId = item.calendarEventId else { return }
                if let existing = acc[eventId] {
                    let existingDate = existing.completedAt ?? existing.startedAt ?? .distantPast
                    let candidateDate = item.completedAt ?? item.startedAt ?? .distantPast
                    if candidateDate > existingDate {
                        acc[eventId] = item
                    }
                } else {
                    acc[eventId] = item
                }
            }

            await cache.save(index, key: CacheKey.calendarHistoryIndex)
            return index
        } catch {
            if let cached {
                return cached.value
            }
            throw error
        }
    }

    func invalidateCalendar() async {
        await cache.remove(key: CacheKey.calendarEvents)
    }

    func invalidateHistory() async {
        await cache.removeAll(prefix: CacheKey.historyPagePrefix)
        await cache.removeAll(prefix: CacheKey.workoutDetailPrefix)
        await cache.remove(key: CacheKey.calendarHistoryIndex)
    }

    func invalidateAfterWorkoutMutation(calendarChanged: Bool) async {
        await invalidateHistory()
        if calendarChanged {
            await invalidateCalendar()
        }
    }

    private func isStale(_ fetchedAt: Date, ttl: TimeInterval) -> Bool {
        Date().timeIntervalSince(fetchedAt) > ttl
    }

    private func messageDateString(for date: Date, timeZone: String) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: timeZone) ?? .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func historyPageKey(limit: Int, cursor: String?) -> String {
        let rawCursor = cursor.flatMap { $0.isEmpty ? nil : $0 } ?? "first"
        let cursorPart = sanitizeCacheComponent(rawCursor)
        return "\(CacheKey.historyPagePrefix).limit_\(limit).cursor_\(cursorPart)"
    }

    private func sanitizeCacheComponent(_ value: String) -> String {
        value
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "?", with: "_")
            .replacingOccurrences(of: "&", with: "_")
            .replacingOccurrences(of: "=", with: "_")
            .replacingOccurrences(of: ".", with: "_")
    }
}
