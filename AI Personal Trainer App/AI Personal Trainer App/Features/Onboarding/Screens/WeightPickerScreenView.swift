import SwiftUI

struct WeightPickerScreenView: View {
    let screen: OnboardingScreen
    let valueLbs: Double?
    let onChange: (Double) -> Void
    let onNext: () -> Void

    @State private var unitIndex = 0 // 0 = lbs, 1 = kg
    @State private var selectedLbs: Int

    init(screen: OnboardingScreen, valueLbs: Double?, onChange: @escaping (Double) -> Void, onNext: @escaping () -> Void) {
        self.screen = screen
        self.valueLbs = valueLbs
        self.onChange = onChange
        self.onNext = onNext
        _selectedLbs = State(initialValue: Int(valueLbs ?? screen.weightDefaultLbs ?? 160.0))
    }

    private var minLbs: Int { Int(screen.weightMinLbs ?? 60.0) }
    private var maxLbs: Int { Int(screen.weightMaxLbs ?? 500.0) }

    var body: some View {
        VStack(spacing: 0) {
            // Question
            Text(screen.question ?? "What's your current weight?")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.top, 28)
                .padding(.bottom, 16)

            // Unit toggle
            UnitToggle(
                options: ["Pounds", "Kilograms"],
                selectedIndex: $unitIndex
            )
            .frame(width: 220)
            .padding(.bottom, 8)

            Spacer()

            // Picker — fills available space
            Picker("Weight", selection: $selectedLbs) {
                ForEach(minLbs...maxLbs, id: \.self) { lbs in
                    if unitIndex == 0 {
                        Text("\(lbs) lbs")
                            .tag(lbs)
                    } else {
                        let kg = Int(round(Double(lbs) * 0.453592))
                        Text("\(kg) kg")
                            .tag(lbs)
                    }
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 220)
            .padding(.horizontal, 40)
            .onChange(of: selectedLbs) { _, newValue in
                Haptic.light()
                onChange(Double(newValue))
            }

            Spacer()

            // Next button
            Button(action: {
                Haptic.medium()
                onChange(Double(selectedLbs))
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
    }
}
