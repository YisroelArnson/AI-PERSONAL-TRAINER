import SwiftUI

struct TypewriterTextView: View {
    let text: String
    let font: Font
    let color: Color
    let wordDelay: Double
    let fadeDuration: Double
    var onComplete: (() -> Void)?

    @State private var visibleWordCount = 0
    @State private var wordOpacities: [Double] = []

    private var words: [String] {
        text.split(separator: " ").map(String.init)
    }

    init(
        text: String,
        font: Font = .system(size: 24, weight: .medium),
        color: Color = AppTheme.Colors.primaryText,
        wordDelay: Double = 0.08,
        fadeDuration: Double = 0.25,
        onComplete: (() -> Void)? = nil
    ) {
        self.text = text
        self.font = font
        self.color = color
        self.wordDelay = wordDelay
        self.fadeDuration = fadeDuration
        self.onComplete = onComplete
    }

    var body: some View {
        CenteredFlowLayout(spacing: 6) {
            ForEach(Array(words.enumerated()), id: \.offset) { index, word in
                Text(word)
                    .font(font)
                    .foregroundColor(color)
                    .opacity(index < wordOpacities.count ? wordOpacities[index] : 0)
            }
        }
        .multilineTextAlignment(.center)
        .onAppear {
            startAnimation()
        }
    }

    private func startAnimation() {
        guard !words.isEmpty else {
            onComplete?()
            return
        }

        // Initialize all words as invisible
        wordOpacities = Array(repeating: 0, count: words.count)
        visibleWordCount = 0
        animateNextWord()
    }

    private func animateNextWord() {
        guard visibleWordCount < words.count else {
            onComplete?()
            return
        }

        let currentIndex = visibleWordCount
        visibleWordCount += 1

        withAnimation(.easeOut(duration: fadeDuration)) {
            wordOpacities[currentIndex] = 1.0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + wordDelay) {
            animateNextWord()
        }
    }
}

// MARK: - Centered Flow Layout for wrapping words

struct CenteredFlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let arrangement = arrangeSubviews(proposal: proposal, subviews: subviews)

        for (index, position) in arrangement.positions.enumerated() {
            let subview = subviews[index]
            subview.place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: .unspecified
            )
        }
    }

    private func arrangeSubviews(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var totalWidth: CGFloat = 0
        var lineStartIndex = 0

        // First pass: calculate positions and find line breaks
        var lineRanges: [(start: Int, end: Int, width: CGFloat)] = []
        var currentLineWidth: CGFloat = 0

        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)

            if currentX + size.width > maxWidth && currentX > 0 {
                // Store line info for centering
                lineRanges.append((lineStartIndex, index - 1, currentLineWidth - spacing))
                lineStartIndex = index

                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
                currentLineWidth = 0
            }

            positions.append(CGPoint(x: currentX, y: currentY))
            currentX += size.width + spacing
            currentLineWidth += size.width + spacing
            lineHeight = max(lineHeight, size.height)
            totalWidth = max(totalWidth, currentX - spacing)
        }

        // Don't forget the last line
        if lineStartIndex < subviews.count {
            lineRanges.append((lineStartIndex, subviews.count - 1, currentLineWidth - spacing))
        }

        let totalHeight = currentY + lineHeight

        // Center each line
        for lineRange in lineRanges {
            let lineOffset = (maxWidth - lineRange.width) / 2
            for i in lineRange.start...lineRange.end {
                positions[i].x += lineOffset
            }
        }

        return (CGSize(width: min(totalWidth, maxWidth), height: totalHeight), positions)
    }
}

struct TypewriterTextView_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            AppTheme.Colors.background
                .ignoresSafeArea()

            TypewriterTextView(
                text: "I'm your AI personal trainer. Together, we'll build a program designed specifically for you.",
                font: .system(size: 20, weight: .medium),
                wordDelay: 0.1
            ) {
                print("Animation complete")
            }
            .padding()
        }
    }
}
