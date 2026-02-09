import SwiftUI

struct ProgramReviewView: View {
    @StateObject private var onboardingStore = OnboardingStore.shared
    @StateObject private var programStore = TrainingProgramStore.shared

    @State private var isActivating = false
    @State private var contentVisible = false

    var body: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top spacing for shared orb
                Color.clear
                    .frame(height: 50)
                    .padding(.top, AppTheme.Spacing.xl)

                if programStore.isLoading && programStore.program == nil {
                    loadingState
                } else if let error = programStore.errorMessage, programStore.program == nil {
                    errorState(error)
                } else if let program = programStore.program {
                    programContent(program)
                }
            }

            // Bottom activate button
            if programStore.program != nil {
                VStack {
                    Spacer()
                    activateButton
                }
            }
        }
        .animation(.easeInOut(duration: 0.3), value: contentVisible)
        .onAppear {
            if programStore.program == nil && !programStore.isLoading {
                Task {
                    await programStore.draft()
                    if let programId = programStore.program?.id {
                        onboardingStore.setProgramId(programId)
                    }
                }
            }
            withAnimation(.easeOut(duration: 0.4).delay(0.3)) {
                contentVisible = true
            }
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()
            ProgressView()
                .scaleEffect(1.2)
            Text("Building your program...")
                .font(.system(size: 16))
                .foregroundColor(AppTheme.Colors.secondaryText)
            Spacer()
        }
    }

    // MARK: - Error State

    private func errorState(_ message: String) -> some View {
        VStack {
            Spacer()
            OnboardingErrorCard(
                title: "Couldn't generate your program",
                message: message,
                primaryActionTitle: "Retry"
            ) {
                Task { await programStore.draft() }
            }
            .padding(.horizontal, AppTheme.Spacing.xxl)
            Spacer()
        }
    }

    // MARK: - Program Content

    private func programContent(_ program: TrainingProgram) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                // Header
                VStack(spacing: AppTheme.Spacing.sm) {
                    Text("Your Training Program")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(AppTheme.Colors.primaryText)

                    Text("Review your personalized plan below.")
                        .font(.system(size: 15))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .opacity(contentVisible ? 1 : 0)
                .offset(y: contentVisible ? 0 : 10)

                // Markdown content
                if let markdown = program.programMarkdown, !markdown.isEmpty {
                    MarkdownContentView(markdown: markdown)
                        .padding(AppTheme.Spacing.xl)
                        .background(AppTheme.Colors.surface)
                        .cornerRadius(AppTheme.CornerRadius.large)
                        .opacity(contentVisible ? 1 : 0)
                        .offset(y: contentVisible ? 0 : 20)
                } else {
                    // Fallback: render key details from structured JSON
                    programFallbackView(program.program)
                        .opacity(contentVisible ? 1 : 0)
                        .offset(y: contentVisible ? 0 : 20)
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xxl)
            .padding(.top, AppTheme.Spacing.lg)
            .padding(.bottom, 120)
        }
    }

    // MARK: - Fallback structured view

    private func programFallbackView(_ detail: TrainingProgramDetail) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            // Goals
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                sectionHeader("Goals")
                Text("**Primary:** \(detail.goals.primary)")
                if !detail.goals.secondary.isEmpty {
                    Text("**Secondary:** \(detail.goals.secondary)")
                }
                Text("**Timeline:** \(detail.goals.timelineWeeks) weeks")
            }

            Divider().background(AppTheme.Colors.tertiaryText.opacity(0.3))

            // Schedule
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                sectionHeader("Weekly Schedule")
                Text("\(detail.weeklyTemplate.daysPerWeek) days per week")
                if !detail.weeklyTemplate.sessionTypes.isEmpty {
                    Text(detail.weeklyTemplate.sessionTypes.joined(separator: ", "))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
            }

            Divider().background(AppTheme.Colors.tertiaryText.opacity(0.3))

            // Sessions
            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                sectionHeader("Sessions")
                ForEach(Array(detail.sessions.enumerated()), id: \.offset) { index, session in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Day \(index + 1): \(session.focus)")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(AppTheme.Colors.primaryText)
                        Text("~\(session.durationMin) min")
                            .font(.system(size: 13))
                            .foregroundColor(AppTheme.Colors.tertiaryText)
                    }
                }
            }
        }
        .font(.system(size: 14))
        .foregroundColor(AppTheme.Colors.primaryText)
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(AppTheme.Colors.primaryText)
    }

    // MARK: - Activate Button

    private var activateButton: some View {
        VStack(spacing: 0) {
            Button(action: activateProgram) {
                if isActivating {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                } else {
                    Text("Activate Program")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.background)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
            }
            .background(AppTheme.Colors.primaryText)
            .cornerRadius(AppTheme.CornerRadius.large)
            .disabled(isActivating)
        }
        .padding(.horizontal, AppTheme.Spacing.xxl)
        .padding(.bottom, 40)
        .background(
            LinearGradient(
                colors: [AppTheme.Colors.background.opacity(0), AppTheme.Colors.background],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 100)
            .offset(y: -40)
        )
    }

    // MARK: - Actions

    private func activateProgram() {
        isActivating = true
        Task {
            await programStore.approve()
            await programStore.activate()
            await onboardingStore.activateProgram()
            isActivating = false
        }
    }
}

