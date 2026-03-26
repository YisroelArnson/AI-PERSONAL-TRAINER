import SwiftUI
import Supabase

struct AppView: View {
    @StateObject private var sessionController = AppSessionController()
    @StateObject private var viewModel = CoachSurfaceViewModel()
    @StateObject private var speechManager = SpeechManager()

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
                .frame(width: 320, height: 320)
                .blur(radius: 40)
                .offset(x: -130, y: -280)

            RoundedRectangle(cornerRadius: 120, style: .continuous)
                .fill(AppTheme.Colors.highlight)
                .frame(width: 280, height: 220)
                .blur(radius: 40)
                .offset(x: 120, y: 260)
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

    func signOut() async {
        do {
            try await supabase.auth.signOut()
            Haptic.selection()
        } catch {
            Haptic.error()
        }
    }
}

enum CoachRunTraceStepKind {
    case tool
    case error
}

struct CoachRunTraceStep: Identifiable {
    let id: String
    let kind: CoachRunTraceStepKind
    var title: String
    var detail: String?
    var status: String?
}

struct CoachRunTracePresentation {
    let runId: String
    let isStreaming: Bool
    let headline: String
    let detail: String?
    let startedAt: Date?
    let steps: [CoachRunTraceStep]
}

private struct CoachRunTraceState {
    let runId: String
    var isStreaming = true
    var startedAt: Date?
    var currentIteration: Int?
    var currentToolLabel: String?
    var currentToolStatus: String?
    var steps: [CoachRunTraceStep] = []
    var nextStepIndex = 0

    var hasVisibleContent: Bool {
        isStreaming
            || currentToolLabel != nil
            || !steps.isEmpty
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
}

@MainActor
final class CoachSurfaceViewModel: ObservableObject {
    @Published var surface: CoachSurfaceResponse?
    @Published var composerText = ""
    @Published var isLoading = false
    @Published var isSending = false
    @Published var isResettingSession = false
    @Published var isQuickActionsExpanded = false
    @Published var errorMessage: String?
    @Published var toast: ToastData?
    @Published private var runTraces: [String: CoachRunTraceState] = [:]

    private var activeUserID: UUID?
    private var pollTask: Task<Void, Never>?
    private var streamTask: Task<Void, Never>?
    private var didTriggerAppOpenThisLaunch = false
    private var observedRunID: String?
    private var observedStreamPath: String?
    private var lastStreamEventID: String?
    private var runTraceOrder: [String] = []

    var feedItems: [CoachRenderedFeedItem] {
        var items = (surface?.feed ?? []).map { item in
            CoachRenderedFeedItem(
                id: stableFeedItemID(for: item),
                kind: item.kind,
                role: item.role,
                text: item.text,
                card: item.card,
                trace: nil,
                runId: item.runId,
                badgeLabel: item.role == "assistant" ? "Coach" : "You",
                isAssistant: item.role == "assistant"
            )
        }

        for runID in runTraceOrder {
            guard let traceItem = makeRunTraceItem(runID: runID) else {
                continue
            }

            if let existingIndex = items.lastIndex(where: { $0.runId == runID && $0.kind != "run_trace" }) {
                items.insert(traceItem, at: existingIndex)
            } else {
                items.append(traceItem)
            }
        }

        return items
    }

