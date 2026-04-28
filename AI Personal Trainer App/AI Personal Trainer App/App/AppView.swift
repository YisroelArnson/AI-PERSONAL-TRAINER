// Defines app-level UI and bootstrapping for app view.
//
// Main functions in this file:
// - signOut: Handles Sign out for AppView.swift.
// - reset: Resets the relevant value back to its baseline state.
// - stableFeedItemID: Handles Stable feed item ID for AppView.swift.
// - loadOrCreateWorkoutDeviceID: Loads Or create workout device ID for the surrounding workflow.
// - workoutOutboxURL: Handles Workout outbox URL for AppView.swift.
// - loadWorkoutOutbox: Loads Workout outbox for the surrounding workflow.
// - saveWorkoutOutbox: Handles Save workout outbox for AppView.swift.
// - ensureRunTrace: Ensures Run trace is ready before work continues.
// - updateRunTrace: Updates Run trace with the latest state.
// - clearRunTraces: Handles Clear run traces for AppView.swift.
// - didSessionBoundaryChange: Handles Did session boundary change for AppView.swift.
// - makeAssistantTurnItem: Builds a stable live assistant turn row.
// - tracePresentation: Handles Trace presentation for AppView.swift.
// - activate: Handles Activate for AppView.swift.
// - manualRefresh: Handles Manual refresh for AppView.swift.
// - resetSession: Resets Session back to its baseline state.
// - submitComposer: Handles Submit composer for AppView.swift.
// - runQuickAction: Handles Run quick action for AppView.swift.
// - directWorkoutAction: Handles Direct workout action for AppView.swift.
// - runCardAction: Handles Run card action for AppView.swift.
// - runWorkoutAction: Handles Run workout action for AppView.swift.
// - buildWorkoutCommandRequest: Builds a Workout command request used by this file.
// - drainWorkoutCommandOutbox: Handles Drain workout command outbox for AppView.swift.
// - handleWorkoutCommandResponse: Handles Workout command response for this module.
// - recomputeOptimisticWorkout: Handles Recompute optimistic workout for AppView.swift.
// - mergeTranscript: Handles Merge transcript for AppView.swift.
// - toggleQuickActions: Handles Toggle quick actions for AppView.swift.
// - showError: Shows Error in the current UI state.
// - shouldRenderPendingUserMessage: Handles Should render pending user message for AppView.swift.
// - enqueuePendingUserMessage: Enqueues Pending user message for asynchronous work.
// - markPendingUserMessageAccepted: Marks Pending user message accepted with the appropriate status.
// - removePendingUserMessage: Handles Remove pending user message for AppView.swift.
// - reconcilePendingUserMessages: Reconciles Pending user messages with the system state.
// - mergeIncomingWorkout: Handles Merge incoming workout for AppView.swift.
// - refreshSurface: Refreshes Surface so it stays current.
// - recordAppDidBecomeInactive: Records App did become inactive for later use.
// - shouldConsiderAppOpenTrigger: Handles Should consider app open trigger for AppView.swift.
// - shouldTriggerAppOpenTrigger: Handles Should trigger app open trigger for AppView.swift.
// - appOpenLastInactiveDefaultsKey: Handles App open last inactive defaults key for AppView.swift.
// - submitMessage: Handles Submit message for AppView.swift.
// - startPolling: Starts Polling for this module.
// - startRunObservation: Starts Run observation for this module.
// - cancelRunObservation: Handles Cancel run observation for AppView.swift.
// - startBackgroundRunObservation: Starts Background run observation for this module.
// - cancelBackgroundRunObservation: Handles Cancel background run observation for AppView.swift.
// - showWorkoutAgentBannerIfNeeded: Shows Workout agent banner if needed in the current UI state.
// - handleBackgroundRunStreamEvent: Handles Background run stream event for this module.
// - normalizeToolActivityLabel: Normalizes Tool activity label into the format this file expects.
// - appendRunTraceActivity: Appends Run trace activity to the existing record.
// - appendStreamingChunk: Appends Streaming chunk to the existing record.
// - handleRunStreamEvent: Handles Run stream event for this module.
// - freshAccessToken: Handles Fresh access token for AppView.swift.
// - isTerminalExerciseStatus: Handles Is terminal exercise status for AppView.swift.
// - isTerminalSetStatus: Handles Is terminal set status for AppView.swift.
// - resolveCurrentExercise: Resolves Current exercise before the next step runs.
// - resolveCurrentSet: Resolves Current set before the next step runs.
// - recomputeProgress: Handles Recompute progress for AppView.swift.
// - resolveExerciseStatus: Resolves Exercise status before the next step runs.
// - firstLiveExercisePosition: Handles First live exercise position for AppView.swift.
// - firstPendingSetPosition: Handles First pending set position for AppView.swift.
// - activateWorkoutPosition: Handles Activate workout position for AppView.swift.
// - applyOptimisticWorkoutAction: Applies Optimistic workout action to the current data.
// - topGlassReservedHeight: Handles Top glass reserved height for AppView.swift.
// - handleMicrophoneTap: Handles Microphone tap for this module.
// - handleSend: Handles Send for this module.
// - syncLiveTranscriptIntoComposer: Handles Sync live transcript into composer for AppView.swift.
// - stopListeningAndCommitCurrentTranscript: Stops Listening and commit current transcript when it is no longer needed.
// - composedText: Handles Composed text for AppView.swift.
// - pinnedWorkoutControlActions: Handles Pinned workout control actions for AppView.swift.
// - setLine: Sets Line for later use.
// - formatPinnedSetTarget: Formats Pinned set target for display or logging.
// - dockCircleButton: Handles Dock circle button for AppView.swift.
// - body: Builds and returns the SwiftUI view hierarchy for this type.
// - body: Builds and returns the SwiftUI view hierarchy for this type.
// - liquidGlassBackground: Handles Liquid glass background for AppView.swift.
// - liquidGlassCapsule: Handles Liquid glass capsule for AppView.swift.

import SwiftUI
import Supabase

struct AppView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var sessionController = AppSessionController()
    @StateObject private var viewModel = CoachSurfaceViewModel()
    @StateObject private var speechManager = SpeechManager()
    @State private var hasSeenActiveScene = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            backgroundAtmosphere

            Group {
                if sessionController.isBootstrapping {
                    loadingView
                } else if let session = sessionController.session {
                    CoachSurfaceScreen(
                        viewModel: viewModel,
                        speechManager: speechManager,
                        userEmail: session.user.email
                    ) {
                        Task { await sessionController.signOut() }
                    }
                } else {
                    SignedOutCoachView()
                }
            }
        }
        .task(id: sessionController.session?.user.id) {
            guard let session = sessionController.session else {
                viewModel.reset()
                return
            }

            await viewModel.activate(session: session)
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                guard hasSeenActiveScene else {
                    hasSeenActiveScene = true
                    return
                }

                guard let session = sessionController.session else { return }

                Task { await viewModel.activate(session: session) }
            case .inactive, .background:
                viewModel.recordAppDidBecomeInactive()
            @unknown default:
                break
            }
        }
        .onChange(of: speechManager.errorMessage) { _, error in
            guard let error, !error.isEmpty else { return }
            viewModel.showError(error)
        }
        .toast($viewModel.toast)
    }

    private var backgroundAtmosphere: some View {
        ZStack {
            Circle()
                .fill(AppTheme.Colors.highlight)
                .frame(width: 340, height: 340)
                .blur(radius: 72)
                .offset(x: -150, y: -310)

            RoundedRectangle(cornerRadius: 120, style: .continuous)
                .fill(AppTheme.Colors.highlight)
                .frame(width: 280, height: 220)
                .blur(radius: 64)
                .offset(x: 135, y: 310)

            Circle()
                .fill(AppTheme.Colors.orbSkyLight.opacity(0.22))
                .frame(width: 240, height: 240)
                .blur(radius: 58)
                .offset(x: 0, y: 380)
        }
        .allowsHitTesting(false)
    }

    private var loadingView: some View {
        VStack(spacing: 18) {
            ProgressView()
                .controlSize(.large)

            Text("Loading your coach")
                .font(AppTheme.Typography.cardTitle)
                .foregroundStyle(AppTheme.Colors.primaryText)
        }
    }
}

@MainActor
final class AppSessionController: ObservableObject {
    @Published private(set) var session: Session?
    @Published private(set) var isBootstrapping = true

    private var authStateTask: Task<Void, Never>?

    init() {
        session = supabase.auth.currentSession
        isBootstrapping = false

        authStateTask = Task {
            for await (_, session) in supabase.auth.authStateChanges {
                self.session = session
                self.isBootstrapping = false
            }
        }
    }

    deinit {
        authStateTask?.cancel()
    }

    /// Handles Sign out for AppView.swift.
    func signOut() async {
        do {
            try await supabase.auth.signOut()
            Haptic.selection()
        } catch {
            Haptic.error()
        }
    }
}

struct CoachRunTracePresentation {
    let runId: String
    let isStreaming: Bool
    let headline: String
    let detail: String?
    let startedAt: Date?
    let commentaryText: String
    let streamingText: String
    let errorMessage: String?
}

private struct CoachRunTraceState {
    let runId: String
    var isStreaming = true
    var startedAt: Date?
    var currentIteration: Int?
    var commentaryText = ""
    var transientText = ""
    var finalText = ""
    var errorMessage: String?

    var hasVisibleContent: Bool {
        isStreaming
            || !commentaryText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !transientText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !finalText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || errorMessage != nil
    }
}

struct CoachRenderedFeedItem: Identifiable {
    let id: String
    let kind: String
    let role: String
    let text: String
    let card: CoachCardPayload?
    let trace: CoachRunTracePresentation?
    let runId: String?
    let badgeLabel: String
    let isAssistant: Bool
    let isProvisional: Bool
}

private extension CoachRenderedFeedItem {
    func mergingLiveTurnState(from liveItem: CoachRenderedFeedItem) -> CoachRenderedFeedItem {
        CoachRenderedFeedItem(
            id: id,
            kind: kind,
            role: role,
            text: text.isEmpty ? liveItem.text : text,
            card: card,
            trace: liveItem.trace,
            runId: runId,
            badgeLabel: badgeLabel,
            isAssistant: isAssistant,
            isProvisional: isProvisional
        )
    }
}

private struct PendingUserFeedMessage: Identifiable {
    let id: String
    let text: String
    let createdAt: Date
    var serverEventID: String?
    var runID: String?
}

private struct CoachFeedDisplayNode {
    let item: CoachRenderedFeedItem
    let seqNum: Int?
    let occurredAt: Date?
    let localOrder: Int
}

private struct CoachFeedBottomPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

enum WorkoutDirectAction: String {
    case startWorkout = "start_workout"
    case completeCurrentSet = "complete_current_set"
    case skipCurrentExercise = "skip_current_exercise"
    case pauseWorkout = "pause_workout"
    case resumeWorkout = "resume_workout"
    case finishWorkout = "finish_workout"
}

extension WorkoutDirectAction {
    var commandType: String {
        switch self {
        case .startWorkout:
            return "session.start"
        case .completeCurrentSet:
            return "set.complete"
        case .skipCurrentExercise:
            return "exercise.skip"
        case .pauseWorkout:
            return "session.pause"
        case .resumeWorkout:
            return "session.resume"
        case .finishWorkout:
            return "session.finish"
        }
    }

    init?(commandType: String) {
        switch commandType {
        case "session.start":
            self = .startWorkout
        case "set.complete":
            self = .completeCurrentSet
        case "exercise.skip":
            self = .skipCurrentExercise
        case "session.pause":
            self = .pauseWorkout
        case "session.resume":
            self = .resumeWorkout
        case "session.finish":
            self = .finishWorkout
        default:
            return nil
        }
    }
}

private struct WorkoutPendingCommand: Codable, Identifiable {
    let request: WorkoutCommandRequest
    let queuedAt: String

    var id: String {
        request.commandId
    }
}

private struct WorkoutOutboxSnapshot: Codable {
    let deviceID: String
    let nextClientSequence: Int
    let lastKnownServerWorkout: WorkoutSessionState?
    let pendingCommands: [WorkoutPendingCommand]
}

struct WorkoutAgentBanner: Identifiable {
    let id: String
    let text: String
}

@MainActor
final class CoachSurfaceViewModel: ObservableObject {
    private enum AppOpenTriggerPolicy {
        static let minimumInactiveInterval: TimeInterval = 60 * 60
        static let lastInactiveDefaultsKeyPrefix = "coach_surface.last_inactive_at"
    }

    @Published var surface: CoachSurfaceResponse?
    @Published var composerText = ""
    @Published var isLoading = false
    @Published var isSending = false
    @Published var isResettingSession = false
    @Published var isQuickActionsExpanded = false
    @Published var errorMessage: String?
    @Published var toast: ToastData?
    @Published private(set) var serverWorkout: WorkoutSessionState?
    @Published private(set) var optimisticWorkout: WorkoutSessionState?
    @Published private(set) var isWorkoutActionInFlight = false
    @Published private(set) var isWorkoutSyncing = false
    @Published private(set) var workoutAgentBanner: WorkoutAgentBanner?
    @Published private var runTraces: [String: CoachRunTraceState] = [:]

    private var activeUserID: UUID?
    private var pollTask: Task<Void, Never>?
    private var streamTask: Task<Void, Never>?
    private var backgroundStreamTask: Task<Void, Never>?
    private var observedRunID: String?
    private var observedStreamPath: String?
    private var observedBackgroundRunID: String?
    private var observedBackgroundStreamPath: String?
    private var lastStreamEventID: String?
    private var runTraceOrder: [String] = []
    private var pendingUserMessages: [PendingUserFeedMessage] = []
    private var confirmedUserMessageIDAliases: [String: String] = [:]
    private var pendingWorkoutCommands: [WorkoutPendingCommand] = []
    private var nextWorkoutClientSequence = 0
    private var isDrainingWorkoutCommandOutbox = false
    private let workoutDeviceID = CoachSurfaceViewModel.loadOrCreateWorkoutDeviceID()
    private static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let iso8601WithoutFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private var unresolvedPendingUserMessages: [PendingUserFeedMessage] {
        let confirmedFeedItemIDs = Set((surface?.feed ?? []).map(\.id))

        return pendingUserMessages.filter { pendingMessage in
            guard let serverEventID = pendingMessage.serverEventID else {
                return true
            }

            return !confirmedFeedItemIDs.contains(serverEventID)
        }
    }

    var feedItems: [CoachRenderedFeedItem] {
        let feed = surface?.feed ?? []
        var nodes = feed.enumerated().map { index, item in
            CoachFeedDisplayNode(
                item: makeRenderedFeedItem(from: item),
                seqNum: item.seqNum,
                occurredAt: parseFeedDate(item.occurredAt),
                localOrder: index
            )
        }

        let pendingStartOrder = nodes.count
        nodes.append(
            contentsOf: unresolvedPendingUserMessages.enumerated().map { index, item in
                CoachFeedDisplayNode(
                    item: makeRenderedPendingUserItem(from: item),
                    seqNum: nil,
                    occurredAt: item.createdAt,
                    localOrder: pendingStartOrder + index
                )
            }
        )

        var items = nodes
            .sorted(by: feedDisplayNodeShouldSortBefore)
            .map(\.item)

        insertPendingAssistantActivityIfNeeded(in: &items)

        for runID in runTraceOrder {
            let assistantRunItemIndex = items.firstIndex {
                $0.runId == runID && $0.kind != "run_trace" && $0.role == "assistant"
            }
            let lastRunItemIndex = items.lastIndex {
                $0.runId == runID && $0.kind != "run_trace"
            }
            let insertIndex = assistantRunItemIndex
                ?? lastRunItemIndex.map { $0 + 1 }
                ?? items.count

            guard let assistantTurnItem = makeAssistantTurnItem(runID: runID) else {
                continue
            }

            if let assistantRunItemIndex {
                items[assistantRunItemIndex] = items[assistantRunItemIndex].mergingLiveTurnState(from: assistantTurnItem)
            } else {
                items.insert(assistantTurnItem, at: min(insertIndex, items.count))
            }
        }

        return items
    }

    var quickActions: [CoachQuickAction] {
        surface?.quickActions ?? []
    }

    var pinnedFeedCard: CoachCardPayload? {
        guard let pinnedFeedItemID = surface?.pinnedCard?.feedItemId else {
            return nil
        }

        return surface?.feed.first(where: { $0.id == pinnedFeedItemID })?.card
    }