// MARK: - Markdown Content View

struct MarkdownContentView: View {
    let markdown: String

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            ForEach(Array(parseLines().enumerated()), id: \.offset) { _, line in
                lineView(line)
            }
        }
    }

    private enum MarkdownLine {
        case h2(String)
        case h3(String)
        case bullet(String)
        case quote(String)
        case italic(String)
        case bold(String, String) // label, value
        case text(String)
        case divider
    }

    private func parseLines() -> [MarkdownLine] {
        var result: [MarkdownLine] = []
        for rawLine in markdown.components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty {
                continue
            } else if line.hasPrefix("## ") {
                result.append(.h2(String(line.dropFirst(3))))
            } else if line.hasPrefix("### ") {
                result.append(.h3(String(line.dropFirst(4))))
            } else if line.hasPrefix("- ") {
                result.append(.bullet(String(line.dropFirst(2))))
            } else if line.hasPrefix("> ") {
                result.append(.quote(String(line.dropFirst(2))))
            } else if line.hasPrefix("*") && line.hasSuffix("*") && !line.hasPrefix("**") {
                let content = line.trimmingCharacters(in: CharacterSet(charactersIn: "*"))
                result.append(.italic(content))
            } else if line.hasPrefix("**") && line.contains(":**") {
                // Bold label: value pattern
                if let colonRange = line.range(of: ":**") {
                    let label = String(line[line.index(line.startIndex, offsetBy: 2)..<colonRange.lowerBound])
                    let value = String(line[colonRange.upperBound...]).trimmingCharacters(in: .whitespaces)
                    result.append(.bold(label, value))
                } else {
                    result.append(.text(line))
                }
            } else {
                result.append(.text(line))
            }
        }
        return result
    }

    @ViewBuilder
    private func lineView(_ line: MarkdownLine) -> some View {
        switch line {
        case .h2(let text):
            Text(text)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.top, AppTheme.Spacing.sm)

        case .h3(let text):
            Text(text)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.top, AppTheme.Spacing.xs)

        case .bullet(let text):
            HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                Text("\u{2022}")
                    .foregroundColor(AppTheme.Colors.secondaryText)
                Text(text)
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }

        case .quote(let text):
            HStack(spacing: AppTheme.Spacing.sm) {
                Rectangle()
                    .fill(AppTheme.Colors.orbSkyMid.opacity(0.4))
                    .frame(width: 3)
                Text(text)
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .italic()
            }

        case .italic(let text):
            Text(text)
                .font(.system(size: 13))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .italic()

        case .bold(let label, let value):
            HStack(alignment: .top, spacing: 4) {
                Text(label + ":")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                Text(value)
                    .font(.system(size: 14))
                    .foregroundColor(AppTheme.Colors.secondaryText)
            }

        case .text(let text):
            Text(text)
                .font(.system(size: 14))
                .foregroundColor(AppTheme.Colors.primaryText)

        case .divider:
            Divider()
                .background(AppTheme.Colors.tertiaryText.opacity(0.3))
        }
    }
}