    var quickActions: [CoachQuickAction] {
        surface?.quickActions ?? []
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

    var pinnedFeedItem: CoachRenderedFeedItem? {
        guard let pinnedFeedItemID = surface?.pinnedCard?.feedItemId else {
            return nil
        }

        return feedItems.first(where: { $0.id == pinnedFeedItemID })
    }

    var composerPlaceholder: String {
        surface?.composer.placeholder ?? "Message your coach"
    }

    var scrollToken: String {
        let feedToken = visibleFeedItems.map(\.id).joined(separator: "|")
        let runToken = [activeRun?.runId ?? "", activeRun?.status ?? ""].joined(separator: "|")
        let traceToken = runTraceOrder.compactMap { runID -> String? in
            guard let trace = runTraces[runID] else { return nil }

            let stepToken = trace.steps.map { step in
                [step.id, step.title, step.detail ?? ""].joined(separator: "~")
            }.joined(separator: ",")

            return [
                runID,
                trace.isStreaming ? "1" : "0",
                trace.startedAt?.ISO8601Format() ?? "",
                trace.currentToolLabel ?? "",
                trace.currentToolStatus ?? "",
                stepToken
            ].joined(separator: "|")
        }.joined(separator: "::")

        return [feedToken, runToken, traceToken].joined(separator: "::")
    }

    func reset() {
        activeUserID = nil
        surface = nil
        composerText = ""
        isLoading = false
        isSending = false
        isResettingSession = false
        isQuickActionsExpanded = false
        errorMessage = nil
        toast = nil
        didTriggerAppOpenThisLaunch = false
        runTraces = [:]
        runTraceOrder = []
        pollTask?.cancel()
        pollTask = nil
        cancelRunObservation(resetStreamState: true)
    }

    private func stableFeedItemID(for item: CoachFeedItem) -> String {
        guard item.kind == "message", item.role == "assistant", let itemRunID = item.runId else {
            return item.id
        }

        return "run:\(itemRunID)"
    }

    private func ensureRunTrace(for runID: String) {
        if runTraces[runID] == nil {
            runTraces[runID] = CoachRunTraceState(runId: runID)
        }

        if !runTraceOrder.contains(runID) {
            runTraceOrder.append(runID)
        }
    }

    private func updateRunTrace(_ runID: String, mutate: (inout CoachRunTraceState) -> Void) {
        ensureRunTrace(for: runID)

        guard var trace = runTraces[runID] else { return }
        mutate(&trace)
        runTraces[runID] = trace
    }

    private func appendTraceStep(
        runID: String,
        kind: CoachRunTraceStepKind,
        title: String,
        detail: String? = nil,
        status: String? = nil
    ) {
        updateRunTrace(runID) { trace in
            trace.nextStepIndex += 1
            trace.steps.append(
                CoachRunTraceStep(
                    id: "\(runID):\(trace.nextStepIndex)",
                    kind: kind,
                    title: title,
                    detail: detail,
                    status: status
                )
            )
        }
    }

    private func markLatestToolStepCompleted(
        runID: String,
        toolName: String?,
        resultStatus: String?
    ) {
        let completedTitle = toolTraceTitle(toolName: toolName, status: "completed")

        updateRunTrace(runID) { trace in
            guard let matchIndex = trace.steps.indices.reversed().first(where: { index in
                let step = trace.steps[index]
                return step.kind == .tool
                    && step.status != "completed"
                    && step.title == completedTitle
            }) else {
                return
            }

            trace.steps[matchIndex].status = "completed"

            if let resultStatus, !resultStatus.isEmpty, resultStatus != "success" {
                trace.steps[matchIndex].detail = resultStatus
                    .replacingOccurrences(of: "_", with: " ")
                    .capitalized
            }
        }
    }

    private func toolTraceTitle(toolName: String?, status: String?) -> String {
        if status == "detected" {
            return "Thinking"
        }

        switch toolName {
        case "memory_search":
            return "Searching past notes"
        case "memory_get":
            return "Checking saved memory"
        case "program_get":
            return "Reviewing program"
        case "document_replace_text", "document_replace_entire":
            return "Updating notes"
        case "episodic_note_append":
            return "Saving note"
        case "coach_soul_get", "coach_soul_replace_entire":
            return "Checking coach settings"
        case let name?:
            return name
                .replacingOccurrences(of: "_", with: " ")
                .capitalized
        default:
            return status == "completed" ? "Tool finished" : "Using a tool"
        }
    }

    private func makeRunTraceItem(runID: String) -> CoachRenderedFeedItem? {
        guard let trace = tracePresentation(for: runID) else {
            return nil
        }

        return CoachRenderedFeedItem(
            id: "trace:\(runID)",
            kind: "run_trace",
            role: "assistant",
            text: "",
            card: nil,
            trace: trace,
            runId: runID,
            badgeLabel: "Coach",
            isAssistant: true
        )
    }

    private func tracePresentation(for runID: String) -> CoachRunTracePresentation? {
        guard let trace = runTraces[runID], trace.hasVisibleContent else {
            return nil
        }
        let toolSteps = trace.steps.filter { $0.kind == .tool }

        if trace.isStreaming {
            return CoachRunTracePresentation(
                runId: runID,
                isStreaming: true,
                headline: trace.currentToolLabel ?? "Thinking",
                detail: nil,
                startedAt: trace.startedAt,
                steps: trace.steps
            )
        }
        let detail: String? = {
            guard !toolSteps.isEmpty else { return nil }
            return toolSteps.count == 1 ? "1 action" : "\(toolSteps.count) actions"
        }()

        return CoachRunTracePresentation(
            runId: runID,
            isStreaming: false,
            headline: "Thoughts",
            detail: detail,
            startedAt: trace.startedAt,
            steps: trace.steps
        )
    }

    func activate(session: Session) async {
        if activeUserID != session.user.id {
            activeUserID = session.user.id
            surface = nil
            composerText = ""
            errorMessage = nil
            isResettingSession = false
            didTriggerAppOpenThisLaunch = false
            runTraces = [:]
            runTraceOrder = []
            pollTask?.cancel()
            pollTask = nil
            cancelRunObservation(resetStreamState: true)
        }

        await refreshSurface(allowAppOpenTrigger: true)
    }

    func manualRefresh() async {
        await refreshSurface(allowAppOpenTrigger: false)
    }

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

            cancelRunObservation(resetStreamState: true)
            composerText = ""
            errorMessage = nil
            didTriggerAppOpenThisLaunch = true
            toast = ToastData(message: "Started a fresh chat.", icon: "square.and.pencil")
            Haptic.medium()

            await refreshSurface(
                allowAppOpenTrigger: false,
                sessionKeyOverride: resetResult.sessionKey
            )
        } catch {
            showError(error.localizedDescription)
        }