    var visibleFeedItems: [CoachRenderedFeedItem] {
        guard let pinnedFeedItemID = surface?.pinnedCard?.feedItemId else {
            return feedItems
        }

        return feedItems.filter { $0.id != pinnedFeedItemID }
    }

    var activeRun: CoachRunSummary? {
        surface?.activeRun
    }

    var effectiveWorkout: WorkoutSessionState? {
        optimisticWorkout ?? serverWorkout ?? surface?.workout
    }

    var pinnedWorkout: WorkoutSessionState? {
        guard let workout = effectiveWorkout else {
            return nil
        }

        return ["queued", "in_progress", "paused"].contains(workout.status) ? workout : nil
    }

    var composerPlaceholder: String {
        let placeholder = surface?.composer.placeholder.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if placeholder.isEmpty || placeholder.localizedCaseInsensitiveContains("coach") {
            return "Ask AI PT"
        }

        return placeholder
    }

    var scrollToken: String {
        let feedToken = visibleFeedItems.map(\.id).joined(separator: "|")
        let pendingToken = unresolvedPendingUserMessages.map { pendingMessage in
            [
                pendingMessage.id,
                pendingMessage.text
            ].joined(separator: "|")
        }.joined(separator: "::")
        let runToken = [activeRun?.runId ?? "", activeRun?.status ?? ""].joined(separator: "|")
        let traceToken = runTraceOrder.compactMap { runID -> String? in
            guard let trace = runTraces[runID] else { return nil }

            return [
                runID,
                trace.isStreaming ? "1" : "0",
                trace.startedAt?.ISO8601Format() ?? "",
                trace.commentaryText,
                trace.transientText,
                trace.finalText,
                trace.errorMessage ?? ""
            ].joined(separator: "|")
        }.joined(separator: "::")
        let workoutToken = effectiveWorkout.map { workout in
            [
                workout.workoutSessionId,
                String(workout.stateVersion),
                workout.status,
                workout.currentPhase,
                workout.currentExerciseId ?? "",
                String(workout.currentExerciseIndex ?? -1),
                String(workout.currentSetIndex ?? -1)
            ].joined(separator: "|")
        } ?? ""

        return [feedToken, pendingToken, runToken, traceToken, workoutToken].joined(separator: "::")
    }

    /// Resets the relevant value back to its baseline state.
    func reset() {
        activeUserID = nil
        surface = nil
        serverWorkout = nil
        optimisticWorkout = nil
        pendingUserMessages = []
        pendingWorkoutCommands = []
        nextWorkoutClientSequence = 0
        isWorkoutActionInFlight = false
        isWorkoutSyncing = false
        isDrainingWorkoutCommandOutbox = false
        workoutAgentBanner = nil
        composerText = ""
        isLoading = false
        isSending = false
        isResettingSession = false
        isQuickActionsExpanded = false
        errorMessage = nil
        toast = nil
        runTraces = [:]
        runTraceOrder = []
        confirmedUserMessageIDAliases = [:]
        pollTask?.cancel()
        pollTask = nil
        cancelBackgroundRunObservation()
        cancelRunObservation(resetStreamState: true)
    }

    /// Handles Stable feed item ID for AppView.swift.
    private func stableFeedItemID(for item: CoachFeedItem) -> String {
        if item.kind == "message",
           item.role == "user",
           let optimisticID = confirmedUserMessageIDAliases[item.id] {
            return optimisticID
        }

        guard item.kind == "message", item.role == "assistant", let itemTurnID = item.turnId ?? item.runId else {
            return item.id
        }

        return "assistant:\(itemTurnID)"
    }

    /// Builds a rendered feed item while keeping IDs stable for live-to-final assistant transitions.
    private func makeRenderedFeedItem(from item: CoachFeedItem) -> CoachRenderedFeedItem {
        let liveTrace = item.role == "assistant"
            ? item.runId.flatMap { tracePresentation(for: $0) }
            : nil

        return CoachRenderedFeedItem(
            id: stableFeedItemID(for: item),
            kind: item.kind,
            role: item.role,
            text: item.text,
            card: item.card,
            trace: liveTrace,
            runId: item.runId,
            badgeLabel: item.role == "assistant" ? "Coach" : "You",
            isAssistant: item.role == "assistant",
            isProvisional: false
        )
    }

    /// Builds a rendered optimistic user message.
    private func makeRenderedPendingUserItem(from item: PendingUserFeedMessage) -> CoachRenderedFeedItem {
        CoachRenderedFeedItem(
            id: item.id,
            kind: "message",
            role: "user",
            text: item.text,
            card: nil,
            trace: nil,
            runId: item.runID,
            badgeLabel: "You",
            isAssistant: false,
            isProvisional: true
        )
    }

    /// Parses ISO dates returned by the API, accepting both fractional and whole-second forms.
    private func parseFeedDate(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }

        if let date = Self.iso8601WithFractionalSeconds.date(from: value) {
            return date
        }

