import SwiftUI

struct HeightPickerScreenView: View {
    let screen: OnboardingScreen
    let valueInches: Int?
    let onChange: (Int) -> Void
    let onNext: () -> Void

    @State private var unitIndex = 0 // 0 = ft/in, 1 = cm
    @State private var selectedInches: Int

    init(screen: OnboardingScreen, valueInches: Int?, onChange: @escaping (Int) -> Void, onNext: @escaping () -> Void) {
        self.screen = screen
        self.valueInches = valueInches
        self.onChange = onChange
        self.onNext = onNext
        _selectedInches = State(initialValue: valueInches ?? screen.heightDefaultInches ?? 67)
    }

    private var minInches: Int { screen.heightMinInches ?? 48 }
    private var maxInches: Int { screen.heightMaxInches ?? 96 }

    private var displayText: String {
        if unitIndex == 0 {
            let feet = selectedInches / 12
            let inches = selectedInches % 12
            return "\(feet) ft \(inches) in"
        } else {
            let cm = Int(round(Double(selectedInches) * 2.54))
            return "\(cm) cm"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Question
            Text(screen.question ?? "How tall are you?")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)

            // Unit toggle
            UnitToggle(
                options: ["Feet & Inches", "Centimeters"],
                selectedIndex: $unitIndex
            )
            .frame(width: 260)
            .padding(.bottom, 20)

            // Height display
            Text(displayText)
                .font(.system(size: 36, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.bottom, 12)

            // Picker
            Picker("Height", selection: $selectedInches) {
                ForEach(minInches...maxInches, id: \.self) { inches in
                    if unitIndex == 0 {
                        let ft = inches / 12
                        let inch = inches % 12
                        Text("\(ft) ft \(inch) in")
                            .tag(inches)
                    } else {
                        let cm = Int(round(Double(inches) * 2.54))
                        Text("\(cm) cm")
                            .tag(inches)
                    }
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 150)
            .padding(.horizontal, 40)
            .onChange(of: selectedInches) { _, newValue in
                let haptic = UIImpactFeedbackGenerator(style: .light)
                haptic.impactOccurred()
                onChange(newValue)
            }

            Spacer()

            // Next button
            Button(action: {
                onChange(selectedInches)
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
