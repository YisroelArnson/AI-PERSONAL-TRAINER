import SwiftUI

struct TypewriterTextView: View {
    let text: String
    let font: Font
    let color: Color
    let wordDelay: Double
    var onComplete: (() -> Void)?

    @State private var displayedText = ""
    @State private var currentWordIndex = 0
    @State private var isComplete = false

    private var words: [String] {
        text.split(separator: " ").map(String.init)
    }

    init(
        text: String,
        font: Font = .system(size: 24, weight: .medium),
        color: Color = AppTheme.Colors.primaryText,
        wordDelay: Double = 0.08,
        onComplete: (() -> Void)? = nil
    ) {
        self.text = text
        self.font = font
        self.color = color
        self.wordDelay = wordDelay
        self.onComplete = onComplete
    }

    var body: some View {
        Text(displayedText)
            .font(font)
            .foregroundColor(color)
            .multilineTextAlignment(.center)
            .onAppear {
                startAnimation()
            }
    }

    private func startAnimation() {
        guard !words.isEmpty else {
            isComplete = true
            onComplete?()
            return
        }

        displayedText = ""
        currentWordIndex = 0
        animateNextWord()
    }

    private func animateNextWord() {
        guard currentWordIndex < words.count else {
            isComplete = true
            onComplete?()
            return
        }

        let word = words[currentWordIndex]

        if displayedText.isEmpty {
            displayedText = word
        } else {
            displayedText += " " + word
        }

        currentWordIndex += 1

        DispatchQueue.main.asyncAfter(deadline: .now() + wordDelay) {
            animateNextWord()
        }
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
