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
            VStack(alignment: .leading, spacing: 0) {
                // Markdown content — full page, no card wrapper
                if let markdown = program.programMarkdown, !markdown.isEmpty {
                    MarkdownContentView(markdown: markdown)
                        .padding(.horizontal, 24)
                        .padding(.top, 20)
                        .opacity(contentVisible ? 1 : 0)
                        .offset(y: contentVisible ? 0 : 20)
                } else {
                    // Fallback
                    Text("Your program is being prepared...")
                        .font(.system(size: 16))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .padding(.horizontal, 24)
                        .padding(.top, 40)
                }
            }
            .padding(.bottom, 120)
        }
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
        .padding(.bottom, 12)
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
        Haptic.medium()
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
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxl) {
            ForEach(Array(parseSections().enumerated()), id: \.offset) { _, section in
                sectionCard(section)
            }
        }
    }

    // MARK: - Data Models

    private enum MarkdownLine {
        case h2(String)
        case h3(String)
        case bullet(String)
        case indentedBullet(String)
        case quote(String)
        case italic(String)
        case bold(String, String)
        case text(String)
        case spacer
    }

    private struct ProgramSection {
        let title: String
        let iconName: String
        let lines: [MarkdownLine]
    }

    // MARK: - Section Icon Mapping

    private static let sectionIcons: [String: String] = [
        "your training program": "figure.run",
        "goals": "target",
        "weekly structure": "calendar",
        "training sessions": "dumbbell",
        "progression plan": "chart.line.uptrend",
        "recovery": "bed.double",
        "safety guidelines": "shield.checkered",
        "coach notes": "quote.opening",
    ]

    private static func iconForSection(_ title: String) -> String {
        let lower = title.lowercased()
        for (key, icon) in sectionIcons {
            if lower.contains(key) { return icon }
        }
        return "doc.text"
    }

    // MARK: - Section Parser

    private func parseSections() -> [ProgramSection] {
        var sections: [ProgramSection] = []
        var currentTitle: String? = nil
        var currentLines: [MarkdownLine] = []

        for rawLine in markdown.components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)

            if line.hasPrefix("# ") && !line.hasPrefix("## ") {
                // Flush previous section
                if let title = currentTitle {
                    sections.append(ProgramSection(
                        title: title,
                        iconName: Self.iconForSection(title),
                        lines: currentLines
                    ))
                }
                currentTitle = String(line.dropFirst(2))
                currentLines = []
                continue
            }

            // Parse the line
            if line.isEmpty {
                if !currentLines.isEmpty, case .spacer = currentLines.last {} else if !currentLines.isEmpty {
                    currentLines.append(.spacer)
                }
            } else if line.hasPrefix("### ") {
                currentLines.append(.h3(String(line.dropFirst(4))))
            } else if line.hasPrefix("## ") {
                currentLines.append(.h2(String(line.dropFirst(3))))
            } else if line.hasPrefix("- **") || (line.hasPrefix("  ") && line.contains("*")) {
                let content = line.hasPrefix("- ") ? String(line.dropFirst(2)) : line.trimmingCharacters(in: .whitespaces)
                currentLines.append(.indentedBullet(content))
            } else if line.hasPrefix("- ") {
                currentLines.append(.bullet(String(line.dropFirst(2))))
            } else if line.hasPrefix("> ") {
                currentLines.append(.quote(String(line.dropFirst(2))))
            } else if line.hasPrefix("*") && line.hasSuffix("*") && !line.hasPrefix("**") {
                let content = line.trimmingCharacters(in: CharacterSet(charactersIn: "*"))
                currentLines.append(.italic(content))
            } else if line.hasPrefix("**") && line.contains(":**") {
                if let colonRange = line.range(of: ":**") {
                    let label = String(line[line.index(line.startIndex, offsetBy: 2)..<colonRange.lowerBound])
                    let value = String(line[colonRange.upperBound...]).trimmingCharacters(in: .whitespaces)
                    currentLines.append(.bold(label, value))
                } else {
                    currentLines.append(.text(line))
                }
            } else {
                // If no section started yet, start an implicit one
                if currentTitle == nil {
                    currentTitle = "Overview"
                }
                currentLines.append(.text(line))
            }
        }

        // Flush last section
        if let title = currentTitle {
            sections.append(ProgramSection(
                title: title,
                iconName: Self.iconForSection(title),
                lines: currentLines
            ))
        }

        return sections
    }

    // MARK: - Section Card

    @ViewBuilder
    private func sectionCard(_ section: ProgramSection) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Section header
            sectionHeader(title: section.title, icon: section.iconName)

            // Section body
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(section.lines.enumerated()), id: \.offset) { _, line in
                    lineView(line)
                }
            }
        }
        .padding(.horizontal, AppTheme.Spacing.xxxl)
        .padding(.vertical, AppTheme.Spacing.xxl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
    }

    // MARK: - Section Header

    private func sectionHeader(title: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            HStack(spacing: AppTheme.Spacing.md) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                Text(title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }

            Rectangle()
                .fill(AppTheme.Colors.divider)
                .frame(height: 1)
        }
        .padding(.bottom, AppTheme.Spacing.xl)
    }

    // MARK: - Line Renderers

    @ViewBuilder
    private func lineView(_ line: MarkdownLine) -> some View {
        switch line {
        case .h2(let text):
            sessionDayView(text)

        case .h3(let text):
            Text(text)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.top, 16)
                .padding(.bottom, 4)

        case .bullet(let text):
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(AppTheme.Colors.tertiaryText)
                    .frame(width: 6, height: 6)
                    .padding(.top, 7)
                Text(text)
                    .font(.system(size: 15.5))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 3)

        case .indentedBullet(let text):
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(AppTheme.Colors.tertiaryText)
                    .frame(width: 6, height: 6)
                    .padding(.top, 7)
                renderRichText(text)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 3)

        case .quote(let text):
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(AppTheme.Colors.orbSkyMid)
                    .frame(width: 3)
                Text(text)
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .italic()
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(AppTheme.Spacing.lg)
            .background(AppTheme.Colors.background.opacity(0.5))
            .cornerRadius(AppTheme.CornerRadius.medium)
            .padding(.vertical, 4)

        case .italic(let text):
            exerciseDetailView(text)

        case .bold(let label, let value):
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                Text(value)
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 4)

        case .text(let text):
            renderRichText(text)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, 2)

        case .spacer:
            Color.clear.frame(height: 12)
        }
    }

    // MARK: - Session Day Sub-Card (H2)

    private func sessionDayView(_ text: String) -> some View {
        let parts = parseSessionTitle(text)

        return HStack(alignment: .top, spacing: 0) {
            // Left accent bar
            RoundedRectangle(cornerRadius: 1.5)
                .fill(AppTheme.Colors.orbSkyMid)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 4) {
                // Day chip
                if let dayLabel = parts.dayLabel {
                    Text(dayLabel)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.orbSkyDeep)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(AppTheme.Colors.orbSkyMid.opacity(0.2))
                        .cornerRadius(AppTheme.CornerRadius.small)
                }

                // Session name
                Text(parts.sessionName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }
            .padding(.leading, 12)
        }
        .padding(.top, 16)
        .padding(.bottom, 6)
    }

    private struct SessionTitleParts {
        let dayLabel: String?
        let sessionName: String
    }

    private func parseSessionTitle(_ text: String) -> SessionTitleParts {
        // Match patterns like "Day 1: Upper Push + Core"
        if let colonIndex = text.firstIndex(of: ":") {
            let prefix = String(text[text.startIndex..<colonIndex]).trimmingCharacters(in: .whitespaces)
            let name = String(text[text.index(after: colonIndex)...]).trimmingCharacters(in: .whitespaces)
            if prefix.lowercased().hasPrefix("day") {
                return SessionTitleParts(dayLabel: prefix.uppercased(), sessionName: name)
            }
        }
        return SessionTitleParts(dayLabel: nil, sessionName: text)
    }

    // MARK: - Exercise Detail View (parsed italic lines)

    private struct ExerciseDetailParts {
        let rpe: String?
        let formCue: String?
        let rest: String?
    }

    private func parseExerciseDetail(_ text: String) -> ExerciseDetailParts {
        var rpe: String? = nil
        var formCue: String? = nil
        var rest: String? = nil
        var remaining = text.trimmingCharacters(in: .whitespaces)

        // Extract RPE (e.g. "RPE 7." or "RPE 6-7.")
        if let rpeMatch = remaining.range(of: #"^RPE\s+[\d\-–]+\.?\s*"#, options: .regularExpression) {
            let rpeText = String(remaining[rpeMatch]).trimmingCharacters(in: .whitespaces)
            // Clean trailing period
            rpe = rpeText.hasSuffix(".") ? String(rpeText.dropLast()).trimmingCharacters(in: .whitespaces) : rpeText
            remaining = String(remaining[rpeMatch.upperBound...]).trimmingCharacters(in: .whitespaces)
        }

        // Extract Rest (e.g. "Rest 60-90 seconds." at the end)
        if let restMatch = remaining.range(of: #"Rest\s+[\d\-–]+\s*seconds\.?\s*$"#, options: [.regularExpression, .caseInsensitive]) {
            let restText = String(remaining[restMatch]).trimmingCharacters(in: .whitespaces)
            rest = restText.hasSuffix(".") ? String(restText.dropLast()).trimmingCharacters(in: .whitespaces) : restText
            remaining = String(remaining[remaining.startIndex..<restMatch.lowerBound]).trimmingCharacters(in: .whitespaces)
        }

        // Whatever is left is the form cue
        if !remaining.isEmpty {
            // Clean trailing period
            formCue = remaining.hasSuffix(".") ? String(remaining.dropLast()).trimmingCharacters(in: .whitespaces) : remaining
        }

        return ExerciseDetailParts(rpe: rpe, formCue: formCue, rest: rest)
    }

    @ViewBuilder
    private func exerciseDetailView(_ text: String) -> some View {
        let parts = parseExerciseDetail(text)

        // Only show structured view if we parsed at least RPE or rest
        if parts.rpe != nil || parts.rest != nil {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    // RPE badge
                    if let rpe = parts.rpe {
                        Text(rpe)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(AppTheme.Colors.orbSkyDeep)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(AppTheme.Colors.orbSkyMid.opacity(0.15))
                            .cornerRadius(AppTheme.CornerRadius.small)
                    }

                    // Rest pill
                    if let rest = parts.rest {
                        HStack(spacing: 4) {
                            Image(systemName: "timer")
                                .font(.system(size: 11))
                            Text(rest)
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(AppTheme.Colors.background.opacity(0.6))
                        .cornerRadius(AppTheme.CornerRadius.small)
                    }
                }

                // Form cue
                if let cue = parts.formCue {
                    Text(cue)
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 4)
        } else {
            // Fallback for italic lines that don't match the pattern
            Text(text)
                .font(.system(size: 15))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .italic()
                .lineSpacing(4)
                .padding(.vertical, 1)
        }
    }

    // MARK: - Rich Text Parser

    private func renderRichText(_ input: String) -> Text {
        var result = Text("")
        var remaining = input

        while !remaining.isEmpty {
            if remaining.hasPrefix("**"), let endRange = remaining.dropFirst(2).range(of: "**") {
                let boldContent = remaining[remaining.index(remaining.startIndex, offsetBy: 2)..<endRange.lowerBound]
                result = result + Text(String(boldContent)).font(.system(size: 15.5, weight: .semibold)).foregroundColor(AppTheme.Colors.primaryText)
                remaining = String(remaining[endRange.upperBound...])
            } else if remaining.hasPrefix("*"), let endRange = remaining.dropFirst(1).range(of: "*") {
                let italicContent = remaining[remaining.index(remaining.startIndex, offsetBy: 1)..<endRange.lowerBound]
                result = result + Text(String(italicContent)).font(.system(size: 15)).foregroundColor(AppTheme.Colors.tertiaryText).italic()
                remaining = String(remaining[endRange.upperBound...])
            } else {
                let nextBold = remaining.range(of: "**")?.lowerBound ?? remaining.endIndex
                let nextItalic = remaining.range(of: "*")?.lowerBound ?? remaining.endIndex
                let nextMarker = min(nextBold, nextItalic)

                if nextMarker == remaining.startIndex {
                    result = result + Text(String(remaining.prefix(1))).font(.system(size: 15.5)).foregroundColor(AppTheme.Colors.primaryText)
                    remaining = String(remaining.dropFirst(1))
                } else {
                    let plain = String(remaining[remaining.startIndex..<nextMarker])
                    result = result + Text(plain).font(.system(size: 15.5)).foregroundColor(AppTheme.Colors.primaryText)
                    remaining = String(remaining[nextMarker...])
                }
            }
        }

        return result
    }
}