        return Self.iso8601WithoutFractionalSeconds.date(from: value)
    }

    /// Provides deterministic ordering when optimistic and server-backed items are merged together.
    private func feedDisplayNodeShouldSortBefore(
        _ left: CoachFeedDisplayNode,
        _ right: CoachFeedDisplayNode
    ) -> Bool {
        if let leftSeqNum = left.seqNum,
           let rightSeqNum = right.seqNum,
           leftSeqNum != rightSeqNum {
            return leftSeqNum < rightSeqNum
        }

        if let leftDate = left.occurredAt,
           let rightDate = right.occurredAt,
           abs(leftDate.timeIntervalSince(rightDate)) > 0.001 {
            return leftDate < rightDate
        }

        switch (left.seqNum, right.seqNum) {
        case (.some, .none):
            return true
        case (.none, .some):
            return false
        default:
            return left.localOrder < right.localOrder
        }
    }

    /// Loads Or create workout device ID for the surrounding workflow.
    private static func loadOrCreateWorkoutDeviceID() -> String {
        let defaultsKey = "coach_surface.workout_device_id"
        let defaults = UserDefaults.standard

        if let existing = defaults.string(forKey: defaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !existing.isEmpty {
            return existing
        }

        let generated = UUID().uuidString.lowercased()
        defaults.set(generated, forKey: defaultsKey)
        return generated
    }

    /// Handles Workout outbox URL for AppView.swift.
    private static func workoutOutboxURL(for userID: UUID) -> URL? {
        let fileManager = FileManager.default

        guard let applicationSupportURL = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            return nil
        }

        let directoryURL = applicationSupportURL.appendingPathComponent(
            "CoachSurface",
            isDirectory: true
        )

        do {
            try fileManager.createDirectory(
                at: directoryURL,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            return nil
        }

        return directoryURL.appendingPathComponent(
            "workout-outbox-\(userID.uuidString.lowercased()).json",
            isDirectory: false
        )
    }

    /// Loads Workout outbox for the surrounding workflow.
    private func loadWorkoutOutbox(for userID: UUID) {
        guard let fileURL = Self.workoutOutboxURL(for: userID),
              let data = try? Data(contentsOf: fileURL),
              let snapshot = try? JSONDecoder().decode(WorkoutOutboxSnapshot.self, from: data),
              snapshot.deviceID == workoutDeviceID else {
            pendingWorkoutCommands = []
            nextWorkoutClientSequence = 0
            workoutAgentBanner = nil
            return
        }

        pendingWorkoutCommands = snapshot.pendingCommands
        nextWorkoutClientSequence = max(0, snapshot.nextClientSequence)

        if serverWorkout == nil {
            serverWorkout = snapshot.lastKnownServerWorkout
        }

        workoutAgentBanner = nil
        recomputeOptimisticWorkout()
    }

    /// Handles Save workout outbox for AppView.swift.
    private func saveWorkoutOutbox() {
        guard let activeUserID,
              let fileURL = Self.workoutOutboxURL(for: activeUserID) else { return }

        let snapshot = WorkoutOutboxSnapshot(
            deviceID: workoutDeviceID,
            nextClientSequence: nextWorkoutClientSequence,
            lastKnownServerWorkout: serverWorkout,
            pendingCommands: pendingWorkoutCommands
        )

        guard let data = try? JSONEncoder().encode(snapshot) else {
            return
        }

        try? data.write(to: fileURL, options: [.atomic])
    }

    /// Ensures Run trace is ready before work continues.
    private func ensureRunTrace(for runID: String) {
        if runTraces[runID] == nil {
            runTraces[runID] = CoachRunTraceState(runId: runID)
        }

        if !runTraceOrder.contains(runID) {
            runTraceOrder.append(runID)
        }
    }

    /// Updates Run trace with the latest state.
    private func updateRunTrace(_ runID: String, mutate: (inout CoachRunTraceState) -> Void) {
        ensureRunTrace(for: runID)

        guard var trace = runTraces[runID] else { return }
        mutate(&trace)
        runTraces[runID] = trace
    }

    /// Handles Clear run traces for AppView.swift.
    private func clearRunTraces() {
        runTraces = [:]
        runTraceOrder = []
    }

    /// Handles Did session boundary change for AppView.swift.
    private func didSessionBoundaryChange(comparedTo latestSurface: CoachSurfaceResponse) -> Bool {
        guard let currentSurface = surface else {
            return false
        }

        return currentSurface.sessionKey != latestSurface.sessionKey
            || currentSurface.sessionId != latestSurface.sessionId
    }

    /// Inserts a temporary assistant activity row while the message is still being accepted.
    private func insertPendingAssistantActivityIfNeeded(in items: inout [CoachRenderedFeedItem]) {
        guard isSending,
              let pendingMessageIndex = items.lastIndex(where: { item in
                  item.id.hasPrefix("pending:") && item.runId == nil
              }) else {
            return
        }

        let pendingTrace = CoachRunTracePresentation(
            runId: "pending-send",
            isStreaming: true,
            headline: "Status",
            detail: nil,
            startedAt: nil,
            commentaryText: "",
            streamingText: "",
            errorMessage: nil
        )
        let pendingTraceItem = CoachRenderedFeedItem(
            id: "assistant:pending-send",
            kind: "message",
            role: "assistant",
            text: "",
            card: nil,
            trace: pendingTrace,
            runId: "pending-send",
            badgeLabel: "Coach",
            isAssistant: true,
            isProvisional: true
        )

        items.insert(pendingTraceItem, at: min(pendingMessageIndex + 1, items.count))
    }

    /// Builds a live assistant turn row that remains stable from orb to streaming text to final text.
    private func makeAssistantTurnItem(runID: String) -> CoachRenderedFeedItem? {
        guard let presentation = tracePresentation(for: runID) else { return nil }
        let trace = runTraces[runID]
        let transientText = trace?.transientText.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let text = presentation.isStreaming ? "" : transientText

        return CoachRenderedFeedItem(
            id: "assistant:\(runID)",
            kind: "message",
            role: "assistant",
            text: text,
            card: nil,
            trace: presentation,
            runId: runID,
            badgeLabel: "Coach",
            isAssistant: true,
            isProvisional: true
        )
    }

    /// Handles Trace presentation for AppView.swift.
    private func tracePresentation(for runID: String) -> CoachRunTracePresentation? {
        guard let trace = runTraces[runID], trace.hasVisibleContent else {
            return nil
        }

        let liveStreamingText = trace.transientText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? trace.finalText
            : trace.transientText

        if trace.isStreaming {
            return CoachRunTracePresentation(
                runId: runID,
                isStreaming: true,
                headline: "Status",
                detail: nil,
                startedAt: trace.startedAt,
                commentaryText: trace.commentaryText,
                streamingText: liveStreamingText,
                errorMessage: trace.errorMessage
            )
        }

        return CoachRunTracePresentation(
            runId: runID,
            isStreaming: false,
            headline: "Status",
            detail: nil,
            startedAt: trace.startedAt,
            commentaryText: trace.commentaryText,
            streamingText: trace.finalText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? trace.transientText
                : trace.finalText,
            errorMessage: trace.errorMessage
        )
    }

    /// Handles Activate for AppView.swift.
    func activate(session: Session) async {
        if activeUserID != session.user.id {
            activeUserID = session.user.id
            surface = nil
            serverWorkout = nil
            optimisticWorkout = nil
            pendingUserMessages = []
            confirmedUserMessageIDAliases = [:]
            pendingWorkoutCommands = []
            nextWorkoutClientSequence = 0
            isWorkoutActionInFlight = false
            isWorkoutSyncing = false
            isDrainingWorkoutCommandOutbox = false
            workoutAgentBanner = nil
            composerText = ""
            errorMessage = nil
            isResettingSession = false
            runTraces = [:]
            runTraceOrder = []
            pollTask?.cancel()
            pollTask = nil
            cancelBackgroundRunObservation()
            cancelRunObservation(resetStreamState: true)
            loadWorkoutOutbox(for: session.user.id)
        }

        await refreshSurface(allowAppOpenTrigger: true)
        await drainWorkoutCommandOutbox()
    }

    /// Handles Manual refresh for AppView.swift.
    func manualRefresh() async {
        await refreshSurface(allowAppOpenTrigger: false)
    }

    /// Resets Session back to its baseline state.
    func resetSession() async {
        guard !isResettingSession else { return }

        do {
            isResettingSession = true
            isQuickActionsExpanded = false

            let accessToken = try await freshAccessToken()
            let resetResult = try await APIService.shared.resetSession(
                accessToken: accessToken,
                requestBody: SessionResetRequest(sessionKey: surface?.sessionKey),
                idempotencyKey: UUID().uuidString.lowercased()
            )

            withAnimation(AppTheme.Animation.slow) {
                cancelRunObservation(resetStreamState: true)
                cancelBackgroundRunObservation()
                clearRunTraces()
                surface = nil
                composerText = ""
                errorMessage = nil
                serverWorkout = nil
                optimisticWorkout = nil
                pendingUserMessages = []
                confirmedUserMessageIDAliases = [:]
                pendingWorkoutCommands = []
                nextWorkoutClientSequence = 0
                isWorkoutActionInFlight = false
                isWorkoutSyncing = false
                isDrainingWorkoutCommandOutbox = false
                workoutAgentBanner = nil
            }
            toast = ToastData(message: "Started a fresh chat.", icon: "square.and.pencil")
            Haptic.medium()
            saveWorkoutOutbox()

            await refreshSurface(
                allowAppOpenTrigger: false,
                sessionKeyOverride: resetResult.sessionKey
            )
        } catch {
            showError(error.localizedDescription)
        }

        isResettingSession = false
    }

    /// Handles Submit composer for AppView.swift.
    func submitComposer() async {
        let trimmed = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        withAnimation(.spring(response: 0.26, dampingFraction: 0.86)) {
            composerText = ""
        }

        let didSend = await submitMessage(
            message: trimmed,
            triggerType: .userMessage,
            metadata: MessageMetadata(source: "ios_coach_surface")
        )

        if !didSend && composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            composerText = trimmed
        }
    }

    /// Handles Run quick action for AppView.swift.
    func runQuickAction(_ action: CoachQuickAction) async {
        isQuickActionsExpanded = false
        _ = await submitMessage(
            message: action.message,
            triggerType: action.triggerType,
            metadata: MessageMetadata(source: "ios_quick_action", actionId: action.id)
        )
    }

    /// Handles Direct workout action for AppView.swift.
    private func directWorkoutAction(for action: CoachCardAction) -> WorkoutDirectAction? {
        switch action.actionType {
        case WorkoutDirectAction.startWorkout.rawValue:
            return .startWorkout
        case WorkoutDirectAction.completeCurrentSet.rawValue:
            return .completeCurrentSet
        case WorkoutDirectAction.skipCurrentExercise.rawValue:
            return .skipCurrentExercise
        case WorkoutDirectAction.pauseWorkout.rawValue:
            return .pauseWorkout
        case WorkoutDirectAction.resumeWorkout.rawValue:
            return .resumeWorkout
        case WorkoutDirectAction.finishWorkout.rawValue:
            return .finishWorkout
        default:
            break
        }

        switch action.id {
        case "start_workout":
            return .startWorkout
        case "complete_set":
            return .completeCurrentSet
        case "skip_exercise":
            return .skipCurrentExercise
        case "pause_workout":
            return .pauseWorkout
        case "resume_workout":
            return .resumeWorkout
        case "finish_workout":
            return .finishWorkout
        default:
            return nil
        }
    }

    /// Handles Run card action for AppView.swift.
    func runCardAction(_ action: CoachCardAction) async {
        if let directAction = directWorkoutAction(for: action) {
            await runWorkoutAction(directAction)
            return
        }

        guard action.actionType == "submit_message", let message = action.message else {
            toast = ToastData(message: "That card action is not wired up yet.", icon: "hand.raised.fill")
            return
        }

        _ = await submitMessage(
            message: message,
            triggerType: CoachTriggerType(apiValue: action.triggerType),
            metadata: MessageMetadata(source: "ios_card_action", actionId: action.id)
        )
    }

    /// Handles Run workout action for AppView.swift.
    func runWorkoutAction(
        _ action: WorkoutDirectAction,
        workoutExerciseId: String? = nil,
        setIndex: Int? = nil
    ) async {
        guard let workout = effectiveWorkout else {
            toast = ToastData(message: "There is no live workout to update right now.", icon: "hand.raised.fill")
            return
        }
        guard applyOptimisticWorkoutAction(
            action,
            to: workout,
            workoutExerciseId: workoutExerciseId,
            setIndex: setIndex
        ) != nil else {
            toast = ToastData(message: "That workout action is not available right now.", icon: "hand.raised.fill")
            return
        }

        do {
            let request = try buildWorkoutCommandRequest(
                for: action,
                workout: workout,
                workoutExerciseId: workoutExerciseId,
                setIndex: setIndex
            )
            pendingWorkoutCommands.append(
                WorkoutPendingCommand(
                    request: request,
                    queuedAt: Date().ISO8601Format()
                )
            )
            workoutAgentBanner = nil
            errorMessage = nil
            Haptic.selection()
            recomputeOptimisticWorkout()
            saveWorkoutOutbox()

            await drainWorkoutCommandOutbox()
        } catch {
            showError(error.localizedDescription)
        }
    }

    /// Builds a Workout command request used by this file.
    private func buildWorkoutCommandRequest(
        for action: WorkoutDirectAction,
        workout: WorkoutSessionState,
        workoutExerciseId: String? = nil,
        setIndex: Int? = nil
    ) throws -> WorkoutCommandRequest {
        let clientSequence = nextWorkoutClientSequence
        let buildOrigin = WorkoutCommandOrigin(
            actor: "user_ui",
            deviceId: workoutDeviceID,
            runId: nil,
            occurredAt: Date().ISO8601Format()
        )

        let request: WorkoutCommandRequest

        switch action {
        case .startWorkout:
            request = WorkoutCommandRequest(
                commandId: UUID().uuidString.lowercased(),
                sessionKey: surface?.sessionKey,
                workoutSessionId: workout.workoutSessionId,
                commandType: action.commandType,
                origin: buildOrigin,
                baseStateVersion: workout.stateVersion,
                clientSequence: clientSequence,
                payload: WorkoutCommandPayload(),
                llm: nil
            )
        case .completeCurrentSet:
            guard let currentExercise = resolveWorkoutExercise(
                in: workout,
                workoutExerciseId: workoutExerciseId
            ),
                  let currentSet = resolveWorkoutSet(
                    in: workout,
                    exercise: currentExercise,
                    setIndex: setIndex
                  ) else {
                throw APIError.serverError(message: "No live workout set is available.", statusCode: nil)
            }

            request = WorkoutCommandRequest(
                commandId: UUID().uuidString.lowercased(),
                sessionKey: surface?.sessionKey,
                workoutSessionId: workout.workoutSessionId,
                commandType: action.commandType,
                origin: buildOrigin,
                baseStateVersion: workout.stateVersion,
                clientSequence: clientSequence,
                payload: WorkoutCommandPayload(
                    workoutExerciseId: currentExercise.workoutExerciseId,
                    setIndex: currentSet.setIndex,
                    workoutSetId: currentSet.workoutSetId
                ),
                llm: nil
            )
        case .skipCurrentExercise:
            guard let currentExercise = resolveWorkoutExercise(
                in: workout,
                workoutExerciseId: workoutExerciseId
            ) else {
                throw APIError.serverError(message: "No live workout exercise is available.", statusCode: nil)
            }

            request = WorkoutCommandRequest(
                commandId: UUID().uuidString.lowercased(),
                sessionKey: surface?.sessionKey,
                workoutSessionId: workout.workoutSessionId,
                commandType: action.commandType,
                origin: buildOrigin,
                baseStateVersion: workout.stateVersion,
                clientSequence: clientSequence,
                payload: WorkoutCommandPayload(
                    workoutExerciseId: currentExercise.workoutExerciseId
                ),
                llm: nil
            )
        case .pauseWorkout, .resumeWorkout:
            request = WorkoutCommandRequest(
                commandId: UUID().uuidString.lowercased(),
                sessionKey: surface?.sessionKey,
                workoutSessionId: workout.workoutSessionId,
                commandType: action.commandType,
                origin: buildOrigin,
                baseStateVersion: workout.stateVersion,
                clientSequence: clientSequence,
                payload: WorkoutCommandPayload(),
                llm: nil
            )
        case .finishWorkout:
            request = WorkoutCommandRequest(
                commandId: UUID().uuidString.lowercased(),
                sessionKey: surface?.sessionKey,
                workoutSessionId: workout.workoutSessionId,
                commandType: action.commandType,
                origin: buildOrigin,
                baseStateVersion: workout.stateVersion,
                clientSequence: clientSequence,
                payload: WorkoutCommandPayload(
                    finalStatus: "completed"
                ),
                llm: nil
            )
        }

        nextWorkoutClientSequence += 1
        return request
    }

    /// Handles Drain workout command outbox for AppView.swift.
    private func drainWorkoutCommandOutbox() async {
        guard !isDrainingWorkoutCommandOutbox else { return }
        guard !pendingWorkoutCommands.isEmpty else {
            recomputeOptimisticWorkout()
            return
        }

        isDrainingWorkoutCommandOutbox = true
        recomputeOptimisticWorkout()
        var shouldRefreshSurface = false

        defer {
            isDrainingWorkoutCommandOutbox = false
            recomputeOptimisticWorkout()
            saveWorkoutOutbox()
        }

        while let pendingCommand = pendingWorkoutCommands.first {
            do {
                let accessToken = try await freshAccessToken()
                let response = try await APIService.shared.sendWorkoutCommand(
                    accessToken: accessToken,
                    requestBody: pendingCommand.request,
                    idempotencyKey: pendingCommand.request.commandId
                )

                pendingWorkoutCommands.removeFirst()
                mergeIncomingWorkout(response.workout)
                handleWorkoutCommandResponse(response)
                shouldRefreshSurface = true

                if response.command.status == "rejected" {
                    pendingWorkoutCommands.removeAll()
                    break
                }
            } catch {
                isWorkoutSyncing = true
                toast = ToastData(
                    message: "Workout changes are saved locally and will sync when the connection recovers.",
                    icon: "icloud.and.arrow.up.fill"
                )
                break
            }
        }

        if shouldRefreshSurface {
            await refreshSurface(allowAppOpenTrigger: false)
        }
    }

    /// Handles Workout command response for this module.
    private func handleWorkoutCommandResponse(_ response: WorkoutCommandResponse) {
        if response.command.status == "rejected" {
            workoutAgentBanner = nil
            if let conflict = response.command.conflict {
                showError(conflict.message)
            } else {
                showError("That workout update could not be applied.")
            }
        }

        if response.agentFollowUp.status == "queued",
           let runID = response.agentFollowUp.runId {
            let streamPath = response.agentFollowUp.streamUrl ?? "/v1/runs/\(runID)/stream"

            if response.agentFollowUp.deliveryMode == "foreground" {
                startRunObservation(
                    runID: runID,
                    streamPath: streamPath
                )
            } else {
                startBackgroundRunObservation(
                    runID: runID,
                    streamPath: streamPath
                )
            }
        }
    }

    /// Handles Recompute optimistic workout for AppView.swift.
    private func recomputeOptimisticWorkout() {
        guard let baseWorkout = serverWorkout ?? surface?.workout else {
            optimisticWorkout = nil
            isWorkoutSyncing = !pendingWorkoutCommands.isEmpty
            isWorkoutActionInFlight = isDrainingWorkoutCommandOutbox
            return
        }

        var projectedWorkout = baseWorkout

        for pendingCommand in pendingWorkoutCommands {
            guard let action = WorkoutDirectAction(commandType: pendingCommand.request.commandType),
                  let updatedWorkout = applyOptimisticWorkoutAction(
                    action,
                    to: projectedWorkout,
                    workoutExerciseId: pendingCommand.request.payload.workoutExerciseId,
                    setIndex: pendingCommand.request.payload.setIndex
                  ) else {
                break
            }

            projectedWorkout = updatedWorkout
        }

        optimisticWorkout = pendingWorkoutCommands.isEmpty ? nil : projectedWorkout
        errorMessage = nil
        isWorkoutSyncing = !pendingWorkoutCommands.isEmpty
        isWorkoutActionInFlight = isDrainingWorkoutCommandOutbox
    }

    /// Handles Merge transcript for AppView.swift.
    func mergeTranscript(_ transcript: String) {
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if composerText.isEmpty {
            composerText = trimmed
        } else {
            composerText = "\(composerText) \(trimmed)"
        }
    }

    /// Handles Toggle quick actions for AppView.swift.
    func toggleQuickActions() {
        withAnimation(AppTheme.Animation.gentle) {
            isQuickActionsExpanded.toggle()
        }
    }

    /// Shows Error in the current UI state.
    func showError(_ message: String) {
        errorMessage = message
        toast = ToastData(message: message, icon: "exclamationmark.circle.fill")
        Haptic.error()
    }

    /// Handles Should render pending user message for AppView.swift.
    private func shouldRenderPendingUserMessage(metadata: MessageMetadata?) -> Bool {
        metadata?.hiddenInFeed != true
    }

    /// Enqueues Pending user message for asynchronous work.
    private func enqueuePendingUserMessage(text: String) -> String {
        let pendingMessageID = "pending:\(UUID().uuidString.lowercased())"
        let pendingMessage = PendingUserFeedMessage(
            id: pendingMessageID,
            text: text,
            createdAt: Date(),
            serverEventID: nil,
            runID: nil
        )

        pendingUserMessages.append(pendingMessage)
        return pendingMessageID
    }

    /// Marks Pending user message accepted with the appropriate status.
    private func markPendingUserMessageAccepted(
        pendingMessageID: String,
        serverEventID: String,
        runID: String
    ) {
        confirmedUserMessageIDAliases[serverEventID] = pendingMessageID

        guard let pendingMessageIndex = pendingUserMessages.firstIndex(where: { $0.id == pendingMessageID }) else {
            return
        }

        pendingUserMessages[pendingMessageIndex].serverEventID = serverEventID
        pendingUserMessages[pendingMessageIndex].runID = runID
    }

    /// Handles Remove pending user message for AppView.swift.
    private func removePendingUserMessage(_ pendingMessageID: String) {
        pendingUserMessages.removeAll { $0.id == pendingMessageID }
    }

    /// Reconciles Pending user messages with the system state.
    private func reconcilePendingUserMessages(with feed: [CoachFeedItem]) {
        let confirmedFeedItemIDs = Set(feed.map(\.id))
        pendingUserMessages.removeAll { pendingMessage in
            guard let serverEventID = pendingMessage.serverEventID else {
                return false
            }

            return confirmedFeedItemIDs.contains(serverEventID)
        }
    }

    /// Handles Merge incoming workout for AppView.swift.
    private func mergeIncomingWorkout(_ workout: WorkoutSessionState?) {
        if let workout {
            if (serverWorkout?.stateVersion ?? 0) <= workout.stateVersion {
                serverWorkout = workout
            }
        } else if pendingWorkoutCommands.isEmpty {
            serverWorkout = nil
        }

        recomputeOptimisticWorkout()
        saveWorkoutOutbox()
    }

    /// Refreshes Surface so it stays current.
    private func refreshSurface(
        allowAppOpenTrigger: Bool,
        sessionKeyOverride: String? = nil
    ) async {
        do {
            if surface == nil {
                isLoading = true
            }

            let shouldConsiderAppOpenTrigger = allowAppOpenTrigger && shouldConsiderAppOpenTrigger()
            let accessToken = try await freshAccessToken()
            let latestSurface = try await APIService.shared.fetchCoachSurface(
                accessToken: accessToken,
                sessionKey: sessionKeyOverride ?? surface?.sessionKey
            )

            let didRotateSessionBoundary = didSessionBoundaryChange(comparedTo: latestSurface)
            if didRotateSessionBoundary {
                clearRunTraces()
                cancelBackgroundRunObservation()
                cancelRunObservation(resetStreamState: true)
            }

            reconcilePendingUserMessages(with: latestSurface.feed)
            surface = latestSurface
            mergeIncomingWorkout(latestSurface.workout)

            if let activeRun = latestSurface.activeRun {
                startRunObservation(
                    runID: activeRun.runId,
                    streamPath: "/v1/runs/\(activeRun.runId)/stream"
                )
            } else if streamTask == nil {
                cancelRunObservation(resetStreamState: true)
            }

            errorMessage = nil
            isLoading = false

            if !pendingWorkoutCommands.isEmpty {
                await drainWorkoutCommandOutbox()
            }

            if shouldTriggerAppOpenTrigger(for: latestSurface, shouldConsiderTrigger: shouldConsiderAppOpenTrigger) {
                _ = await submitMessage(
                    message: "app_opened",
                    triggerType: .appOpened,
                    metadata: MessageMetadata(
                        hiddenInFeed: true,
                        source: "ios_app_open",
                        runVisibility: "background"
                    )
                )
            }
        } catch {
            isLoading = false
            showError(error.localizedDescription)
        }
    }

    /// Records App did become inactive for later use.
    func recordAppDidBecomeInactive() {
        guard let activeUserID else { return }
        UserDefaults.standard.set(
            Date().timeIntervalSince1970,
            forKey: appOpenLastInactiveDefaultsKey(for: activeUserID)
        )
    }

    /// Handles Should consider app open trigger for AppView.swift.
    private func shouldConsiderAppOpenTrigger() -> Bool {
        guard let activeUserID else { return false }
        let defaultsKey = appOpenLastInactiveDefaultsKey(for: activeUserID)
        guard let lastInactiveTimestamp = UserDefaults.standard.object(forKey: defaultsKey) as? Double else {
            return false
        }

        let elapsed = Date().timeIntervalSince1970 - lastInactiveTimestamp
        return elapsed >= AppOpenTriggerPolicy.minimumInactiveInterval
    }

    /// Handles Should trigger app open trigger for AppView.swift.
    private func shouldTriggerAppOpenTrigger(
        for surface: CoachSurfaceResponse,
        shouldConsiderTrigger: Bool
    ) -> Bool {
        guard shouldConsiderTrigger else { return false }
        return surface.activeRun == nil
    }

    /// Handles App open last inactive defaults key for AppView.swift.
    private func appOpenLastInactiveDefaultsKey(for userID: UUID) -> String {
        "\(AppOpenTriggerPolicy.lastInactiveDefaultsKeyPrefix).\(userID.uuidString.lowercased())"
    }

    /// Handles Submit message for AppView.swift.
    private func submitMessage(
        message: String,
        triggerType: CoachTriggerType,
        metadata: MessageMetadata?
    ) async -> Bool {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let shouldRenderPendingMessage = shouldRenderPendingUserMessage(metadata: metadata)
        let shouldObserveForegroundRun = shouldRenderPendingMessage

        if shouldRenderPendingMessage {
            cancelRunObservation(resetStreamState: true)
            withAnimation(AppTheme.Animation.gentle) {
                clearRunTraces()
            }
        }

        let pendingMessageID = shouldRenderPendingMessage
            ? enqueuePendingUserMessage(text: trimmed)
            : nil

        do {
            if shouldRenderPendingMessage {
                withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                    isSending = true
                }
            }
            let accessToken = try await freshAccessToken()
            let accepted = try await APIService.shared.sendMessage(
                accessToken: accessToken,
                requestBody: MessageIngressRequest(
                    message: trimmed,
                    sessionKey: surface?.sessionKey,
                    triggerType: triggerType,
                    metadata: metadata
                ),
                idempotencyKey: UUID().uuidString.lowercased()
            )

            Haptic.medium()
            errorMessage = nil

            if let pendingMessageID {
                markPendingUserMessageAccepted(
                    pendingMessageID: pendingMessageID,
                    serverEventID: accepted.eventId,
                    runID: accepted.runId
                )
            }

            if accepted.replayed && shouldRenderPendingMessage {
                toast = ToastData(message: "Recovered your existing run.", icon: "arrow.clockwise.circle.fill")
            }

            let streamPath = accepted.streamUrl ?? "/v1/runs/\(accepted.runId)/stream"
            if shouldObserveForegroundRun {
                startRunObservation(
                    runID: accepted.runId,
                    streamPath: streamPath
                )
            } else {
                startBackgroundRunObservation(
                    runID: accepted.runId,
                    streamPath: streamPath
                )
            }
            withAnimation(AppTheme.Animation.gentle) {
                isSending = false
            }

            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.refreshSurface(allowAppOpenTrigger: false)
            }

            return true
        } catch {
            if let pendingMessageID {
                removePendingUserMessage(pendingMessageID)
            }
            showError(error.localizedDescription)
        }

        withAnimation(AppTheme.Animation.gentle) {
            isSending = false
        }
        return false
    }

    /// Starts Polling for this module.
    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            guard let self else { return }

            for _ in 0..<12 {
                guard !Task.isCancelled else { return }

                try? await Task.sleep(nanoseconds: 1_250_000_000)
                await self.refreshSurface(allowAppOpenTrigger: false)

                if self.activeRun == nil || self.streamTask != nil {
                    return
                }
            }
        }
    }

    /// Starts Run observation for this module.
    private func startRunObservation(runID: String, streamPath: String) {
        if observedRunID == runID, observedStreamPath == streamPath, streamTask != nil {
            return
        }

        let isNewRun = observedRunID != runID
        pollTask?.cancel()
        pollTask = nil
        cancelRunObservation(resetStreamState: isNewRun)

        observedRunID = runID
        observedStreamPath = streamPath

        if isNewRun {
            lastStreamEventID = nil
        }

        ensureRunTrace(for: runID)
        updateRunTrace(runID) { trace in
            trace.isStreaming = true
        }

        streamTask = Task { @MainActor [weak self] in
            guard let self else { return }

            do {
                let accessToken = try await self.freshAccessToken()
                let stream = APIService.shared.streamRun(
                    accessToken: accessToken,
                    streamPath: streamPath,
                    lastEventId: self.lastStreamEventID
                )

                for try await event in stream {
                    guard !Task.isCancelled else { return }
                    self.handleRunStreamEvent(event, expectedRunID: runID)
                }

                self.streamTask = nil
                await self.refreshSurface(allowAppOpenTrigger: false)
            } catch is CancellationError {
                self.streamTask = nil
            } catch {
                self.streamTask = nil
                await self.refreshSurface(allowAppOpenTrigger: false)

                if self.surface?.activeRun?.runId == runID {
                    self.startPolling()
                }
            }
        }
    }

    /// Handles Cancel run observation for AppView.swift.
    private func cancelRunObservation(resetStreamState: Bool) {
        streamTask?.cancel()
        streamTask = nil
        observedRunID = nil
        observedStreamPath = nil

        if resetStreamState {
            lastStreamEventID = nil
        }
    }

    /// Starts Background run observation for this module.
    private func startBackgroundRunObservation(runID: String, streamPath: String) {
        if observedBackgroundRunID == runID,
           observedBackgroundStreamPath == streamPath,
           backgroundStreamTask != nil {
            return
        }

        cancelBackgroundRunObservation()
        observedBackgroundRunID = runID
        observedBackgroundStreamPath = streamPath

        backgroundStreamTask = Task { @MainActor [weak self] in
            guard let self else { return }

            do {
                let accessToken = try await self.freshAccessToken()
                let stream = APIService.shared.streamRun(
                    accessToken: accessToken,
                    streamPath: streamPath
                )

                for try await event in stream {
                    guard !Task.isCancelled else { return }
                    self.handleBackgroundRunStreamEvent(event, expectedRunID: runID)
                }

                self.backgroundStreamTask = nil
                self.observedBackgroundRunID = nil
                self.observedBackgroundStreamPath = nil
                await self.refreshSurface(allowAppOpenTrigger: false)
            } catch is CancellationError {
                self.backgroundStreamTask = nil
                self.observedBackgroundRunID = nil
                self.observedBackgroundStreamPath = nil
            } catch {
                self.backgroundStreamTask = nil
                self.observedBackgroundRunID = nil
                self.observedBackgroundStreamPath = nil
                await self.refreshSurface(allowAppOpenTrigger: false)
            }
        }
    }

    /// Handles Cancel background run observation for AppView.swift.
    private func cancelBackgroundRunObservation() {
        backgroundStreamTask?.cancel()
        backgroundStreamTask = nil
        observedBackgroundRunID = nil
        observedBackgroundStreamPath = nil
    }

    /// Shows Workout agent banner if needed in the current UI state.
    private func showWorkoutAgentBannerIfNeeded(for command: WorkoutCommandResult?) {
        guard let command,
              command.actor == "agent",
              command.status != "rejected" else {
            return
        }

        let text: String
        switch command.commandType {
        case "session.start":
            text = "Coach started the workout."
        case "set.complete":
            text = "Coach marked a set complete."
        case "set.skip":
            text = "Coach skipped a set."
        case "exercise.skip":
            text = "Coach skipped the current exercise."
        case "session.pause":
            text = "Coach paused the workout."
        case "session.resume":
            text = "Coach resumed the workout."
        case "session.finish":
            text = "Coach finished the workout."
        case "set.targets.adjust":
            text = "Coach adjusted upcoming set targets."
        case "exercise.replace":
            text = "Coach swapped in a different exercise."
        case "workout.remaining.rewrite":
            text = "Coach rewrote the remaining workout."
        default:
            text = "Coach updated the workout."
        }

        workoutAgentBanner = WorkoutAgentBanner(
            id: command.commandId,
            text: text
        )
    }

    /// Handles Background run stream event for this module.
    private func handleBackgroundRunStreamEvent(_ event: CoachRunStreamEvent, expectedRunID: String) {
        guard event.runId == expectedRunID else { return }

        if event.type == "workout.state.updated", let workout = event.workout {
            mergeIncomingWorkout(workout)
            showWorkoutAgentBannerIfNeeded(for: event.command)
        }
    }

    /// Normalizes Tool activity label into the format this file expects.
    private func normalizeToolActivityLabel(_ toolName: String?) -> String? {
        guard let toolName, !toolName.isEmpty else { return nil }

        switch toolName {
        case "message_notify_user":
            return "Composing response"
        case "message_ask_user":
            return "Preparing question"
        case "idle":
            return "Wrapping up"
        default:
            let humanized = toolName
                .replacingOccurrences(of: "_", with: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)

            guard !humanized.isEmpty else { return nil }
            return "Running \(humanized)"
        }
    }

    /// Appends Run trace activity to the existing record.
    private func appendRunTraceActivity(_ activity: String, runID: String) {
        let normalized = activity.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return }

        withAnimation(AppTheme.Animation.gentle) {
            updateRunTrace(runID) { trace in
                let existingLines = trace.commentaryText
                    .split(separator: "\n", omittingEmptySubsequences: true)
                    .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }

                if existingLines.last == normalized {
                    return
                }

                let nextLines = Array((existingLines + [normalized]).suffix(4))
                trace.commentaryText = nextLines.joined(separator: "\n")
            }
        }
    }

    /// Appends Streaming chunk to the existing record.
    private func appendStreamingChunk(_ event: CoachRunStreamEvent, expectedRunID: String) {
        guard let textChunk = event.text, !textChunk.isEmpty else { return }

        let delivery = (event.delivery ?? "feed").lowercased()
        guard delivery != "suppressed", event.skipped != true else { return }

        withAnimation(AppTheme.Animation.gentle) {
            updateRunTrace(expectedRunID) { trace in
                if trace.startedAt == nil {
                    trace.startedAt = Date()
                }

                trace.isStreaming = true
                trace.errorMessage = nil

                switch event.toolName {
                case "message_notify_user":
                    if delivery == "transient" {
                        trace.finalText = ""
                        trace.transientText += textChunk
                    } else {
                        trace.transientText = ""
                        trace.finalText += textChunk
                    }
                case "message_ask_user":
                    trace.transientText = ""
                    trace.finalText += textChunk
                default:
                    break
                }
            }
        }
    }

    /// Handles Run stream event for this module.
    private func handleRunStreamEvent(_ event: CoachRunStreamEvent, expectedRunID: String) {
        guard event.runId == expectedRunID else { return }
        ensureRunTrace(for: expectedRunID)

        if let eventID = event.eventId {
            lastStreamEventID = String(eventID)
        }

        switch event.type {
        case "workout.state.updated":
            if let workout = event.workout {
                mergeIncomingWorkout(workout)
                showWorkoutAgentBannerIfNeeded(for: event.command)
            }
        case "tool.call.requested":
            if let iteration = event.iteration, runTraces[expectedRunID]?.currentIteration != iteration {
                updateRunTrace(expectedRunID) { trace in
                    trace.currentIteration = iteration
                    if trace.startedAt == nil {
                        trace.startedAt = Date()
                    }
                }
            }

            updateRunTrace(expectedRunID) { trace in
                trace.isStreaming = true
                if trace.startedAt == nil {
                    trace.startedAt = Date()
                }
                trace.errorMessage = nil
            }

            if let activity = normalizeToolActivityLabel(event.toolName) {
                appendRunTraceActivity(activity, runID: expectedRunID)
            }
        case "assistant.delta":
            if let iteration = event.iteration, runTraces[expectedRunID]?.currentIteration != iteration {
                updateRunTrace(expectedRunID) { trace in
                    trace.currentIteration = iteration
                    if trace.startedAt == nil {
                        trace.startedAt = Date()
                    }
                }
            }

            appendStreamingChunk(event, expectedRunID: expectedRunID)
        case "tool.call.completed":
            if let iteration = event.iteration, runTraces[expectedRunID]?.currentIteration != iteration {
                updateRunTrace(expectedRunID) { trace in
                    trace.currentIteration = iteration
                    if trace.startedAt == nil {
                        trace.startedAt = Date()
                    }
                }
            }

            updateRunTrace(expectedRunID) { trace in
                if trace.startedAt == nil {
                    trace.startedAt = Date()
                }
                trace.errorMessage = nil
                if event.resultStatus == "ok" {
                    let text = event.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    let delivery = (event.delivery ?? "feed").lowercased()
                    let isSuppressed = delivery == "suppressed" || event.skipped == true

                    if isSuppressed {
                        trace.isStreaming = false
                        trace.currentIteration = nil
                        trace.commentaryText = ""
                        trace.transientText = ""
                        trace.finalText = ""
                        return
                    }

                    switch event.toolName {
                    case "message_notify_user":
                        if delivery == "transient" {
                            trace.isStreaming = true
                            trace.finalText = ""
                            if !text.isEmpty {
                                trace.transientText = text
                            }
                        } else {
                            trace.isStreaming = false
                            trace.currentIteration = nil
                            trace.transientText = ""
                            if !text.isEmpty {
                                trace.finalText = text
                            }
                        }
                    case "message_ask_user":
                        trace.isStreaming = false
                        trace.currentIteration = nil
                        trace.transientText = ""
                        if !text.isEmpty {
                            trace.finalText = text
                        }
                    case "idle":
                        trace.isStreaming = false
                        trace.currentIteration = nil
                        trace.transientText = ""
                        trace.finalText = ""
                    default:
                        trace.isStreaming = true
                    }
                }
            }
        case "run.failed":
            if let message = event.message, !message.isEmpty {
                updateRunTrace(expectedRunID) { trace in
                    trace.errorMessage = message
                }
            }

            updateRunTrace(expectedRunID) { trace in
                trace.isStreaming = false
                trace.currentIteration = nil
            }

            if let message = event.message, !message.isEmpty {
                showError(message)
            }

            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.refreshSurface(allowAppOpenTrigger: false)
            }
        case "run.completed":
            updateRunTrace(expectedRunID) { trace in
                trace.isStreaming = false
                trace.currentIteration = nil
            }

            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.refreshSurface(allowAppOpenTrigger: false)
            }
        default:
            break
        }
    }

    /// Handles Fresh access token for AppView.swift.
    private func freshAccessToken() async throws -> String {
        let session = try await supabase.auth.session
        return session.accessToken
    }
}

