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
    @Published private(set) var liveAssistantText = ""
    @Published private(set) var liveAssistantRunID: String?

    private var activeUserID: UUID?
    private var pollTask: Task<Void, Never>?
    private var streamTask: Task<Void, Never>?
    private var didTriggerAppOpenThisLaunch = false
    private var observedRunID: String?
    private var observedStreamPath: String?
    private var lastStreamEventID: String?

    var feedItems: [CoachFeedItem] {
        var items = surface?.feed ?? []

        if let liveAssistantRunID, !liveAssistantText.isEmpty {
            items.append(
                CoachFeedItem(
                    id: "stream:\(liveAssistantRunID)",
                    kind: "message",
                    role: "assistant",
                    text: liveAssistantText,
                    eventType: "assistant.delta",
                    runId: liveAssistantRunID,
                    seqNum: nil,
                    occurredAt: nil
                )
            )
        }

        return items
    }

    var quickActions: [CoachQuickAction] {
        surface?.quickActions ?? []
    }

    var activeRun: CoachRunSummary? {
        surface?.activeRun
    }

    var composerPlaceholder: String {
        surface?.composer.placeholder ?? "Message your coach"
    }

    var scrollToken: String {
        let feedToken = feedItems.map(\.id).joined(separator: "|")
        let runToken = [activeRun?.runId ?? "", activeRun?.status ?? ""].joined(separator: "|")
        let liveToken = [liveAssistantRunID ?? "", liveAssistantText].joined(separator: "|")
        return [feedToken, runToken, liveToken].joined(separator: "::")
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
        pollTask?.cancel()
        pollTask = nil
        cancelRunObservation(resetStreamState: true)
    }

    func activate(session: Session) async {
        if activeUserID != session.user.id {
            activeUserID = session.user.id
            surface = nil
            composerText = ""
            errorMessage = nil
            isResettingSession = false
            didTriggerAppOpenThisLaunch = false
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
        await submitMessage(
            message: action.message,
            triggerType: action.triggerType,
            metadata: MessageMetadata(source: "ios_quick_action", actionId: action.id)
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

        pollTask?.cancel()
        pollTask = nil
        cancelRunObservation(resetStreamState: observedRunID != runID)

        observedRunID = runID
        observedStreamPath = streamPath

        if liveAssistantRunID != runID {
            liveAssistantRunID = runID
            liveAssistantText = ""
            lastStreamEventID = nil
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
            liveAssistantText = ""
            liveAssistantRunID = nil
        }
    }

    private func handleRunStreamEvent(_ event: CoachRunStreamEvent, expectedRunID: String) {
        guard event.runId == expectedRunID else { return }

        if let eventID = event.eventId {
            lastStreamEventID = String(eventID)
        }

        switch event.type {
        case "assistant.delta":
            if liveAssistantRunID != expectedRunID {
                liveAssistantRunID = expectedRunID
                liveAssistantText = ""
            }
            liveAssistantText += event.text ?? ""
        case "run.failed":
            if let message = event.message, !message.isEmpty {
                showError(message)
            }

            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.refreshSurface(allowAppOpenTrigger: false)
            }
        case "run.completed":
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

                    if viewModel.isLoading && viewModel.feedItems.isEmpty {
                        CoachLoadingCard()
                    } else if viewModel.feedItems.isEmpty {
                        CoachEmptyStateCard(quickActions: viewModel.quickActions) { action in
                            Task { await viewModel.runQuickAction(action) }
                        }
                    }

                    LazyVStack(spacing: 14) {
                        ForEach(viewModel.feedItems) { item in
                            CoachFeedRow(item: item)
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
                    if let activeRun = viewModel.activeRun {
                        ActiveRunPinnedCard(activeRun: activeRun)
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
    let item: CoachFeedItem

    var isAssistant: Bool {
        item.role == "assistant"
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

    private var content: some View {
        VStack(alignment: .leading, spacing: 8) {
            CoachMessageText(
                text: item.text,
                rendersMarkdown: isAssistant,
                foregroundColor: isAssistant ? AppTheme.Colors.primaryText : AppTheme.Colors.background
            )

            Text(badgeLabel)
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

    private var badgeLabel: String {
        if isAssistant {
            return item.eventType == "assistant.delta" ? "Coach live" : "Coach"
        }

        return "You"
    }
}

private struct CoachMessageText: View {
    let text: String
    let rendersMarkdown: Bool
    let foregroundColor: Color

    var body: some View {
        if rendersMarkdown {
            Text(parsedText)
                .foregroundStyle(foregroundColor)
                .tint(foregroundColor)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text(text)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(foregroundColor)
                .fixedSize(horizontal: false, vertical: true)
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

private struct ActiveRunPinnedCard: View {
    let activeRun: CoachRunSummary

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            ProgressView()
                .controlSize(.small)

            VStack(alignment: .leading, spacing: 4) {
                Text(activeRun.status == "running" ? "Coach is working" : "Coach is queued")
                    .font(AppTheme.Typography.cardTitle)
                    .foregroundStyle(AppTheme.Colors.primaryText)

                Text(activeRun.triggerType.replacingOccurrences(of: ".", with: " "))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(AppTheme.Colors.secondaryText)
            }

            Spacer()
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(AppTheme.Colors.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(AppTheme.Colors.divider, lineWidth: 1)
        )
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