        isResettingSession = false
    }

    func submitComposer() async {
        let trimmed = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let didSend = await submitMessage(
            message: trimmed,
            triggerType: .userMessage,
            metadata: MessageMetadata(source: "ios_coach_surface")
        )

        if didSend {
            composerText = ""
        }
    }

    func runQuickAction(_ action: CoachQuickAction) async {
        isQuickActionsExpanded = false
        _ = await submitMessage(
            message: action.message,
            triggerType: action.triggerType,
            metadata: MessageMetadata(source: "ios_quick_action", actionId: action.id)
        )
    }

    private func shouldUseDirectCompleteSetAction(_ action: CoachCardAction) -> Bool {
        action.actionType == "complete_current_set" ||
        action.semanticAction == "workout_complete_set" ||
        action.triggerType == CoachTriggerType.completeSet.rawValue ||
        action.id == "complete_set"
    }

    func runCardAction(_ action: CoachCardAction) async {
        if shouldUseDirectCompleteSetAction(action) {
            guard let workoutSessionId = surface?.workout?.workoutSessionId else {
                toast = ToastData(message: "There is no live workout set to complete right now.", icon: "hand.raised.fill")
                return
            }

            do {
                isSending = true
                let accessToken = try await freshAccessToken()
                let response = try await APIService.shared.completeCurrentSet(
                    accessToken: accessToken,
                    requestBody: CompleteCurrentSetRequest(
                        sessionKey: surface?.sessionKey,
                        workoutSessionId: workoutSessionId,
                        actual: nil,
                        userNote: nil
                    ),
                    idempotencyKey: UUID().uuidString.lowercased()
                )

                surface = response.surface
                errorMessage = nil
                Haptic.medium()

                if response.agentFollowUp.status == "queued",
                   let runID = response.agentFollowUp.runId {
                    startRunObservation(
                        runID: runID,
                        streamPath: response.agentFollowUp.streamUrl ?? "/v1/runs/\(runID)/stream"
                    )
                }

                isSending = false
                return
            } catch {
                showError(error.localizedDescription)
                isSending = false
                return
            }
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

    func mergeTranscript(_ transcript: String) {
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if composerText.isEmpty {
            composerText = trimmed
        } else {
            composerText = "\(composerText) \(trimmed)"
        }
    }

    func toggleQuickActions() {
        withAnimation(AppTheme.Animation.gentle) {
            isQuickActionsExpanded.toggle()
        }
    }

    func showError(_ message: String) {
        errorMessage = message
        toast = ToastData(message: message, icon: "exclamationmark.circle.fill")
        Haptic.error()
    }

    private func refreshSurface(
        allowAppOpenTrigger: Bool,
        sessionKeyOverride: String? = nil
    ) async {
        do {
            if surface == nil {
                isLoading = true
            }

            let accessToken = try await freshAccessToken()
            let latestSurface = try await APIService.shared.fetchCoachSurface(
                accessToken: accessToken,
                sessionKey: sessionKeyOverride ?? surface?.sessionKey
            )

            surface = latestSurface

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

            if allowAppOpenTrigger, shouldTriggerAppOpen(for: latestSurface) {
                didTriggerAppOpenThisLaunch = true
                _ = await submitMessage(
                    message: "app_opened",
                    triggerType: .appOpened,
                    metadata: MessageMetadata(hiddenInFeed: true, source: "ios_app_open")
                )
            }
        } catch {
            isLoading = false
            showError(error.localizedDescription)
        }
    }

    private func shouldTriggerAppOpen(for surface: CoachSurfaceResponse) -> Bool {
        guard !didTriggerAppOpenThisLaunch else { return false }
        return surface.sessionId == nil && surface.feed.isEmpty && surface.activeRun == nil
    }

    private func submitMessage(
        message: String,
        triggerType: CoachTriggerType,
        metadata: MessageMetadata?
    ) async -> Bool {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }

        do {
            isSending = true
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

            if accepted.replayed {
                toast = ToastData(message: "Recovered your existing run.", icon: "arrow.clockwise.circle.fill")
            }

            startRunObservation(
                runID: accepted.runId,
                streamPath: accepted.streamUrl ?? "/v1/runs/\(accepted.runId)/stream"
            )
            await refreshSurface(allowAppOpenTrigger: false)
            isSending = false
            return true
        } catch {
            showError(error.localizedDescription)
        }

        isSending = false
        return false
    }

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

    private func cancelRunObservation(resetStreamState: Bool) {
        streamTask?.cancel()
        streamTask = nil
        observedRunID = nil
        observedStreamPath = nil

        if resetStreamState {
            lastStreamEventID = nil
        }
    }

    private func handleRunStreamEvent(_ event: CoachRunStreamEvent, expectedRunID: String) {
        guard event.runId == expectedRunID else { return }
        ensureRunTrace(for: expectedRunID)

        if let eventID = event.eventId {
            lastStreamEventID = String(eventID)
        }

        switch event.type {
        case "assistant.delta":
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
            }
        case "tool.delta":
            if let iteration = event.iteration, runTraces[expectedRunID]?.currentIteration != iteration {
                updateRunTrace(expectedRunID) { trace in
                    trace.currentIteration = iteration
                    if trace.startedAt == nil {
                        trace.startedAt = Date()
                    }
                }
            }

            if event.status == "requested" {
                appendTraceStep(
                    runID: expectedRunID,
                    kind: .tool,
                    title: toolTraceTitle(toolName: event.toolName, status: event.status),
                    status: "requested"
                )
            } else if event.status == "completed" {
                markLatestToolStepCompleted(
                    runID: expectedRunID,
                    toolName: event.toolName,
                    resultStatus: event.resultStatus
                )
            }

            updateRunTrace(expectedRunID) { trace in
                trace.isStreaming = true
                if trace.startedAt == nil {
                    trace.startedAt = Date()
                }
                trace.currentToolLabel = toolTraceTitle(toolName: event.toolName, status: event.status)
                trace.currentToolStatus = event.status
            }
        case "run.failed":
            if let message = event.message, !message.isEmpty {
                appendTraceStep(
                    runID: expectedRunID,
                    kind: .error,
                    title: "Run failed",
                    detail: message
                )
            }

            updateRunTrace(expectedRunID) { trace in
                trace.isStreaming = false
                trace.currentToolLabel = nil
                trace.currentToolStatus = nil
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
                trace.currentToolLabel = nil
                trace.currentToolStatus = nil
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

    private func freshAccessToken() async throws -> String {
        let session = try await supabase.auth.session
        return session.accessToken
    }
}

private struct CoachSurfaceScreen: View {
    @ObservedObject var viewModel: CoachSurfaceViewModel
    @ObservedObject var speechManager: SpeechManager
    let userEmail: String?
    let onSignOut: () -> Void

    private let bottomAnchor = "coach-feed-bottom"

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    CoachSurfaceTopHeader(
                        subtitle: viewModel.surface?.header.subtitle ?? "One calm surface for training, planning, and check-ins",
                        userEmail: userEmail,
                        hasActiveRun: viewModel.activeRun != nil,
                        isResettingSession: viewModel.isResettingSession,
                        onResetSession: {
                            Task { await viewModel.resetSession() }
                        },
                        onRefresh: {
                            Task { await viewModel.manualRefresh() }
                        },
                        onSignOut: onSignOut
                    )

                    if let errorMessage = viewModel.errorMessage {
                        CoachStatusBanner(
                            title: "Connection needs attention",
                            message: errorMessage,
                            icon: "exclamationmark.triangle.fill"
                        )
                    }

                    if viewModel.isLoading && viewModel.visibleFeedItems.isEmpty {
                        CoachLoadingCard()
                    } else if viewModel.visibleFeedItems.isEmpty {
                        CoachEmptyStateCard(quickActions: viewModel.quickActions) { action in
                            Task { await viewModel.runQuickAction(action) }
                        }
                    }

                    LazyVStack(spacing: 14) {
                        ForEach(viewModel.visibleFeedItems) { item in
                            CoachFeedRow(item: item) { action in
                                Task { await viewModel.runCardAction(action) }
                            }
                        }
                    }

                    Color.clear
                        .frame(height: 1)
                        .id(bottomAnchor)
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .safeAreaInset(edge: .bottom, spacing: 12) {
                VStack(spacing: 12) {
                    if let pinnedFeedItem = viewModel.pinnedFeedItem,
                       let card = pinnedFeedItem.card {
                        CoachPinnedFeedCard(card: card) { action in
                            Task { await viewModel.runCardAction(action) }
                        }
                    }

                    if viewModel.isQuickActionsExpanded, !viewModel.quickActions.isEmpty {
                        QuickActionTray(actions: viewModel.quickActions) { action in
                            Task { await viewModel.runQuickAction(action) }
                        }
                    }

                    ComposerDock(
                        text: $viewModel.composerText,
                        isSending: viewModel.isSending,
                        placeholder: viewModel.composerPlaceholder,
                        speechManager: speechManager,
                        quickActionsExpanded: viewModel.isQuickActionsExpanded,
                        onToggleQuickActions: viewModel.toggleQuickActions,
                        onSend: {
                            Task { await viewModel.submitComposer() }
                        },
                        onMicrophoneTap: handleMicrophoneTap
                    )
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 10)
                .background(Color.clear)
            }
            .onChange(of: viewModel.scrollToken) { _, _ in
                withAnimation(AppTheme.Animation.slow) {
                    proxy.scrollTo(bottomAnchor, anchor: .bottom)
                }
            }
        }
    }

    private func handleMicrophoneTap() {
        if speechManager.isListening {
            let transcript = speechManager.finalTranscript.isEmpty
                ? speechManager.partialTranscript
                : speechManager.finalTranscript
            speechManager.stopListening()
            viewModel.mergeTranscript(transcript)
            Haptic.selection()
            return
        }

        Task {
            await speechManager.startListening()
            if speechManager.isListening {
                Haptic.light()
            }
        }
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
            Circle()
                .fill(AppTheme.Colors.surface)
                .frame(width: 42, height: 42)
                .overlay {
                    Image(systemName: icon)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.primaryText)
                }
        }
        .buttonStyle(.plain)
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
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.primaryText)

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
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(AppTheme.Colors.surface)
        )
    }
}