/// Handles Is terminal exercise status for AppView.swift.
private func isTerminalExerciseStatus(_ status: String) -> Bool {
    ["completed", "skipped", "canceled"].contains(status)
}

/// Handles Is terminal set status for AppView.swift.
private func isTerminalSetStatus(_ status: String) -> Bool {
    ["completed", "skipped"].contains(status)
}

/// Resolves Current exercise before the next step runs.
private func resolveCurrentExercise(in workout: WorkoutSessionState) -> WorkoutExerciseState? {
    workout.exercises.first(where: { $0.workoutExerciseId == workout.currentExerciseId })
    ?? workout.exercises.first(where: { $0.orderIndex == workout.currentExerciseIndex })
    ?? workout.exercises.first(where: { $0.status == "active" })
    ?? workout.exercises.first(where: { $0.status == "pending" })
}

/// Resolves Current set before the next step runs.
private func resolveCurrentSet(
    in workout: WorkoutSessionState,
    exercise: WorkoutExerciseState
) -> WorkoutSetState? {
    exercise.sets.first(where: { $0.setIndex == workout.currentSetIndex })
    ?? exercise.sets.first(where: { $0.status == "active" })
    ?? exercise.sets.first(where: { $0.status == "pending" })
}

private func resolveWorkoutExercise(
    in workout: WorkoutSessionState,
    workoutExerciseId: String?
) -> WorkoutExerciseState? {
    if let workoutExerciseId,
       let exercise = workout.exercises.first(where: { $0.workoutExerciseId == workoutExerciseId }) {
        return exercise
    }

    return resolveCurrentExercise(in: workout)
}

private func resolveWorkoutSet(
    in workout: WorkoutSessionState,
    exercise: WorkoutExerciseState,
    setIndex: Int?
) -> WorkoutSetState? {
    if let setIndex,
       let set = exercise.sets.first(where: { $0.setIndex == setIndex }) {
        return set
    }

    return resolveCurrentSet(in: workout, exercise: exercise)
}

/// Handles Recompute progress for AppView.swift.
private func recomputeProgress(exercises: [WorkoutExerciseState]) -> WorkoutProgress {
    let completedExercises = exercises.filter { isTerminalExerciseStatus($0.status) }.count
    let allSets = exercises.flatMap(\.sets)
    let completedSets = allSets.filter { isTerminalSetStatus($0.status) }.count

    return WorkoutProgress(
        completedExercises: completedExercises,
        totalExercises: exercises.count,
        completedSets: completedSets,
        totalSets: allSets.count,
        remainingExercises: max(exercises.count - completedExercises, 0)
    )
}

/// Resolves Exercise status before the next step runs.
private func resolveExerciseStatus(for sets: [WorkoutSetState]) -> String {
    if sets.isEmpty {
        return "pending"
    }

    if sets.allSatisfy({ $0.status == "skipped" }) {
        return "skipped"
    }

    if sets.allSatisfy({ isTerminalSetStatus($0.status) }) {
        return "completed"
    }

    if sets.contains(where: { $0.status == "active" }) {
        return "active"
    }

    if sets.contains(where: { isTerminalSetStatus($0.status) }) {
        return "active"
    }

    return "pending"
}

/// Handles First live exercise position for AppView.swift.
private func firstLiveExercisePosition(in workout: WorkoutSessionState) -> Int? {
    if let currentExerciseID = workout.currentExerciseId,
       let index = workout.exercises.firstIndex(where: { $0.workoutExerciseId == currentExerciseID }) {
        return index
    }

    if let currentExerciseIndex = workout.currentExerciseIndex,
       let index = workout.exercises.firstIndex(where: { $0.orderIndex == currentExerciseIndex }) {
        return index
    }

    return workout.exercises.firstIndex(where: { !isTerminalExerciseStatus($0.status) })
}

/// Handles First pending set position for AppView.swift.
private func firstPendingSetPosition(in exercise: WorkoutExerciseState) -> Int? {
    if let index = exercise.sets.firstIndex(where: { $0.status == "active" }) {
        return index
    }

    return exercise.sets.firstIndex(where: { !isTerminalSetStatus($0.status) })
}

