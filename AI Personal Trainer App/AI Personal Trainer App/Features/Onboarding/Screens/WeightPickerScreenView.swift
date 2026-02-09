import SwiftUI

struct WeightPickerScreenView: View {
    let screen: OnboardingScreen
    let valueLbs: Double?
    let onChange: (Double) -> Void
    let onNext: () -> Void

    @State private var unitIndex = 0 // 0 = lbs, 1 = kg
    @State private var selectedWeight: Double

    init(screen: OnboardingScreen, valueLbs: Double?, onChange: @escaping (Double) -> Void, onNext: @escaping () -> Void) {
        self.screen = screen
        self.valueLbs = valueLbs
        self.onChange = onChange
        self.onNext = onNext
        _selectedWeight = State(initialValue: valueLbs ?? screen.weightDefaultLbs ?? 160.0)
    }

    private var minLbs: Double { screen.weightMinLbs ?? 60.0 }
    private var maxLbs: Double { screen.weightMaxLbs ?? 500.0 }

    private var displayText: String {
        if unitIndex == 0 {
            return String(format: "%.1f lbs", selectedWeight)
        } else {
            let kg = selectedWeight * 0.453592
            return String(format: "%.1f kg", kg)
        }
    }

    // Weight values in 1-lb increments for the picker
    private var weightValues: [Int] {
        Array(Int(minLbs)...Int(maxLbs))
    }

    @State private var selectedWholeLbs: Int = 160

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Question
            Text(screen.question ?? "What's your current weight?")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)

            // Unit toggle
            UnitToggle(
                options: ["Pounds", "Kilograms"],
                selectedIndex: $unitIndex
            )
            .frame(width: 220)
            .padding(.bottom, 20)

            // Weight display
            Text(displayText)
                .font(.system(size: 36, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.bottom, 12)

            // Horizontal ruler
            WeightRulerView(
                value: $selectedWeight,
                minValue: minLbs,
                maxValue: maxLbs,
                useKg: unitIndex == 1
            )
            .frame(height: 80)
            .padding(.horizontal, 20)

            Spacer()

            // Next button
            Button(action: {
                onChange(selectedWeight)
                onNext()
            }) {
                Text("Next")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.background)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(AppTheme.Colors.primaryText)
                    .cornerRadius(AppTheme.CornerRadius.large)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 40)
        }
        .onAppear {
            selectedWholeLbs = Int(selectedWeight)
        }
    }
}

// MARK: - Weight Ruler View

struct WeightRulerView: View {
    @Binding var value: Double
    let minValue: Double
    let maxValue: Double
    let useKg: Bool

    private let tickSpacing: CGFloat = 8
    private let majorTickInterval = 10 // Major tick every 10 units

    private var displayValue: Double {
        useKg ? value * 0.453592 : value
    }

    var body: some View {
        GeometryReader { geometry in
            let centerX = geometry.size.width / 2
            let totalTicks = Int((maxValue - minValue) * 10) // 0.1 increments
            let totalWidth = CGFloat(totalTicks) * tickSpacing
            let offset = CGFloat((value - minValue) * 10) * tickSpacing

            ZStack {
                // Scrollable ruler
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 0) {
                            // Leading spacer
                            Spacer().frame(width: centerX)

                            // Tick marks
                            ForEach(0...totalTicks, id: \.self) { tick in
                                let tickValue = minValue + Double(tick) * 0.1
                                let isMajor = tick % 10 == 0
                                let isHalf = tick % 5 == 0

                                VStack(spacing: 2) {
                                    Rectangle()
                                        .fill(AppTheme.Colors.tertiaryText)
                                        .frame(
                                            width: 1,
                                            height: isMajor ? 32 : (isHalf ? 20 : 12)
                                        )

                                    if isMajor {
                                        let label = useKg ? Int(tickValue * 0.453592) : Int(tickValue)
                                        Text("\(label)")
                                            .font(.system(size: 11))
                                            .foregroundColor(AppTheme.Colors.tertiaryText)
                                    }
                                }
                                .frame(width: tickSpacing)
                                .id(tick)
                            }

                            // Trailing spacer
                            Spacer().frame(width: centerX)
                        }
                    }
                    .onAppear {
                        let tick = Int((value - minValue) * 10)
                        proxy.scrollTo(tick, anchor: .center)
                    }
                }

                // Center indicator
                Rectangle()
                    .fill(AppTheme.Colors.orbSkyDeep)
                    .frame(width: 2, height: 44)
                    .position(x: centerX, y: 22)
            }
        }
    }
}