private struct CoachLoadingCard: View {
    var body: some View {
        HStack(spacing: 14) {
            ProgressView()
                .controlSize(.small)

            Text("Loading the latest coach thread from the backend...")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryText)

            Spacer()
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(AppTheme.Colors.surface)
        )
    }
}

private struct CoachEmptyStateCard: View {
    let quickActions: [CoachQuickAction]
    let onAction: (CoachQuickAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Your coach surface is ready")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(AppTheme.Colors.primaryText)

            Text("This screen is the whole product surface from the spec: one feed, one dock, and structured cards when they matter.")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 10) {
                FeatureLine(text: "Talk naturally by voice or text.")
                FeatureLine(text: "Start a workout without leaving the thread.")
                FeatureLine(text: "See the current workout card pinned above the dock when it becomes relevant.")
            }

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
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .background(
                                    Capsule(style: .continuous)
                                        .fill(AppTheme.Colors.background)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
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
        HStack {
            if isAssistant {
                content
                Spacer(minLength: 42)
            } else {
                Spacer(minLength: 42)
                content
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if item.kind == "run_trace", let trace = item.trace {
            CoachRunTraceView(trace: trace)
        } else if item.kind == "card", let card = item.card {
            CoachStructuredCard(card: card, isPinned: false, onAction: onCardAction)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                CoachMessageText(
                    text: item.text,
                    rendersMarkdown: isAssistant,
                    foregroundColor: isAssistant ? AppTheme.Colors.primaryText : AppTheme.Colors.background,
                    isProvisional: false
                )

                Text(item.badgeLabel)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(isAssistant ? AppTheme.Colors.tertiaryText : AppTheme.Colors.background.opacity(0.7))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(isAssistant ? AppTheme.Colors.surface : AppTheme.Colors.primaryText)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(isAssistant ? AppTheme.Colors.divider : .clear, lineWidth: 1)
            )
        }
    }
}

private struct CoachPinnedFeedCard: View {
    let card: CoachCardPayload
    let onAction: (CoachCardAction) -> Void