/// Handles Activate workout position for AppView.swift.
private func activateWorkoutPosition(
    _ workout: inout WorkoutSessionState,
    exercisePosition: Int?,
    setPosition: Int?
) {
    for exerciseIndex in workout.exercises.indices {
        if !isTerminalExerciseStatus(workout.exercises[exerciseIndex].status) {
            workout.exercises[exerciseIndex].status = exerciseIndex == exercisePosition ? "active" : "pending"
        }

        for setIndex in workout.exercises[exerciseIndex].sets.indices {
            if !isTerminalSetStatus(workout.exercises[exerciseIndex].sets[setIndex].status) {
                if exerciseIndex == exercisePosition && setIndex == setPosition {
                    workout.exercises[exerciseIndex].sets[setIndex].status = "active"
                } else {
                    workout.exercises[exerciseIndex].sets[setIndex].status = "pending"
                }
            }
        }
    }

    if let exercisePosition,
       workout.exercises.indices.contains(exercisePosition),
       let setPosition,
       workout.exercises[exercisePosition].sets.indices.contains(setPosition) {
        workout.currentExerciseIndex = workout.exercises[exercisePosition].orderIndex
        workout.currentExerciseId = workout.exercises[exercisePosition].workoutExerciseId
        workout.currentSetIndex = workout.exercises[exercisePosition].sets[setPosition].setIndex
        workout.currentPhase = "exercise"
        workout.status = "in_progress"
    } else {
        workout.currentExerciseIndex = nil
        workout.currentExerciseId = nil
        workout.currentSetIndex = nil
        workout.currentPhase = "finished"
        workout.status = "completed"
    }
}

/// Applies Optimistic workout action to the current data.
private func applyOptimisticWorkoutAction(
    _ action: WorkoutDirectAction,
    to workout: WorkoutSessionState,
    workoutExerciseId: String? = nil,
    setIndex: Int? = nil
) -> WorkoutSessionState? {
    var updated = workout
    updated.stateVersion += 1

    switch action {
    case .startWorkout:
        let exercisePosition = firstLiveExercisePosition(in: updated)
        guard let exercisePosition,
              updated.exercises.indices.contains(exercisePosition),
              let setPosition = firstPendingSetPosition(in: updated.exercises[exercisePosition]) else {
            return nil
        }

        activateWorkoutPosition(&updated, exercisePosition: exercisePosition, setPosition: setPosition)
    case .completeCurrentSet:
        guard let exercisePosition = workoutExerciseId.flatMap({
                id in updated.exercises.firstIndex(where: { $0.workoutExerciseId == id })
            }) ?? firstLiveExercisePosition(in: updated),
              updated.exercises.indices.contains(exercisePosition),
              let setPosition = setIndex.flatMap({
                targetSetIndex in updated.exercises[exercisePosition].sets.firstIndex(where: { $0.setIndex == targetSetIndex })
              }) ?? firstPendingSetPosition(in: updated.exercises[exercisePosition]),
              !isTerminalSetStatus(updated.exercises[exercisePosition].sets[setPosition].status) else {
            return nil
        }

        updated.exercises[exercisePosition].sets[setPosition].status = "completed"
        updated.exercises[exercisePosition].status = resolveExerciseStatus(for: updated.exercises[exercisePosition].sets)

        if let nextSetPosition = firstPendingSetPosition(in: updated.exercises[exercisePosition]) {
            activateWorkoutPosition(&updated, exercisePosition: exercisePosition, setPosition: nextSetPosition)
        } else {
            let nextExercisePosition = updated.exercises.indices.first(where: { index in
                updated.exercises[index].orderIndex > updated.exercises[exercisePosition].orderIndex
                && !isTerminalExerciseStatus(updated.exercises[index].status)
            })
            let nextSetPosition = nextExercisePosition.flatMap { firstPendingSetPosition(in: updated.exercises[$0]) }
            activateWorkoutPosition(&updated, exercisePosition: nextExercisePosition, setPosition: nextSetPosition)
        }
    case .skipCurrentExercise:
        guard let exercisePosition = workoutExerciseId.flatMap({
                id in updated.exercises.firstIndex(where: { $0.workoutExerciseId == id })
            }) ?? firstLiveExercisePosition(in: updated),
              updated.exercises.indices.contains(exercisePosition) else {
            return nil
        }

        for setIndex in updated.exercises[exercisePosition].sets.indices where !isTerminalSetStatus(updated.exercises[exercisePosition].sets[setIndex].status) {
            updated.exercises[exercisePosition].sets[setIndex].status = "skipped"
        }

        updated.exercises[exercisePosition].status = "skipped"

        let nextExercisePosition = updated.exercises.indices.first(where: { index in
            updated.exercises[index].orderIndex > updated.exercises[exercisePosition].orderIndex
            && !isTerminalExerciseStatus(updated.exercises[index].status)
        })
        let nextSetPosition = nextExercisePosition.flatMap { firstPendingSetPosition(in: updated.exercises[$0]) }
        activateWorkoutPosition(&updated, exercisePosition: nextExercisePosition, setPosition: nextSetPosition)
    case .pauseWorkout:
        updated.status = "paused"
    case .resumeWorkout:
        if updated.status == "paused" {
            if updated.currentPhase == "finished" {
                let exercisePosition = firstLiveExercisePosition(in: updated)
                let setPosition = exercisePosition.flatMap { firstPendingSetPosition(in: updated.exercises[$0]) }
                activateWorkoutPosition(&updated, exercisePosition: exercisePosition, setPosition: setPosition)
            } else {
                updated.status = "in_progress"
            }
        }
    case .finishWorkout:
        for exerciseIndex in updated.exercises.indices {
            for setIndex in updated.exercises[exerciseIndex].sets.indices where !isTerminalSetStatus(updated.exercises[exerciseIndex].sets[setIndex].status) {
                updated.exercises[exerciseIndex].sets[setIndex].status = "skipped"
            }

            if !isTerminalExerciseStatus(updated.exercises[exerciseIndex].status) {
                updated.exercises[exerciseIndex].status = "canceled"
            }
        }

        updated.currentExerciseIndex = nil
        updated.currentExerciseId = nil
        updated.currentSetIndex = nil
        updated.currentPhase = "finished"
        updated.status = "completed"
    }

    updated.progress = recomputeProgress(exercises: updated.exercises)
    return updated
}

private struct CoachSurfaceScreen: View {
    @ObservedObject var viewModel: CoachSurfaceViewModel
    @ObservedObject var speechManager: SpeechManager
    let userEmail: String?
    let onSignOut: () -> Void

    private let bottomAnchor = "coach-feed-bottom"
    @State private var isUtilitySheetPresented = false
    @State private var isQuickActionSheetPresented = false
    @State private var isFeedPinnedToBottom = true
    @State private var showsJumpToLatest = false
    @State private var dictationSeedText = ""
    @FocusState private var composerIsFocused: Bool

    private var composerIsExpanded: Bool {
        composerIsFocused || speechManager.isListening
    }

    private var showsHomeSpotlight: Bool {
        !viewModel.isLoading && viewModel.visibleFeedItems.isEmpty
    }

    private var spotlightTitle: String {
        if let workoutTitle = viewModel.pinnedWorkout?.title?.trimmingCharacters(in: .whitespacesAndNewlines),
           !workoutTitle.isEmpty {
            return workoutTitle
        }

        if let cardTitle = viewModel.pinnedFeedCard?.title.trimmingCharacters(in: .whitespacesAndNewlines),
           !cardTitle.isEmpty {
            return cardTitle
        }

        return viewModel.pinnedWorkout == nil ? "Today's Focus" : "Today's Workout"
    }

    private var spotlightSubtitle: String {
        if let card = viewModel.pinnedFeedCard {
            for candidate in [card.subtitle, card.body, card.coachCue] {
                let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if !trimmed.isEmpty {
                    return trimmed
                }
            }
        }

        let headerSubtitle = viewModel.surface?.header.subtitle.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !headerSubtitle.isEmpty {
            return headerSubtitle
        }

        if let actionMessage = viewModel.quickActions.first?.message.trimmingCharacters(in: .whitespacesAndNewlines),
           !actionMessage.isEmpty {
            return actionMessage
        }

        return "Start a workout, adjust the plan, or ask for a quick training check-in."
    }

    private var spotlightSymbol: String {
        if let icon = viewModel.quickActions.first?.icon, !icon.isEmpty {
            return icon
        }

        if viewModel.pinnedWorkout != nil {
            return "figure.strengthtraining.traditional"
        }

        if let cardType = viewModel.pinnedFeedCard?.type {
            switch cardType {
            case "workout_current":
                return "figure.run"
            case "workout_summary":
                return "checkmark.circle"
            default:
                break
            }
        }

        return "sparkles"
    }

    var body: some View {
        GeometryReader { geometry in
            let contentMinHeight = max(
                geometry.size.height
                    - geometry.safeAreaInsets.top
                    - geometry.safeAreaInsets.bottom
                    - 190,
                280
            )
            let scrollViewportHeight = max(
                geometry.size.height
                    - geometry.safeAreaInsets.top
                    - geometry.safeAreaInsets.bottom
                    - 150,
                260
            )

            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()

                ScrollViewReader { proxy in
                    VStack(spacing: 0) {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 24) {
                                if let errorMessage = viewModel.errorMessage {
                                    CoachStatusBanner(
                                        title: "Connection needs attention",
                                        message: errorMessage,
                                        icon: "exclamationmark.triangle.fill"
                                    )
                                }

                                if viewModel.isLoading && viewModel.visibleFeedItems.isEmpty {
                                    CoachLoadingCard()
                                        .frame(maxWidth: .infinity)
                                        .frame(minHeight: contentMinHeight, alignment: .center)
                                } else if showsHomeSpotlight {
                                    CoachHomeSpotlightCard(
                                        title: spotlightTitle,
                                        subtitle: spotlightSubtitle,
                                        symbol: spotlightSymbol
                                    ) {
                                        handleSpotlightTap()
                                    }
                                    .frame(maxWidth: .infinity)
                                    .frame(minHeight: contentMinHeight, alignment: .center)
                                } else {
                                    if let pinnedCard = viewModel.pinnedFeedCard {
                                        CoachPinnedFeedCard(card: pinnedCard) { action in
                                            Task { await viewModel.runCardAction(action) }
                                        }
                                    }

                                    LazyVStack(spacing: 22) {
                                        ForEach(viewModel.visibleFeedItems) { item in
                                            CoachFeedRow(item: item) { action in
                                                Task { await viewModel.runCardAction(action) }
                                            }
                                        }
                                    }
                                }

                                Color.clear
                                    .frame(height: 1)
                                    .id(bottomAnchor)
                                    .background {
                                        GeometryReader { marker in
                                            Color.clear.preference(
                                                key: CoachFeedBottomPreferenceKey.self,
                                                value: marker.frame(in: .named("coach-feed-scroll")).minY
                                            )
                                        }
                                    }
                            }
                            .padding(.horizontal, 22)
                            .padding(.top, 8)
                            .padding(.bottom, 34)
                            .frame(maxWidth: 720, alignment: .leading)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .animation(AppTheme.Animation.slow, value: showsHomeSpotlight)
                        }
                        .scrollIndicators(.hidden)
                        .scrollDismissesKeyboard(.interactively)
                        .coordinateSpace(name: "coach-feed-scroll")
                        .contentShape(Rectangle())
                        .onTapGesture {
                            composerIsFocused = false
                        }
                        .overlay(alignment: .bottom) {
                            if showsJumpToLatest {
                                Button {
                                    withAnimation(AppTheme.Animation.slow) {
                                        proxy.scrollTo(bottomAnchor, anchor: .bottom)
                                        showsJumpToLatest = false
                                        isFeedPinnedToBottom = true
                                    }
                                    Haptic.selection()
                                } label: {
                                    HStack(spacing: 7) {
                                        Image(systemName: "arrow.down")
                                            .font(.system(size: 11, weight: .bold))

                                        Text("Latest")
                                            .font(.system(size: 13, weight: .semibold))
                                    }
                                    .foregroundStyle(AppTheme.Colors.primaryText)
                                    .padding(.horizontal, 13)
                                    .padding(.vertical, 9)
                                    .liquidGlassCapsule(shadowOpacity: 0.06)
                                }
                                .buttonStyle(PressableScaleButtonStyle())
                                .padding(.bottom, 12)
                                .transition(.scale(scale: 0.92).combined(with: .opacity))
                            }
                        }
                        .safeAreaInset(edge: .bottom, spacing: 6) {
                            VStack(spacing: 10) {
                                if let pinnedWorkout = viewModel.pinnedWorkout {
                                    PinnedWorkoutControlCard(
                                        workout: pinnedWorkout,
                                        bannerText: viewModel.workoutAgentBanner?.text
                                    ) { action, exercise, set in
                                        Task {
                                            await viewModel.runWorkoutAction(
                                                action,
                                                workoutExerciseId: exercise?.workoutExerciseId,
                                                setIndex: set?.setIndex
                                            )
                                        }
                                    }
                                }

                                ComposerDock(
                                    text: $viewModel.composerText,
                                    isSending: viewModel.isSending,
                                    placeholder: viewModel.composerPlaceholder,
                                    speechManager: speechManager,
                                    isFocused: $composerIsFocused,
                                    isExpanded: composerIsExpanded,
                                    onPlusTap: {
                                        composerIsFocused = false
                                        Haptic.light()
                                        isQuickActionSheetPresented = true
                                    },
                                    onSend: handleSend,
                                    onMicrophoneTap: handleMicrophoneTap
                                )
                            }
                            .padding(.horizontal, 24)
                            .padding(.top, 8)
                            .padding(.bottom, 4)
                        }
                        .overlay(alignment: .topLeading) {
                            CoachSurfaceTopBar(
                                isResettingSession: viewModel.isResettingSession,
                                onMenuTap: {
                                    composerIsFocused = false
                                    Haptic.light()
                                    isUtilitySheetPresented = true
                                }
                            )
                            .padding(.horizontal, 18)
                            .padding(.top, 6)
                        }
                        .sheet(isPresented: $isUtilitySheetPresented) {
                            VoiceUtilitySheet(
                                isResettingSession: viewModel.isResettingSession,
                                onNewChat: {
                                    Task { await viewModel.resetSession() }
                                },
                                onRefresh: {
                                    Task { await viewModel.manualRefresh() }
                                },
                                onSignOut: onSignOut
                            )
                            .presentationDetents([.height(260)])
                            .presentationDragIndicator(.visible)
                            .presentationCornerRadius(30)
                            .presentationBackground(.ultraThinMaterial)
                        }
                        .sheet(isPresented: $isQuickActionSheetPresented) {
                            QuickActionSheet(actions: viewModel.quickActions) { action in
                                Task { await viewModel.runQuickAction(action) }
                            }
                            .presentationDetents([.height(viewModel.quickActions.isEmpty ? 220 : 320)])
                            .presentationDragIndicator(.visible)
                            .presentationCornerRadius(30)
                            .presentationBackground(.ultraThinMaterial)
                        }
                        .onChange(of: viewModel.scrollToken) { _, _ in
                            if isFeedPinnedToBottom || viewModel.isSending {
                                withAnimation(AppTheme.Animation.slow) {
                                    proxy.scrollTo(bottomAnchor, anchor: .bottom)
                                    showsJumpToLatest = false
                                }
                            } else {
                                withAnimation(AppTheme.Animation.gentle) {
                                    showsJumpToLatest = true
                                }
                            }
                        }
                        .onPreferenceChange(CoachFeedBottomPreferenceKey.self) { bottomY in
                            let isNearBottom = bottomY <= scrollViewportHeight + 96
                            isFeedPinnedToBottom = isNearBottom

                            if isNearBottom && showsJumpToLatest {
                                withAnimation(AppTheme.Animation.gentle) {
                                    showsJumpToLatest = false
                                }
                            }
                        }
                        .onChange(of: speechManager.partialTranscript) { _, _ in
                            syncLiveTranscriptIntoComposer()
                        }
                        .onChange(of: speechManager.finalTranscript) { _, _ in
                            syncLiveTranscriptIntoComposer()
                        }
                        .onChange(of: speechManager.isListening) { _, isListening in
                            if isListening {
                                composerIsFocused = false
                            } else {
                                syncLiveTranscriptIntoComposer()
                                dictationSeedText = ""
                            }
                        }
                    }
                }
            }
        }
    }

    private func handleSpotlightTap() {
        if let cardAction = viewModel.pinnedFeedCard?.actions.first {
            Task { await viewModel.runCardAction(cardAction) }
            return
        }

        if let quickAction = viewModel.quickActions.first {
            Task { await viewModel.runQuickAction(quickAction) }
            return
        }

        composerIsFocused = true
        Haptic.selection()
    }

    /// Handles Microphone tap for this module.
    private func handleMicrophoneTap() {
        if speechManager.isListening {
            stopListeningAndCommitCurrentTranscript()
            Haptic.selection()
            return
        }

        dictationSeedText = viewModel.composerText
        composerIsFocused = false

        Task {
            await speechManager.startListening()
            if speechManager.isListening {
                Haptic.light()
                syncLiveTranscriptIntoComposer()
            } else {
                dictationSeedText = ""
            }
        }
    }

    /// Handles Send for this module.
    private func handleSend() {
        if speechManager.isListening {
            stopListeningAndCommitCurrentTranscript()
        }

        guard !viewModel.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        withAnimation(.spring(response: 0.26, dampingFraction: 0.86)) {
            composerIsFocused = false
        }
        Task { await viewModel.submitComposer() }
    }

    /// Handles Sync live transcript into composer for AppView.swift.
    private func syncLiveTranscriptIntoComposer() {
        guard speechManager.isListening else { return }
        viewModel.composerText = composedText(
            baseText: dictationSeedText,
            transcript: currentTranscript
        )
    }

    /// Stops Listening and commit current transcript when it is no longer needed.
    private func stopListeningAndCommitCurrentTranscript() {
        let transcript = currentTranscript
        speechManager.stopListening()
        viewModel.composerText = composedText(baseText: dictationSeedText, transcript: transcript)
        dictationSeedText = ""

        if !viewModel.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            composerIsFocused = true
        }
    }

    private var currentTranscript: String {
        let transcript = speechManager.finalTranscript.isEmpty
            ? speechManager.partialTranscript
            : speechManager.finalTranscript

        return transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Handles Composed text for AppView.swift.
    private func composedText(baseText: String, transcript: String) -> String {
        let trimmedBase = baseText.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTranscript = transcript.trimmingCharacters(in: .whitespacesAndNewlines)

        switch (trimmedBase.isEmpty, trimmedTranscript.isEmpty) {
        case (true, true):
            return ""
        case (false, true):
            return trimmedBase
        case (true, false):
            return trimmedTranscript
        case (false, false):
            return "\(trimmedBase) \(trimmedTranscript)"
        }
    }
}

