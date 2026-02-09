import SwiftUI

struct IntroNarrationView: View {
    let onNext: () -> Void

    private static let lines = [
        "I make getting in shape simple.",
        "I'll build a workout plan around your life, your goals, and your body.",
        "As you progress, I adapt — so your plan always fits.",
        "And when you're training, I'm right there to guide every rep.",
    ]

    @State private var orbSize: CGFloat = 140
    @State private var orbX: CGFloat = 0
    @State private var orbY: CGFloat = 0
    @State private var currentLine: Int = -1
    @State private var hasTransitioned = false
    @State private var skipped = false

    private let lineSpacing: CGFloat = 44
    private let textStartY: CGFloat = 100
    private let orbLeftX: CGFloat = 28

    var body: some View {
        ZStack {
            // Subtle background glow (left-biased)
            RadialGradient(
                gradient: Gradient(colors: [
                    AppTheme.Colors.orbSkyMid.opacity(0.05),
                    Color.clear
                ]),
                center: UnitPoint(x: 0.2, y: 0.3),
                startRadius: 0,
                endRadius: 300
            )
            .ignoresSafeArea()

            GeometryReader { geometry in
                let centerX = geometry.size.width / 2
                let centerY = geometry.size.height * 0.35

                ZStack(alignment: .topLeading) {
                    // Orb
                    OnboardingOrbView(size: orbSize)
                        .position(
                            x: hasTransitioned ? orbLeftX + orbSize / 2 : centerX,
                            y: hasTransitioned ? textStartY + CGFloat(max(0, currentLine)) * lineSpacing : centerY
                        )
                        .animation(.spring(response: 0.6, dampingFraction: 0.8), value: hasTransitioned)
                        .animation(.easeInOut(duration: 0.4), value: currentLine)

                    // Text lines
                    VStack(alignment: .leading, spacing: lineSpacing - 22) {
                        ForEach(0..<Self.lines.count, id: \.self) { index in
                            if currentLine >= index {
                                TypewriterTextView(
                                    text: Self.lines[index],
                                    font: .system(size: 17, weight: .regular),
                                    color: AppTheme.Colors.secondaryText,
                                    wordDelay: 0.08,
                                    fadeDuration: 0.25,
                                    onComplete: {
                                        lineCompleted(index)
                                    }
                                )
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .transition(.opacity)
                            }
                        }
                    }
                    .padding(.leading, orbLeftX + 48)
                    .padding(.trailing, 28)
                    .padding(.top, textStartY - 8)
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            guard !skipped else { return }
            skipped = true
            onNext()
        }
        .onAppear {
            startSequence()
        }
    }

    private func startSequence() {
        // Shrink and move orb after a brief delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation {
                orbSize = 32
                hasTransitioned = true
            }
        }

        // Start first line after orb settles
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            guard !skipped else { return }
            withAnimation(.easeOut(duration: 0.3)) {
                currentLine = 0
            }
        }
    }

    private func lineCompleted(_ index: Int) {
        guard !skipped else { return }

        if index < Self.lines.count - 1 {
            // Move orb down and start next line
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                guard !skipped else { return }
                withAnimation(.easeOut(duration: 0.3)) {
                    currentLine = index + 1
                }
            }
        } else {
            // Last line done — pause then auto-advance
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                guard !skipped else { return }
                onNext()
            }
        }
    }
}
