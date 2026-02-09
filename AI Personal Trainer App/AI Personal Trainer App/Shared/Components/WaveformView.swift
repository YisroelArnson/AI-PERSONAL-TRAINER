import SwiftUI

struct WaveformView: View {
    let active: Bool

    private let barCount = 20
    private let barWidth: CGFloat = 3
    private let barSpacing: CGFloat = 2

    @State private var barHeights: [CGFloat] = Array(repeating: 4, count: 20)

    var body: some View {
        HStack(spacing: barSpacing) {
            ForEach(0..<barCount, id: \.self) { index in
                RoundedRectangle(cornerRadius: 2)
                    .fill(active ? AppTheme.Colors.danger : AppTheme.Colors.tertiaryText)
                    .frame(width: barWidth, height: barHeights[index])
                    .animation(
                        .easeInOut(duration: 0.15).delay(Double(index) * 0.02),
                        value: barHeights[index]
                    )
            }
        }
        .frame(height: 20)
        .onAppear {
            if active { startAnimating() }
        }
        .onChange(of: active) { _, isActive in
            if isActive {
                startAnimating()
            } else {
                stopAnimating()
            }
        }
    }

    private func startAnimating() {
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
            guard active else {
                timer.invalidate()
                return
            }
            withAnimation {
                barHeights = (0..<barCount).map { _ in
                    CGFloat.random(in: 6...20)
                }
            }
        }
    }

    private func stopAnimating() {
        withAnimation {
            barHeights = Array(repeating: 4, count: barCount)
        }
    }
}