private struct VoiceUtilitySheet: View {
    let isResettingSession: Bool
    let onNewChat: () -> Void
    let onRefresh: () -> Void
    let onSignOut: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Chat actions")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .padding(.top, 4)

            VoiceUtilityActionRow(
                title: "Create new chat",
                subtitle: "Start fresh without leaving the screen.",
                systemImage: "square.and.pencil",
                isDisabled: isResettingSession
            ) {
                dismiss()
                onNewChat()
            }

            VoiceUtilityActionRow(
                title: "Refresh",
                subtitle: "Pull the latest thread state from the server.",
                systemImage: "arrow.clockwise"
            ) {
                dismiss()
                onRefresh()
            }

            VoiceUtilityActionRow(
                title: "Log out",
                subtitle: "Sign out of this account.",
                systemImage: "rectangle.portrait.and.arrow.right"
            ) {
                dismiss()
                onSignOut()
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 6)
    }
}

private struct VoiceUtilityActionRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    var isDisabled = false
    let action: () -> Void

    var body: some View {
        Button(action: {
            Haptic.light()
            action()
        }) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                        .fill(AppTheme.Colors.surfaceHover)
                        .frame(width: 48, height: 48)

                    Image(systemName: systemImage)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.primaryText)

                    Text(subtitle)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.secondaryText)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .liquidGlassBackground(cornerRadius: 24)
        }
        .buttonStyle(PressableScaleButtonStyle())
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.6 : 1)
    }
}

private struct QuickActionSheet: View {
    let actions: [CoachQuickAction]
    let onAction: (CoachQuickAction) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Quick actions")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .padding(.top, 4)

            if actions.isEmpty {
                Text("Type a prompt to start a new conversation with your coach.")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
                    .padding(.horizontal, 4)
                    .padding(.top, 8)
            } else {
                ForEach(actions) { action in
                    VoiceUtilityActionRow(
                        title: action.label,
                        subtitle: action.message,
                        systemImage: action.icon
                    ) {
                        dismiss()
                        onAction(action)
                    }
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 6)
    }
}

private struct CoachSurfaceTopBar: View {
    let isResettingSession: Bool
    let onMenuTap: () -> Void

    var body: some View {
        HStack {
            Button(action: onMenuTap) {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .frame(width: 42, height: 42)
                    .liquidGlassBackground(cornerRadius: 21, shadowOpacity: 0.1)
            }
            .buttonStyle(PressableScaleButtonStyle())
            .accessibilityLabel("Open chat actions")

            Spacer(minLength: 0)
        }
        .opacity(isResettingSession ? 0.72 : 1)
    }
}

private struct CoachSurfaceTopHeader: View {
    let subtitle: String
    let userEmail: String?
    let hasActiveRun: Bool
    let isResettingSession: Bool
    let onResetSession: () -> Void
    let onRefresh: () -> Void
    let onSignOut: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Coach")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(AppTheme.Colors.primaryText)

                Text(subtitle)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    StatusPill(
                        label: hasActiveRun ? "Live run" : "Ready",
                        icon: hasActiveRun ? "bolt.fill" : "checkmark.circle.fill"
                    )

                    if let userEmail {
                        StatusPill(label: userEmail, icon: "person.crop.circle")
                    }
                }
            }

            Spacer(minLength: 0)

            VStack(spacing: 10) {
                HeaderCircleButton(
                    icon: "square.and.pencil",
                    isDisabled: isResettingSession,
                    action: onResetSession
                )
                HeaderCircleButton(icon: "arrow.clockwise", action: onRefresh)
                HeaderCircleButton(icon: "rectangle.portrait.and.arrow.right", action: onSignOut)
            }
        }
    }
}

private struct HeaderCircleButton: View {
    let icon: String
    var isDisabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.primaryText)
                .frame(width: 42, height: 42)
                .liquidGlassBackground(cornerRadius: 21, shadowOpacity: 0.08)
        }
        .buttonStyle(PressableScaleButtonStyle())
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.6 : 1)
    }
}

private struct StatusPill: View {
    let label: String
    let icon: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
            Text(label)
                .lineLimit(1)
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(AppTheme.Colors.secondaryText)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            Capsule(style: .continuous)
                .fill(AppTheme.Colors.surface)
        )
    }
}

private struct CoachStatusBanner: View {
    let title: String
    let message: String
    let icon: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(AppTheme.Colors.surfaceHover)
                    .frame(width: 34, height: 34)

                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundStyle(AppTheme.Colors.primaryText)

                Text(message)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .padding(14)
        .liquidGlassBackground(cornerRadius: 24)
    }
}

private struct CoachLoadingCard: View {
    var body: some View {
        HStack(spacing: 14) {
            LiquidThinkingOrb(size: 22)

            Text("Loading the latest conversation...")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .shimmer(duration: 1.5)

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .liquidGlassBackground(cornerRadius: 22)
    }
}

private struct CoachHomeSpotlightCard: View {
    let title: String
    let subtitle: String
    let symbol: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 18) {
                ZStack {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(AppTheme.Gradients.orb)
                        .frame(width: 76, height: 76)
                        .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.22), radius: 18, y: 10)

                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(.ultraThinMaterial.opacity(0.24))
                        .frame(width: 76, height: 76)

                    Image(systemName: symbol)
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(Color.white)
                }

                VStack(spacing: 8) {
                    HStack(spacing: 6) {
                        Text(title)
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.primaryText)
                            .lineLimit(1)

                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(AppTheme.Colors.primaryText.opacity(0.7))
                    }

                    Text(subtitle)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: 320)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        .buttonStyle(PressableScaleButtonStyle())
    }
}

private struct CoachEmptyStateCard: View {
    let userEmail: String?
    let quickActions: [CoachQuickAction]
    let onAction: (CoachQuickAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let userEmail, !userEmail.isEmpty {
                Text(userEmail)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.tertiaryText)
            }

            Text("How can I help with training today?")
                .font(.system(size: 31, weight: .regular, design: .rounded))
                .foregroundStyle(AppTheme.Colors.primaryText)

            Text("Use voice or type naturally. Replies will stay lightweight, with user messages tucked to the right and everything else feeling as direct as a conversation.")
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

            if !quickActions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(quickActions) { action in
                            Button(action: { onAction(action) }) {
                                HStack(spacing: 8) {
                                    Image(systemName: action.icon)
                                    Text(action.label)
                                }
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(AppTheme.Colors.primaryText)
                                .padding(.horizontal, 15)
                                .padding(.vertical, 12)
                                .liquidGlassCapsule()
                            }
                            .buttonStyle(PressableScaleButtonStyle())
                        }
                    }
                }
            }
        }
        .padding(.vertical, 12)
    }
}

private struct FeatureLine: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(AppTheme.Colors.primaryText)
                .frame(width: 6, height: 6)
                .padding(.top, 6)

            Text(text)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryText)
        }
    }
}

private struct CoachFeedRow: View {
    let item: CoachRenderedFeedItem
    let onCardAction: (CoachCardAction) -> Void

    var isAssistant: Bool {
        item.isAssistant
    }

