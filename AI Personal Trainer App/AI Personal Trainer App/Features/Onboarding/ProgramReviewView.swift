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
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(parseLines().enumerated()), id: \.offset) { _, line in
                lineView(line)
            }
        }
    }

    private enum MarkdownLine {
        case h1(String)
        case h2(String)
        case h3(String)
        case bullet(String)
        case indentedBullet(String) // sub-bullets with bold/italic
        case quote(String)
        case italic(String)
        case bold(String, String) // label, value
        case text(String)
        case spacer
    }

    private func parseLines() -> [MarkdownLine] {
        var result: [MarkdownLine] = []
        for rawLine in markdown.components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty {
                if result.last != nil {
                    result.append(.spacer)
                }
                continue
            } else if line.hasPrefix("# ") && !line.hasPrefix("## ") {
                result.append(.h1(String(line.dropFirst(2))))
            } else if line.hasPrefix("### ") {
                result.append(.h3(String(line.dropFirst(4))))
            } else if line.hasPrefix("## ") {
                result.append(.h2(String(line.dropFirst(3))))
            } else if line.hasPrefix("- **") || line.hasPrefix("  ") && line.contains("*") {
                // Bullets with bold/italic content
                let content = String(line.dropFirst(2))
                result.append(.indentedBullet(content))
            } else if line.hasPrefix("- ") {
                result.append(.bullet(String(line.dropFirst(2))))
            } else if line.hasPrefix("> ") {
                result.append(.quote(String(line.dropFirst(2))))
            } else if line.hasPrefix("*") && line.hasSuffix("*") && !line.hasPrefix("**") {
                let content = line.trimmingCharacters(in: CharacterSet(charactersIn: "*"))
                result.append(.italic(content))
            } else if line.hasPrefix("**") && line.contains(":**") {
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
        case .h1(let text):
            Text(text)
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.top, 8)
                .padding(.bottom, 4)

        case .h2(let text):
            VStack(alignment: .leading, spacing: 0) {
                Divider()
                    .background(AppTheme.Colors.tertiaryText.opacity(0.2))
                    .padding(.bottom, 16)
                Text(text)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(AppTheme.Colors.primaryText)
            }
            .padding(.top, 20)
            .padding(.bottom, 4)

        case .h3(let text):
            Text(text)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.top, 12)
                .padding(.bottom, 2)

        case .bullet(let text):
            HStack(alignment: .top, spacing: 10) {
                Text("\u{2022}")
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .padding(.top, 1)
                Text(text)
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 2)

        case .indentedBullet(let text):
            HStack(alignment: .top, spacing: 10) {
                Text("\u{2022}")
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .padding(.top, 1)
                renderRichText(text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 2)

        case .quote(let text):
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(AppTheme.Colors.orbSkyMid.opacity(0.5))
                    .frame(width: 3)
                Text(text)
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .italic()
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 4)

        case .italic(let text):
            Text(text)
                .font(.system(size: 15))
                .foregroundColor(AppTheme.Colors.tertiaryText)
                .italic()
                .padding(.vertical, 1)

        case .bold(let label, let value):
            HStack(alignment: .top, spacing: 4) {
                Text(label + ":")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)
                Text(value)
                    .font(.system(size: 16))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 2)

        case .text(let text):
            Text(text)
                .font(.system(size: 16))
                .foregroundColor(AppTheme.Colors.primaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, 2)

        case .spacer:
            Color.clear.frame(height: 8)
        }
    }

    /// Parse inline **bold** and *italic* markers within a string
    private func renderRichText(_ input: String) -> Text {
        var result = Text("")
        var remaining = input

        while !remaining.isEmpty {
            if remaining.hasPrefix("**"), let endRange = remaining.dropFirst(2).range(of: "**") {
                let boldContent = remaining[remaining.index(remaining.startIndex, offsetBy: 2)..<endRange.lowerBound]
                result = result + Text(String(boldContent)).font(.system(size: 16, weight: .semibold)).foregroundColor(AppTheme.Colors.primaryText)
                remaining = String(remaining[endRange.upperBound...])
            } else if remaining.hasPrefix("*"), let endRange = remaining.dropFirst(1).range(of: "*") {
                let italicContent = remaining[remaining.index(remaining.startIndex, offsetBy: 1)..<endRange.lowerBound]
                result = result + Text(String(italicContent)).font(.system(size: 15)).foregroundColor(AppTheme.Colors.tertiaryText).italic()
                remaining = String(remaining[endRange.upperBound...])
            } else {
                // Take one character at a time until we hit a marker
                let nextBold = remaining.range(of: "**")?.lowerBound ?? remaining.endIndex
                let nextItalic = remaining.range(of: "*")?.lowerBound ?? remaining.endIndex
                let nextMarker = min(nextBold, nextItalic)

                if nextMarker == remaining.startIndex {
                    // Single * that's not a marker — take just the character
                    result = result + Text(String(remaining.prefix(1))).font(.system(size: 16)).foregroundColor(AppTheme.Colors.primaryText)
                    remaining = String(remaining.dropFirst(1))
                } else {
                    let plain = String(remaining[remaining.startIndex..<nextMarker])
                    result = result + Text(plain).font(.system(size: 16)).foregroundColor(AppTheme.Colors.primaryText)
                    remaining = String(remaining[nextMarker...])
                }
            }
        }

        return result
    }
}