    var body: some View {
        CoachStructuredCard(card: card, isPinned: true, onAction: onAction)
    }
}

private struct CoachRunTraceView: View {
    let trace: CoachRunTracePresentation

    @State private var isExpanded = false
    @State private var now = Date()

    private let liveTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if trace.isStreaming {
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
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                Circle()
                    .fill(AppTheme.Colors.highlight)
                    .frame(width: 8, height: 8)
                    .shimmer(duration: 1.2)

                Text(trace.headline)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)

                Spacer(minLength: 0)

                if let elapsedLabel {
                    Text(elapsedLabel)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.tertiaryText)
                        .monospacedDigit()
                }
            }

            if !recentToolSteps.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(recentToolSteps) { step in
                        HStack(alignment: .center, spacing: 8) {
                            Circle()
                                .fill(step.status == "completed"
                                    ? AppTheme.Colors.tertiaryText.opacity(0.45)
                                    : AppTheme.Colors.highlight)
                                .frame(width: 6, height: 6)

                            Text(step.title)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(step.status == "completed"
                                    ? AppTheme.Colors.tertiaryText
                                    : AppTheme.Colors.secondaryText)

                            Spacer(minLength: 0)

                            if step.status == "completed" {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(AppTheme.Colors.tertiaryText)
                            }
                        }
                        .transition(.asymmetric(
                            insertion: .move(edge: .bottom).combined(with: .opacity),
                            removal: .move(edge: .top).combined(with: .opacity)
                        ))
                    }
                }
                .animation(AppTheme.Animation.gentle, value: recentToolSteps.map(\.id).joined(separator: "|"))
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(AppTheme.Colors.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(AppTheme.Colors.divider, lineWidth: 1)
        )
    }

    private var archivedTraceBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: {
                withAnimation(AppTheme.Animation.gentle) {
                    isExpanded.toggle()
                }
            }) {
                HStack(alignment: .center, spacing: 10) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.tertiaryText)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Thoughts")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.primaryText)

                        if let detail = trace.detail, !detail.isEmpty {
                            Text(detail)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(AppTheme.Colors.secondaryText)
                        }
                    }

                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(trace.steps) { step in
                        CoachRunTraceStepRow(step: step)
                    }
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(AppTheme.Colors.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(AppTheme.Colors.divider, lineWidth: 1)
        )
    }

    private var recentToolSteps: [CoachRunTraceStep] {
        Array(trace.steps.filter { $0.kind == .tool }.suffix(3))
    }

    private var elapsedLabel: String? {
        guard let startedAt = trace.startedAt else { return nil }
        let elapsedSeconds = max(0, Int(now.timeIntervalSince(startedAt)))
        return "\(elapsedSeconds)s"
    }
}