    var body: some View {
        Group {
            if item.kind == "run_trace", let trace = item.trace {
                CoachRunTraceView(trace: trace)
                    .frame(maxWidth: 640, alignment: .leading)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else if item.kind == "card", let card = item.card {
                CoachStructuredCard(card: card, isPinned: false, onAction: onCardAction)
                    .frame(maxWidth: 440, alignment: .leading)
                    .padding(.trailing, 40)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else if isAssistant {
                assistantTurnContent
            } else {
                userMessageContent
            }
        }
    }

    private var assistantTurnContent: some View {
        CoachAssistantTurnView(
            text: item.text,
            trace: item.trace,
            isProvisional: item.isProvisional
        )
        .frame(maxWidth: 650, alignment: .leading)
        .padding(.trailing, 26)
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private var userMessageContent: some View {
        HStack(alignment: .top) {
            Spacer(minLength: 96)

            CoachMessageText(
                text: item.text,
                rendersMarkdown: false,
                foregroundColor: AppTheme.Colors.primaryText,
                isProvisional: item.isProvisional
            )
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .liquidGlassBackground(cornerRadius: 24, shadowOpacity: 0.035)
            .frame(maxWidth: 318, alignment: .trailing)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .transition(
            .asymmetric(
                insertion: .offset(x: 0, y: 72)
                    .combined(with: .scale(scale: 0.92, anchor: .bottomTrailing))
                    .combined(with: .opacity),
                removal: .opacity
            )
        )
    }
}

private struct PinnedWorkoutControlAction: Identifiable {
    let id: String
    let action: WorkoutDirectAction
    let label: String
    let icon: String
    let isPrimary: Bool
}

/// Handles Pinned workout control actions for AppView.swift.
private func pinnedWorkoutControlActions(for workout: WorkoutSessionState) -> [PinnedWorkoutControlAction] {
    if workout.currentPhase == "preview" || workout.status == "queued" {
        return [
            PinnedWorkoutControlAction(
                id: WorkoutDirectAction.startWorkout.rawValue,
                action: .startWorkout,
                label: "Start",
                icon: "play.fill",
                isPrimary: true
            ),
            PinnedWorkoutControlAction(
                id: WorkoutDirectAction.finishWorkout.rawValue,
                action: .finishWorkout,
                label: "Finish",
                icon: "stop.fill",
                isPrimary: false
            )
        ]
    }

    if workout.status == "paused" {
        return [
            PinnedWorkoutControlAction(
                id: WorkoutDirectAction.resumeWorkout.rawValue,
                action: .resumeWorkout,
                label: "Resume",
                icon: "play.fill",
                isPrimary: true
            ),
            PinnedWorkoutControlAction(
                id: WorkoutDirectAction.skipCurrentExercise.rawValue,
                action: .skipCurrentExercise,
                label: "Skip",
                icon: "forward.fill",
                isPrimary: false
            ),
            PinnedWorkoutControlAction(
                id: WorkoutDirectAction.finishWorkout.rawValue,
                action: .finishWorkout,
                label: "Finish",
                icon: "stop.fill",
                isPrimary: false
            )
        ]
    }

    return [
        PinnedWorkoutControlAction(
            id: WorkoutDirectAction.completeCurrentSet.rawValue,
            action: .completeCurrentSet,
            label: "Done",
            icon: "checkmark",
            isPrimary: true
        ),
        PinnedWorkoutControlAction(
            id: WorkoutDirectAction.skipCurrentExercise.rawValue,
            action: .skipCurrentExercise,
            label: "Skip",
            icon: "forward.fill",
            isPrimary: false
        ),
        PinnedWorkoutControlAction(
            id: WorkoutDirectAction.pauseWorkout.rawValue,
            action: .pauseWorkout,
            label: "Pause",
            icon: "pause.fill",
            isPrimary: false
        ),
        PinnedWorkoutControlAction(
            id: WorkoutDirectAction.finishWorkout.rawValue,
            action: .finishWorkout,
            label: "Finish",
            icon: "stop.fill",
            isPrimary: false
        )
    ]
}

private struct PinnedWorkoutControlCard: View {
    let workout: WorkoutSessionState
    let bannerText: String?
    let onAction: (WorkoutDirectAction, WorkoutExerciseState?, WorkoutSetState?) -> Void

    @State private var selectedExerciseId: String?
    @GestureState private var dragTranslation: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let bannerText,
               !bannerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(bannerText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(AppTheme.Colors.surfaceHover)
                    )
            }

            GeometryReader { proxy in
                HStack(spacing: 0) {
                    ForEach(orderedExercises, id: \.workoutExerciseId) { exercise in
                        exercisePage(for: exercise)
                            .frame(width: proxy.size.width, alignment: .leading)
                    }
                }
                .offset(x: pageOffset(width: proxy.size.width))
                .animation(.interactiveSpring(response: 0.28, dampingFraction: 0.84), value: selectedExerciseId)
                .animation(.interactiveSpring(response: 0.2, dampingFraction: 0.88), value: dragTranslation)
            }
            .frame(height: 82)
            .clipped()

            ZStack {
                exerciseDots
                    .frame(maxWidth: .infinity, alignment: .center)

                HStack(spacing: 8) {
                    Spacer(minLength: 0)

                    iconActionButton(
                        icon: primaryActionIcon,
                        label: primaryActionLabel,
                        isPrimary: true,
                        isDisabled: !canRunPrimaryAction
                    ) {
                        runPrimaryAction()
                    }
                }
            }
        }
        .padding(14)
        .liquidGlassBackground(cornerRadius: 22, shadowOpacity: 0.035)
        .contentShape(Rectangle())
        .gesture(swipeGesture)
        .onAppear {
            ensureSelectedExercise(preferCurrent: true)
        }
        .onChange(of: workout.currentExerciseId ?? "") { _, _ in
            ensureSelectedExercise(preferCurrent: true)
        }
        .onChange(of: workout.stateVersion) { _, _ in
            ensureSelectedExercise(preferCurrent: false)
        }
    }

    private var orderedExercises: [WorkoutExerciseState] {
        workout.exercises.sorted { left, right in
            left.orderIndex < right.orderIndex
        }
    }

    private var selectedIndex: Int {
        guard let selectedExerciseId,
              let index = orderedExercises.firstIndex(where: { $0.workoutExerciseId == selectedExerciseId }) else {
            return currentExerciseIndex ?? 0
        }

        return index
    }

    private var currentExerciseIndex: Int? {
        if let currentExerciseId = workout.currentExerciseId,
           let index = orderedExercises.firstIndex(where: { $0.workoutExerciseId == currentExerciseId }) {
            return index
        }

        if let currentExerciseIndex = workout.currentExerciseIndex,
           let index = orderedExercises.firstIndex(where: { $0.orderIndex == currentExerciseIndex }) {
            return index
        }

        return orderedExercises.firstIndex(where: { !isTerminalExerciseStatus($0.status) })
    }

    private var selectedExercise: WorkoutExerciseState? {
        guard orderedExercises.indices.contains(selectedIndex) else { return orderedExercises.first }
        return orderedExercises[selectedIndex]
    }

    private var selectedSet: WorkoutSetState? {
        guard let selectedExercise else { return nil }
        return displaySet(for: selectedExercise)
    }

    private var primaryActionIcon: String {
        if workout.status == "queued" || workout.currentPhase == "preview" {
            return "play.fill"
        }

        if workout.status == "paused" {
            return "play.fill"
        }

        return "checkmark"
    }

    private var primaryActionLabel: String {
        if workout.status == "queued" || workout.currentPhase == "preview" {
            return "Start workout"
        }

        if workout.status == "paused" {
            return "Resume workout"
        }

        return "Complete set"
    }

    private var canRunPrimaryAction: Bool {
        if workout.status == "queued" || workout.currentPhase == "preview" || workout.status == "paused" {
            return true
        }

        guard let selectedSet else { return false }
        return !isTerminalSetStatus(selectedSet.status)
    }

    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 16, coordinateSpace: .local)
            .updating($dragTranslation) { value, state, _ in
                state = value.translation.width
            }
            .onEnded { value in
                handleSwipeEnd(value.translation.width)
            }
    }

    private var exerciseDots: some View {
        HStack(spacing: 7) {
            ForEach(orderedExercises.indices, id: \.self) { index in
                Circle()
                    .fill(dotColor(for: index))
                    .frame(width: dotSize(for: index), height: dotSize(for: index))
                    .opacity(dotOpacity(for: index))
                    .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.82), value: dragTranslation)
                    .animation(AppTheme.Animation.gentle, value: selectedIndex)
            }
        }
    }

    @ViewBuilder
    private func exercisePage(for exercise: WorkoutExerciseState) -> some View {
        let set = displaySet(for: exercise)

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(exercise.displayName.isEmpty ? exercise.exerciseName : exercise.displayName)
                    .font(.system(size: 23, weight: .bold, design: .rounded))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)

                Spacer(minLength: 8)

                Text(setRatio(for: exercise, set: set))
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule(style: .continuous)
                            .fill(AppTheme.Colors.surfaceHover)
                    )
            }

            Text(set.map { setValueLine(for: $0) } ?? statusLine(for: exercise))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
        }
    }

    private func iconActionButton(
        icon: String,
        label: String,
        isPrimary: Bool,
        isDisabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(isPrimary ? AppTheme.Colors.background : AppTheme.Colors.primaryText)
                .frame(width: 42, height: 42)
                .background(
                    Circle()
                        .fill(isPrimary ? AppTheme.Colors.primaryText : AppTheme.Colors.surfaceHover)
                )
        }
        .buttonStyle(PressableScaleButtonStyle())
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.42 : 1)
        .accessibilityLabel(label)
    }

    private func runPrimaryAction() {
        if workout.status == "queued" || workout.currentPhase == "preview" {
            onAction(.startWorkout, nil, nil)
            return
        }

        if workout.status == "paused" {
            onAction(.resumeWorkout, nil, nil)
            return
        }

        onAction(.completeCurrentSet, selectedExercise, selectedSet)
    }

    private func displaySet(for exercise: WorkoutExerciseState) -> WorkoutSetState? {
        if exercise.workoutExerciseId == workout.currentExerciseId || exercise.orderIndex == workout.currentExerciseIndex {
            return resolveCurrentSet(in: workout, exercise: exercise)
        }

        return exercise.sets.first(where: { $0.status == "active" })
        ?? exercise.sets.first(where: { !isTerminalSetStatus($0.status) })
        ?? exercise.sets.sorted { $0.setIndex < $1.setIndex }.last
    }

    private func setRatio(for exercise: WorkoutExerciseState, set: WorkoutSetState?) -> String {
        guard !exercise.sets.isEmpty else { return "--" }
        let sortedSets = exercise.sets.sorted { $0.setIndex < $1.setIndex }
        let index = set.flatMap { selectedSet in
            sortedSets.firstIndex(where: { $0.workoutSetId == selectedSet.workoutSetId })
        } ?? 0

        return "\(index + 1)/\(sortedSets.count)"
    }

    private func setValueLine(for set: WorkoutSetState) -> String {
        let target = formatPinnedSetTarget(set.target)
        return target.isEmpty ? "Current set" : target
    }

    private func statusLine(for exercise: WorkoutExerciseState) -> String {
        if workout.status == "paused" {
            return "Paused"
        }

        if isTerminalExerciseStatus(exercise.status) {
            return exercise.status.capitalized
        }

        return "Current set"
    }

    private func pageOffset(width: CGFloat) -> CGFloat {
        -CGFloat(selectedIndex) * width + resistedDrag(width: width)
    }

    private func resistedDrag(width: CGFloat) -> CGFloat {
        guard width > 0 else { return dragTranslation }
        let isAtStart = selectedIndex == 0 && dragTranslation > 0
        let isAtEnd = selectedIndex == orderedExercises.count - 1 && dragTranslation < 0
        return dragTranslation * (isAtStart || isAtEnd ? 0.22 : 0.58)
    }

    private func handleSwipeEnd(_ translation: CGFloat) {
        guard orderedExercises.count > 1 else { return }
        let threshold: CGFloat = 74
        let nextIndex: Int

        if translation < -threshold {
            nextIndex = min(selectedIndex + 1, orderedExercises.count - 1)
        } else if translation > threshold {
            nextIndex = max(selectedIndex - 1, 0)
        } else {
            nextIndex = selectedIndex
        }

        guard nextIndex != selectedIndex else { return }

        selectedExerciseId = orderedExercises[nextIndex].workoutExerciseId
        Haptic.selection()
    }

    private func dotColor(for index: Int) -> Color {
        guard orderedExercises.indices.contains(index) else {
            return AppTheme.Colors.tertiaryText
        }

        if orderedExercises[index].status == "completed" {
            return AppTheme.Colors.orbSkyMid
        }

        return index == selectedIndex ? AppTheme.Colors.primaryText : AppTheme.Colors.tertiaryText
    }

    private func dotSize(for index: Int) -> CGFloat {
        let progress = min(abs(dragTranslation) / 90, 1)
        let incomingIndex = dragTranslation < 0 ? selectedIndex + 1 : selectedIndex - 1

        if index == selectedIndex {
            return 8.5 - (1.5 * progress)
        }

        if index == incomingIndex {
            return 5.5 + (2.5 * progress)
        }

        return 5.5
    }

    private func dotOpacity(for index: Int) -> Double {
        let progress = min(abs(dragTranslation) / 90, 1)
        let incomingIndex = dragTranslation < 0 ? selectedIndex + 1 : selectedIndex - 1

        if index == selectedIndex {
            return 1 - (0.28 * progress)
        }

        if index == incomingIndex {
            return 0.36 + (0.42 * progress)
        }

        return 0.34
    }

    private func ensureSelectedExercise(preferCurrent: Bool) {
        guard !orderedExercises.isEmpty else {
            selectedExerciseId = nil
            return
        }

        if preferCurrent, let currentExerciseIndex {
            selectedExerciseId = orderedExercises[currentExerciseIndex].workoutExerciseId
            return
        }

        if let selectedExerciseId,
           orderedExercises.contains(where: { $0.workoutExerciseId == selectedExerciseId }) {
            return
        }

        let fallbackIndex = currentExerciseIndex ?? 0
        selectedExerciseId = orderedExercises[fallbackIndex].workoutExerciseId
    }
}

/// Formats Pinned set target for display or logging.
private func formatPinnedSetTarget(_ target: WorkoutSetTarget) -> String {
    var parts: [String] = []

    if let reps = target.reps {
        parts.append("\(reps) reps")
    }

    if let durationSec = target.durationSec {
        parts.append("\(durationSec)s")
    }

    if let distanceM = target.distanceM {
        parts.append("\(distanceM)m")
    }

    if let rpe = target.rpe {
        parts.append("RPE \(String(format: "%.1f", rpe))")
    }

    if let load = target.load {
        if let unit = load.unit {
            parts.append("at \(Int(load.value.rounded())) \(unit)")
        } else {
            parts.append("at \(Int(load.value.rounded()))")
        }
    }

    return parts.joined(separator: " ")
}

private struct CoachPinnedFeedCard: View {
    let card: CoachCardPayload
    let onAction: (CoachCardAction) -> Void

    var body: some View {
        CoachStructuredCard(card: card, isPinned: true, onAction: onAction)
    }
}

private struct CoachAssistantTurnView: View {
    let text: String
    let trace: CoachRunTracePresentation?
    let isProvisional: Bool

    private var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var traceText: String {
        trace?.streamingText.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private var displayText: String {
        traceText.isEmpty ? trimmedText : traceText
    }

    private var shouldShowActivity: Bool {
        guard let trace else { return false }

        let hasActivityText = !trace.commentaryText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        if !displayText.isEmpty {
            return trace.errorMessage != nil || (!trace.isStreaming && hasActivityText)
        }

        return trace.isStreaming || hasActivityText || trace.errorMessage != nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if shouldShowActivity, let trace {
                CoachRunTraceView(
                    trace: trace,
                    showsArchivedStreamingText: false,
                    keepsStreamingTextVisible: false
                )
            }

            if !displayText.isEmpty {
                if trace != nil {
                    SmoothStreamingText(
                        text: displayText,
                        foregroundColor: AppTheme.Colors.primaryText,
                        isProvisional: isProvisional
                    )
                } else {
                    CoachMessageText(
                        text: displayText,
                        rendersMarkdown: true,
                        foregroundColor: AppTheme.Colors.primaryText,
                        isProvisional: isProvisional
                    )
                }
            }
        }
    }
}

private struct CoachRunTraceView: View {
    let trace: CoachRunTracePresentation
    var showsArchivedStreamingText = true
    var keepsStreamingTextVisible = false

    @State private var isExpanded = false
    @State private var now = Date()

