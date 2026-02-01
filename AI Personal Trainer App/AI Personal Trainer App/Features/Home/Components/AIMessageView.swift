//
//  AIMessageView.swift
//  AI Personal Trainer App
//
//  Text-first AI message component with inline stat highlights.
//  The AI communicates through natural language with key stats highlighted inline.
//

import SwiftUI

/// Represents a segment of an AI message - either plain text or a highlighted stat
enum AIMessageSegment: Identifiable {
    case text(String)
    case highlight(String)

    var id: String {
        switch self {
        case .text(let str): return "text_\(str.hashValue)"
        case .highlight(let str): return "highlight_\(str.hashValue)"
        }
    }
}

/// A view that displays AI messages with inline stat highlights
/// Highlights are created using **text** markdown-style syntax in the message
struct AIMessageView: View {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    var body: some View {
        // Parse the message and create a flow layout of text segments
        FlowTextView(segments: parseMessage(message))
    }

    /// Parses a message string and extracts highlighted segments
    /// Text wrapped in **double asterisks** becomes highlighted
    private func parseMessage(_ message: String) -> [AIMessageSegment] {
        var segments: [AIMessageSegment] = []
        var remaining = message

        while !remaining.isEmpty {
            // Find the next highlight marker
            if let startRange = remaining.range(of: "**") {
                // Add text before the marker
                let textBefore = String(remaining[..<startRange.lowerBound])
                if !textBefore.isEmpty {
                    segments.append(.text(textBefore))
                }

                // Find the closing marker
                let afterStart = remaining[startRange.upperBound...]
                if let endRange = afterStart.range(of: "**") {
                    // Extract the highlighted text
                    let highlightedText = String(afterStart[..<endRange.lowerBound])
                    segments.append(.highlight(highlightedText))
                    remaining = String(afterStart[endRange.upperBound...])
                } else {
                    // No closing marker, treat as regular text
                    remaining = String(afterStart)
                }
            } else {
                // No more markers, add remaining text
                segments.append(.text(remaining))
                remaining = ""
            }
        }

        return segments
    }
}

/// A view that lays out text and highlights in a flowing paragraph
struct FlowTextView: View {
    let segments: [AIMessageSegment]

    var body: some View {
        // Build attributed string with custom attributes for highlights
        Text(buildAttributedString())
            .font(AppTheme.Typography.aiMessageLarge)
            .foregroundColor(AppTheme.Colors.primaryText)
            .lineSpacing(6) // Approximates 1.55 line height
    }

    private func buildAttributedString() -> AttributedString {
        var result = AttributedString()

        for segment in segments {
            switch segment {
            case .text(let str):
                var attributedText = AttributedString(str)
                attributedText.font = AppTheme.Typography.aiMessageLarge
                attributedText.foregroundColor = AppTheme.Colors.primaryText
                result.append(attributedText)

            case .highlight(let str):
                // Add small space before for visual padding effect
                var spaceBefore = AttributedString(" ")
                spaceBefore.backgroundColor = AppTheme.Colors.statHighlight
                result.append(spaceBefore)

                // The highlighted text with visible background
                var attributedText = AttributedString(str)
                attributedText.font = Font.system(size: 19, weight: .semibold)
                attributedText.foregroundColor = AppTheme.Colors.primaryText
                attributedText.backgroundColor = AppTheme.Colors.statHighlight
                result.append(attributedText)

                // Add small space after for visual padding effect
                var spaceAfter = AttributedString(" ")
                spaceAfter.backgroundColor = AppTheme.Colors.statHighlight
                result.append(spaceAfter)
            }
        }

        return result
    }
}

/// Alternative view using HStack with wrapping for more control over highlight styling
struct AIMessageFlowView: View {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    private var segments: [AIMessageSegment] {
        parseMessage(message)
    }

    var body: some View {
        WrappingHStack(segments: segments)
    }

    private func parseMessage(_ message: String) -> [AIMessageSegment] {
        var segments: [AIMessageSegment] = []
        var remaining = message

        while !remaining.isEmpty {
            if let startRange = remaining.range(of: "**") {
                let textBefore = String(remaining[..<startRange.lowerBound])
                if !textBefore.isEmpty {
                    segments.append(.text(textBefore))
                }

                let afterStart = remaining[startRange.upperBound...]
                if let endRange = afterStart.range(of: "**") {
                    let highlightedText = String(afterStart[..<endRange.lowerBound])
                    segments.append(.highlight(highlightedText))
                    remaining = String(afterStart[endRange.upperBound...])
                } else {
                    remaining = String(afterStart)
                }
            } else {
                segments.append(.text(remaining))
                remaining = ""
            }
        }

        return segments
    }
}

/// A simple wrapping layout for text segments using Text concatenation
/// Note: Background colors aren't supported with Text concatenation, so highlights use bold only
struct WrappingHStack: View {
    let segments: [AIMessageSegment]

    var body: some View {
        // Concatenate into a single Text view for proper text wrapping
        // Note: .background() can't be used with Text concatenation, so highlights use bold styling
        segments.reduce(Text("")) { result, segment in
            switch segment {
            case .text(let str):
                return result + Text(str)
            case .highlight(let str):
                return result + Text(str)
                    .fontWeight(.semibold)
            }
        }
        .font(AppTheme.Typography.aiMessageLarge)
        .foregroundColor(AppTheme.Colors.primaryText)
        .lineSpacing(6)
    }
}

// MARK: - Stat Highlight Component

/// Individual stat highlight pill for inline use
struct StatHighlight: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 19, weight: .semibold))
            .foregroundColor(AppTheme.Colors.primaryText)
            .padding(.horizontal, 5)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(AppTheme.Colors.highlight)
            )
    }
}

// MARK: - Previews

#Preview("AI Message") {
    ZStack {
        AppTheme.Colors.background.ignoresSafeArea()

        VStack(alignment: .leading, spacing: 20) {
            AIMessageView("You've completed **3 workouts** this week. Your push strength is up **12%** from last month. Day **12** of your streak. Let's keep building.")

            Divider()

            AIMessageView("Welcome back! Ready for **Upper Body Strength** today? Your last session was **2 days ago** — perfect recovery time.")
        }
        .padding(.horizontal, 20)
    }
}