private struct CoachRunTraceStepRow: View {
    let step: CoachRunTraceStep

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: iconName)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(iconColor)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                Text(step.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)

                if let detail = step.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: 0)
        }
    }

    private var iconName: String {
        switch step.kind {
        case .tool:
            return "wrench.adjustable"
        case .error:
            return "exclamationmark.triangle"
        }
    }

    private var iconColor: Color {
        switch step.kind {
        case .error:
            return AppTheme.Colors.danger
        case .tool:
            return step.status == "completed"
                ? AppTheme.Colors.tertiaryText
                : AppTheme.Colors.highlight
        }
    }
}

private struct CoachStructuredCard: View {
    let card: CoachCardPayload
    let isPinned: Bool
    let onAction: (CoachCardAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(card.title)
                        .font(.system(size: isPinned ? 22 : 20, weight: .bold, design: .rounded))
                        .foregroundStyle(AppTheme.Colors.primaryText)

                    if let subtitle = card.subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 14, weight: .medium))
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
                                .fill(AppTheme.Colors.background)
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
        .padding(isPinned ? 18 : 16)
        .background(
            RoundedRectangle(cornerRadius: isPinned ? 26 : 24, style: .continuous)
                .fill(AppTheme.Colors.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: isPinned ? 26 : 24, style: .continuous)
                .stroke(AppTheme.Colors.divider, lineWidth: 1)
        )
    }

    @ViewBuilder
    private var workoutCurrentBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let currentExerciseName = card.currentExerciseName, !currentExerciseName.isEmpty {
                Text(currentExerciseName)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.primaryText)
            }

            if let currentSetLabel = card.currentSetLabel, !currentSetLabel.isEmpty {
                Text(currentSetLabel)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
            }

            if let coachCue = card.coachCue, !coachCue.isEmpty {
                Text(coachCue)
                    .font(.system(size: 15, weight: .medium))
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
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else if let body = card.body, !body.isEmpty {
                Text(body)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private var insightBody: some View {
        if let body = card.body, !body.isEmpty {
            Text(body)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text(card.title)
                .font(.system(size: 14, weight: .medium))
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
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(AppTheme.Colors.background)
        )
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
            .background(
                Capsule(style: .continuous)
                    .fill(backgroundColor)
            )
        }
        .buttonStyle(.plain)
    }

    private var backgroundColor: Color {
        switch action.style {
        case "primary":
            return AppTheme.Colors.primaryText
        case "destructive":
            return Color(red: 0.69, green: 0.2, blue: 0.21)
        default:
            return AppTheme.Colors.background
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
            if isProvisional {
                Text(parsedText)
                    .foregroundStyle(foregroundColor)
                    .tint(foregroundColor)
                    .lineSpacing(4)
                    .italic()
                    .opacity(0.9)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(parsedText)
                    .foregroundStyle(foregroundColor)
                    .tint(foregroundColor)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            if isProvisional {
                Text(text)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(foregroundColor)
                    .italic()
                    .opacity(0.9)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(text)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(foregroundColor)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var parsedText: AttributedString {
        if let parsed = try? AttributedString(
            markdown: text,
            options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) {
            return parsed
        }

        return AttributedString(text)
    }
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
                        .background(
                            Capsule(style: .continuous)
                                .fill(AppTheme.Colors.surface)
                        )
                    }
                    .buttonStyle(.plain)
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
    let quickActionsExpanded: Bool
    let onToggleQuickActions: () -> Void
    let onSend: () -> Void
    let onMicrophoneTap: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            Button(action: onToggleQuickActions) {
                Circle()
                    .fill(AppTheme.Colors.background)
                    .frame(width: 44, height: 44)
                    .overlay {
                        Image(systemName: quickActionsExpanded ? "xmark" : "plus")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(AppTheme.Colors.primaryText)
                    }
            }
            .buttonStyle(.plain)

            HStack(alignment: .bottom, spacing: 10) {
                Button(action: onMicrophoneTap) {
                    ZStack {
                        Circle()
                            .fill(speechManager.isListening ? AppTheme.Colors.primaryText : AppTheme.Colors.background)
                            .frame(width: 40, height: 40)

                        Image(systemName: speechManager.isListening ? "stop.fill" : "mic.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(speechManager.isListening ? AppTheme.Colors.background : AppTheme.Colors.primaryText)
                    }
                }
                .buttonStyle(.plain)

                Group {
                    if speechManager.isListening {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(speechManager.partialTranscript.isEmpty ? "Listening..." : speechManager.partialTranscript)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(AppTheme.Colors.primaryText)
                                .frame(maxWidth: .infinity, alignment: .leading)

                            WaveformView(active: true)
                        }
                    } else {
                        TextField(placeholder, text: $text, axis: .vertical)
                            .font(AppTheme.Typography.input)
                            .foregroundStyle(AppTheme.Colors.primaryText)
                            .lineLimit(1...5)
                    }
                }

                Button(action: onSend) {
                    ZStack {
                        Circle()
                            .fill(sendEnabled ? AppTheme.Colors.primaryText : AppTheme.Colors.tertiaryText.opacity(0.18))
                            .frame(width: 40, height: 40)

                        if isSending {
                            ProgressView()
                                .controlSize(.small)
                                .tint(AppTheme.Colors.background)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(AppTheme.Colors.background)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(!sendEnabled)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(AppTheme.Colors.surface)
            )
        }
    }

    private var sendEnabled: Bool {
        speechManager.isListening == false && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false && !isSending
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