    private let liveTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if trace.isStreaming || (keepsStreamingTextVisible && !streamingText.isEmpty) {
                liveTraceBody
            } else {
                archivedTraceBody
            }
        }
        .onReceive(liveTimer) { value in
            guard trace.isStreaming else { return }
            now = value
        }
    }

    private var liveTraceBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !streamingText.isEmpty {
                SmoothStreamingText(
                    text: streamingText,
                    foregroundColor: AppTheme.Colors.primaryText,
                    isProvisional: true
                )
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else if activityLines.isEmpty {
                HStack(spacing: 12) {
                    LiquidThinkingOrb(size: 28)

                    if let elapsedLabel {
                        Text(elapsedLabel)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.tertiaryText)
                            .monospacedDigit()
                    }
                }
                .padding(.vertical, 4)
            } else {
                HStack(alignment: .center, spacing: 10) {
                    LiquidThinkingOrb(size: 18)

                    Text(latestActivityLine)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.secondaryText)
                        .lineLimit(1)
                        .shimmer(duration: 1.35)

                    Spacer(minLength: 0)

                    if let elapsedLabel {
                        Text(elapsedLabel)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.tertiaryText)
                            .monospacedDigit()
                        }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            if let errorMessage = trace.errorMessage, !errorMessage.isEmpty {
                Text(errorMessage)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.trailing, 42)
        .animation(AppTheme.Animation.slow, value: activityLines)
        .animation(AppTheme.Animation.slow, value: streamingText.isEmpty)
    }

    private var archivedTraceBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: {
                withAnimation(AppTheme.Animation.gentle) {
                    isExpanded.toggle()
                }
            }) {
                HStack(alignment: .center, spacing: 10) {
                    Text("Show activity")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.secondaryText)

                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.tertiaryText)

                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(PressableScaleButtonStyle())

            if isExpanded {
                VStack(alignment: .leading, spacing: 10) {
                    if !activityLines.isEmpty {
                        ForEach(Array(activityLines.enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(.system(size: 14, weight: .regular))
                                .foregroundStyle(AppTheme.Colors.secondaryText)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    if showsArchivedStreamingText && !streamingText.isEmpty {
                        CoachMarkdownText(
                            text: streamingText,
                            foregroundColor: AppTheme.Colors.primaryText,
                            isProvisional: true
                        )
                    }

                    if let errorMessage = trace.errorMessage, !errorMessage.isEmpty {
                        Text(errorMessage)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.danger)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .padding(.top, 2)
        .padding(.trailing, 42)
    }

    private var elapsedLabel: String? {
        guard let startedAt = trace.startedAt else { return nil }
        let elapsedSeconds = max(0, Int(now.timeIntervalSince(startedAt)))
        return "\(elapsedSeconds)s"
    }

    private var activityLines: [String] {
        trace.commentaryText
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private var streamingText: String {
        trace.streamingText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var latestActivityLine: String {
        activityLines.last ?? (streamingText.isEmpty ? "Working" : "Composing response")
    }
}

private struct LiquidThinkingOrb: View {
    let size: CGFloat

    @State private var isPulsing = false

    var body: some View {
        ZStack {
            Circle()
                .fill(AppTheme.Gradients.orb)
                .frame(width: size, height: size)
                .scaleEffect(isPulsing ? 1.12 : 0.82)
                .shadow(color: AppTheme.Colors.orbSkyDeep.opacity(0.22), radius: size * 0.46, y: size * 0.22)

            Circle()
                .fill(.ultraThinMaterial.opacity(0.24))
                .frame(width: size, height: size)
                .scaleEffect(isPulsing ? 0.92 : 1.04)

            Circle()
                .stroke(Color.white.opacity(0.74), lineWidth: 1)
                .frame(width: size, height: size)
        }
        .frame(width: size * 1.32, height: size * 1.32)
        .onAppear {
            withAnimation(.easeInOut(duration: 0.82).repeatForever(autoreverses: true)) {
                isPulsing = true
            }
        }
        .accessibilityLabel("Working")
    }
}

private struct SmoothStreamingText: View {
    let text: String
    let foregroundColor: Color
    let isProvisional: Bool

    @State private var visibleText = ""
    @State private var revealTask: Task<Void, Never>?

    var body: some View {
        CoachMarkdownText(
            text: visibleText,
            foregroundColor: foregroundColor,
            isProvisional: isProvisional
        )
            .contentTransition(.opacity)
            .onAppear {
                reveal(to: text)
            }
            .onChange(of: text) { _, newText in
                reveal(to: newText)
            }
            .onDisappear {
                revealTask?.cancel()
            }
    }

    private func reveal(to target: String) {
        revealTask?.cancel()

        if target.isEmpty {
            visibleText = ""
            return
        }

        if visibleText == target {
            return
        }

        if !target.hasPrefix(visibleText) {
            visibleText = String(target.commonPrefix(with: visibleText))
        }

        guard visibleText.count < target.count else { return }

        revealTask = Task { @MainActor in
            var rendered = visibleText
            var cursor = target.index(target.startIndex, offsetBy: rendered.count)

            while cursor < target.endIndex {
                guard !Task.isCancelled else { return }

                let nextCursor = target.index(
                    cursor,
                    offsetBy: 3,
                    limitedBy: target.endIndex
                ) ?? target.endIndex

                rendered.append(contentsOf: target[cursor..<nextCursor])
                visibleText = rendered
                cursor = nextCursor

                try? await Task.sleep(nanoseconds: 26_000_000)
            }
        }
    }
}

private struct CoachStructuredCard: View {
    let card: CoachCardPayload
    let isPinned: Bool
    let onAction: (CoachCardAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(card.title)
                        .font(.system(size: isPinned ? 19 : 16, weight: .semibold, design: .rounded))
                        .foregroundStyle(AppTheme.Colors.primaryText)

                    if let subtitle = card.subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(AppTheme.Colors.secondaryText)
                    }
                }

                Spacer(minLength: 0)

                if let progressLabel = card.progressLabel, !progressLabel.isEmpty {
                    Text(progressLabel)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule(style: .continuous)
                                .fill(AppTheme.Colors.surfaceHover)
                        )
                }
            }

            if card.type == "workout_current" {
                workoutCurrentBody
            } else if card.type == "workout_summary" {
                workoutSummaryBody
            } else {
                insightBody
            }

            if !card.metrics.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(card.metrics) { metric in
                            CoachMetricChipView(metric: metric)
                        }
                    }
                }
            }

            if !card.actions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(card.actions) { action in
                            CoachCardActionButton(action: action) {
                                onAction(action)
                            }
                        }
                    }
                }
            }
        }
        .padding(isPinned ? 16 : 14)
        .liquidGlassBackground(cornerRadius: isPinned ? 24 : 20, shadowOpacity: isPinned ? 0.045 : 0.025)
    }

    @ViewBuilder
    private var workoutCurrentBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let currentExerciseName = card.currentExerciseName, !currentExerciseName.isEmpty {
                Text(currentExerciseName)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)
            }

            if let currentSetLabel = card.currentSetLabel, !currentSetLabel.isEmpty {
                Text(currentSetLabel)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
            }

            if let coachCue = card.coachCue, !coachCue.isEmpty {
                Text(coachCue)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private var workoutSummaryBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let highlights = card.highlights, !highlights.isEmpty {
                ForEach(highlights, id: \.self) { highlight in
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(AppTheme.Colors.primaryText)
                            .frame(width: 7, height: 7)
                            .padding(.top, 6)

                        Text(highlight)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(AppTheme.Colors.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else if let body = card.body, !body.isEmpty {
                Text(body)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private var insightBody: some View {
        if let body = card.body, !body.isEmpty {
            Text(body)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text(card.title)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct CoachMetricChipView: View {
    let metric: CoachMetricChip

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(metric.label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(AppTheme.Colors.tertiaryText)

            Text(metric.value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(foregroundColor)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .liquidGlassBackground(cornerRadius: 18, shadowOpacity: 0.03)
    }

    private var foregroundColor: Color {
        switch metric.tone {
        case "success":
            return Color(red: 0.18, green: 0.53, blue: 0.29)
        case "warning":
            return Color(red: 0.71, green: 0.42, blue: 0.11)
        default:
            return AppTheme.Colors.primaryText
        }
    }
}

private struct CoachCardActionButton: View {
    let action: CoachCardAction
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 8) {
                if let icon = action.icon, !icon.isEmpty {
                    Image(systemName: icon)
                }

                Text(action.label)
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(foregroundColor)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(backgroundBody)
        }
        .buttonStyle(PressableScaleButtonStyle())
    }

    @ViewBuilder
    private var backgroundBody: some View {
        switch action.style {
        case "primary":
            Capsule(style: .continuous)
                .fill(AppTheme.Colors.primaryText)
        case "destructive":
            Capsule(style: .continuous)
                .fill(Color(red: 0.69, green: 0.2, blue: 0.21))
        default:
            Capsule(style: .continuous)
                .fill(Color.clear)
                .liquidGlassCapsule(shadowOpacity: 0.04)
        }
    }

    private var foregroundColor: Color {
        action.style == "primary" || action.style == "destructive"
            ? AppTheme.Colors.background
            : AppTheme.Colors.primaryText
    }
}

private struct CoachMessageText: View {
    let text: String
    let rendersMarkdown: Bool
    let foregroundColor: Color
    let isProvisional: Bool

    var body: some View {
        if rendersMarkdown {
            CoachMarkdownText(
                text: text,
                foregroundColor: foregroundColor,
                isProvisional: isProvisional
            )
        } else {
            Text(text)
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(foregroundColor)
                .lineSpacing(4)
                .opacity(isProvisional ? 0.96 : 1)
                .fixedSize(horizontal: false, vertical: true)
                .contentTransition(.opacity)
                .animation(AppTheme.Animation.gentle, value: text)
        }
    }
}

private struct CoachMarkdownText: View {
    let text: String
    let foregroundColor: Color
    let isProvisional: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .paragraph(let value):
                    Text(parsedInline(value))
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(foregroundColor)
                        .tint(AppTheme.Colors.orbSkyDeep)
                        .lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)

                case .bullet(let value):
                    HStack(alignment: .top, spacing: 10) {
                        Text("•")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.tertiaryText)
                            .padding(.top, 1)

                        Text(parsedInline(value))
                            .font(.system(size: 17, weight: .regular))
                            .foregroundStyle(foregroundColor)
                            .tint(AppTheme.Colors.orbSkyDeep)
                            .lineSpacing(5)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                case .numbered(let marker, let value):
                    HStack(alignment: .top, spacing: 10) {
                        Text(marker)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.tertiaryText)
                            .frame(minWidth: 22, alignment: .trailing)
                            .padding(.top, 2)

                        Text(parsedInline(value))
                            .font(.system(size: 17, weight: .regular))
                            .foregroundStyle(foregroundColor)
                            .tint(AppTheme.Colors.orbSkyDeep)
                            .lineSpacing(5)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                case .code(let value):
                    Text(value)
                        .font(.system(size: 14, weight: .regular, design: .monospaced))
                        .foregroundStyle(foregroundColor)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .liquidGlassBackground(cornerRadius: 14, shadowOpacity: 0.02)
                }
            }
        }
        .opacity(isProvisional ? 0.96 : 1)
        .contentTransition(.opacity)
        .animation(AppTheme.Animation.gentle, value: text)
    }

    private var blocks: [CoachMarkdownBlock] {
        parseCoachMarkdownBlocks(text)
    }

    private func parsedInline(_ value: String) -> AttributedString {
        let source = isProvisional
            ? balanceStreamingInlineMarkdown(value)
            : value

        if let parsed = try? AttributedString(
            markdown: source,
            options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) {
            return parsed
        }

        return AttributedString(value)
    }
}

private func balanceStreamingInlineMarkdown(_ value: String) -> String {
    var balanced = value

    if countNonOverlappingOccurrences(of: "**", in: balanced).isMultiple(of: 2) == false {
        balanced += "**"
    }

    if countNonOverlappingOccurrences(of: "__", in: balanced).isMultiple(of: 2) == false {
        balanced += "__"
    }

    if balanced.filter({ $0 == "`" }).count.isMultiple(of: 2) == false {
        balanced += "`"
    }

    return balanced
}

private func countNonOverlappingOccurrences(of needle: String, in value: String) -> Int {
    guard !needle.isEmpty else { return 0 }

    var count = 0
    var searchStart = value.startIndex

    while searchStart < value.endIndex,
          let range = value.range(of: needle, range: searchStart..<value.endIndex) {
        count += 1
        searchStart = range.upperBound
    }

    return count
}

private enum CoachMarkdownBlock {
    case paragraph(String)
    case bullet(String)
    case numbered(String, String)
    case code(String)
}

/// Parses a small, chat-oriented Markdown subset into blocks with better spacing.
private func parseCoachMarkdownBlocks(_ text: String) -> [CoachMarkdownBlock] {
    var blocks: [CoachMarkdownBlock] = []
    var paragraphLines: [String] = []
    var codeLines: [String] = []
    var isInsideCodeBlock = false

    func flushParagraph() {
        let paragraph = paragraphLines
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if !paragraph.isEmpty {
            blocks.append(.paragraph(paragraph))
        }

        paragraphLines.removeAll()
    }

    func flushCode() {
        let code = codeLines.joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if !code.isEmpty {
            blocks.append(.code(code))
        }

        codeLines.removeAll()
    }

    for line in text.components(separatedBy: .newlines) {
        let trimmed = line.trimmingCharacters(in: .whitespaces)

        if trimmed.hasPrefix("```") {
            if isInsideCodeBlock {
                flushCode()
                isInsideCodeBlock = false
            } else {
                flushParagraph()
                isInsideCodeBlock = true
            }
            continue
        }

        if isInsideCodeBlock {
            codeLines.append(line)
            continue
        }

        if trimmed.isEmpty {
            flushParagraph()
            continue
        }

        if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
            flushParagraph()
            blocks.append(.bullet(String(trimmed.dropFirst(2))))
            continue
        }

        if let numberedItem = parseNumberedMarkdownLine(trimmed) {
            flushParagraph()
            blocks.append(.numbered(numberedItem.marker, numberedItem.text))
            continue
        }

        paragraphLines.append(line)
    }

    if isInsideCodeBlock {
        flushCode()
    }
    flushParagraph()

    return blocks.isEmpty ? [.paragraph(text)] : blocks
}

/// Parses a basic "1. item" Markdown line.
private func parseNumberedMarkdownLine(_ line: String) -> (marker: String, text: String)? {
    guard let dotIndex = line.firstIndex(of: ".") else {
        return nil
    }

    let numberPart = String(line[..<dotIndex])
    guard !numberPart.isEmpty,
          numberPart.allSatisfy({ $0.isNumber }) else {
        return nil
    }

    let afterDot = line.index(after: dotIndex)
    guard afterDot < line.endIndex,
          line[afterDot].isWhitespace else {
        return nil
    }

    let textStart = line.index(after: afterDot)
    guard textStart <= line.endIndex else {
        return nil
    }

    return ("\(numberPart).", String(line[textStart...]))
}

private struct QuickActionTray: View {
    let actions: [CoachQuickAction]
    let onTap: (CoachQuickAction) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(actions) { action in
                    Button(action: { onTap(action) }) {
                        HStack(spacing: 8) {
                            Image(systemName: action.icon)
                                .font(.system(size: 13, weight: .semibold))
                            Text(action.label)
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .liquidGlassCapsule()
                    }
                    .buttonStyle(PressableScaleButtonStyle())
                }
            }
        }
    }
}


private struct ComposerDock: View {
    @Binding var text: String
    let isSending: Bool
    let placeholder: String
    @ObservedObject var speechManager: SpeechManager
    @FocusState.Binding var isFocused: Bool
    let isExpanded: Bool
    let onPlusTap: () -> Void
    let onSend: () -> Void
    let onMicrophoneTap: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            plusButton
                .frame(width: 30, height: 34)

            TextField(speechManager.isListening ? "Listening..." : placeholder, text: $text, axis: .vertical)
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(Color.white)
                .tint(Color.white)
                .lineLimit(isExpanded ? 5 : 1)
                .focused($isFocused)
                .disabled(speechManager.isListening)
                .padding(.vertical, isExpanded ? 7 : 0)
                .frame(maxWidth: .infinity, minHeight: 36, alignment: .center)

            Button(action: onMicrophoneTap) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Color(white: 0.6))
                    .frame(width: 26, height: 34)
            }
            .buttonStyle(PressableScaleButtonStyle())

            Button(action: primaryAction) {
                ZStack {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 34, height: 34)

                    primaryButtonIcon
                }
            }
            .buttonStyle(PressableScaleButtonStyle())
            .disabled(isSending || !sendEnabled)
        }
        .padding(.leading, 14)
        .padding(.trailing, 7)
        .padding(.vertical, isExpanded ? 4 : 3)
        .frame(maxWidth: 680)
        .frame(minHeight: isExpanded ? 48 : 46)
        .background(composerBackground(cornerRadius: isExpanded ? 24 : 23))
        .shadow(color: Color.black.opacity(0.34), radius: 15, y: 7)
        .contentShape(RoundedRectangle(cornerRadius: isExpanded ? 24 : 23, style: .continuous))
        .onTapGesture {
            guard !speechManager.isListening else { return }
            isFocused = true
        }
        .animation(AppTheme.Animation.gentle, value: sendEnabled)
        .animation(AppTheme.Animation.gentle, value: speechManager.isListening)
        .animation(.spring(response: 0.28, dampingFraction: 0.86), value: isExpanded)
    }

    private var sendEnabled: Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false && !isSending
    }

    private func primaryAction() {
        if sendEnabled {
            onSend()
        }
    }

    private var plusButton: some View {
        Button(action: onPlusTap) {
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .regular))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .buttonStyle(PressableScaleButtonStyle())
    }

    private func composerBackground(cornerRadius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color(red: 0.09, green: 0.09, blue: 0.09).opacity(0.96))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.18), lineWidth: 1)
            }
    }

    @ViewBuilder
    private var primaryButtonIcon: some View {
        if isSending {
            ProgressView()
                .controlSize(.small)
                .tint(Color.black)
        } else if sendEnabled {
            Image(systemName: "arrow.up")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Color.black)
        } else {
            StaticVoiceWaveformIcon(color: Color.black)
                .frame(width: 17, height: 14)
        }
    }
}

private struct StaticVoiceWaveformIcon: View {
    let color: Color

    private let heights: [CGFloat] = [6, 10, 14, 9, 7]

    var body: some View {
        HStack(alignment: .center, spacing: 2) {
            ForEach(Array(heights.enumerated()), id: \.offset) { _, height in
                Capsule(style: .continuous)
                    .fill(color)
                    .frame(width: 2.5, height: height)
            }
        }
    }
}

private struct LiquidGlassBackgroundModifier: ViewModifier {
    let cornerRadius: CGFloat
    let shadowOpacity: Double

    /// Builds and returns the SwiftUI view hierarchy for this type.
    @ViewBuilder
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        if #available(iOS 26.0, *) {
            content
                .contentShape(shape)
                .glassEffect(.regular.tint(AppTheme.Colors.glassFill).interactive(), in: shape)
                .liquidGlassDefinition(shape: shape, shadowOpacity: shadowOpacity)
        } else {
            content
                .contentShape(shape)
                .background {
                    shape
                        .fill(.ultraThinMaterial)
                        .overlay {
                            shape.fill(AppTheme.Colors.glassFill.opacity(0.92))
                        }
                }
                .liquidGlassDefinition(shape: shape, shadowOpacity: shadowOpacity)
        }
    }
}

private struct PressableScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.84 : 1)
            .animation(.spring(response: 0.22, dampingFraction: 0.78), value: configuration.isPressed)
    }
}

private struct LiquidGlassCapsuleModifier: ViewModifier {
    let shadowOpacity: Double

    /// Builds and returns the SwiftUI view hierarchy for this type.
    @ViewBuilder
    func body(content: Content) -> some View {
        let shape = Capsule(style: .continuous)

        if #available(iOS 26.0, *) {
            content
                .contentShape(shape)
                .glassEffect(.regular.tint(AppTheme.Colors.glassFill).interactive(), in: shape)
                .liquidGlassDefinition(shape: shape, shadowOpacity: shadowOpacity)
        } else {
            content
                .contentShape(shape)
                .background {
                    shape
                        .fill(.ultraThinMaterial)
                        .overlay {
                            shape.fill(AppTheme.Colors.glassFill.opacity(0.92))
                        }
                }
                .liquidGlassDefinition(shape: shape, shadowOpacity: shadowOpacity)
        }
    }
}

private struct LiquidGlassDefinitionModifier<S: InsettableShape>: ViewModifier {
    let shape: S
    let shadowOpacity: Double

    func body(content: Content) -> some View {
        content
            .overlay {
                shape
                    .stroke(Color.white.opacity(0.13), lineWidth: 1)
                    .allowsHitTesting(false)
            }
            .overlay(alignment: .topLeading) {
                shape
                    .inset(by: 1)
                    .stroke(Color.white.opacity(0.07), lineWidth: 0.5)
                    .allowsHitTesting(false)
            }
            .shadow(color: AppTheme.Colors.floatingShadow.opacity(shadowOpacity), radius: 18, y: 8)
    }
}

private extension View {
    /// Adds edge highlights and shadow that preserve the shape of floating glass controls.
    func liquidGlassDefinition<S: InsettableShape>(shape: S, shadowOpacity: Double) -> some View {
        modifier(LiquidGlassDefinitionModifier(shape: shape, shadowOpacity: shadowOpacity))
    }

    /// Handles Liquid glass background for AppView.swift.
    func liquidGlassBackground(cornerRadius: CGFloat, shadowOpacity: Double = 0.08) -> some View {
        modifier(LiquidGlassBackgroundModifier(cornerRadius: cornerRadius, shadowOpacity: shadowOpacity))
    }

    /// Handles Liquid glass capsule for AppView.swift.
    func liquidGlassCapsule(shadowOpacity: Double = 0.06) -> some View {
        modifier(LiquidGlassCapsuleModifier(shadowOpacity: shadowOpacity))
    }
}

private struct SignedOutCoachView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("A calmer coach surface")
                        .font(.system(size: 38, weight: .bold, design: .rounded))
                        .foregroundStyle(AppTheme.Colors.primaryText)

                    Text("One feed. One input dock. Structured cards only when they matter. Sign in to talk to the trainer through the new backend-driven runtime.")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("What this build already supports")
                        .font(AppTheme.Typography.cardTitle)
                        .foregroundStyle(AppTheme.Colors.primaryText)

                    FeatureLine(text: "Authenticated message send through the API gateway.")
                    FeatureLine(text: "A single coach surface backed by one aggregated payload.")
                    FeatureLine(text: "Live SSE run streaming when the coach is responding.")
                }
                .padding(22)
                .background(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .fill(AppTheme.Colors.surface)
                )

                AuthView()
                    .padding(22)
                    .background(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .fill(AppTheme.Colors.surface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .stroke(AppTheme.Colors.divider, lineWidth: 1)
                    )
            }
            .padding(22)
        }
        .scrollIndicators(.hidden)
    }
}
