import SwiftUI

struct BirthdayPickerScreenView: View {
    let screen: OnboardingScreen
    let value: Date?
    let onChange: (Date) -> Void
    let onNext: () -> Void

    @State private var selectedDate: Date

    init(screen: OnboardingScreen, value: Date?, onChange: @escaping (Date) -> Void, onNext: @escaping () -> Void) {
        self.screen = screen
        self.value = value
        self.onChange = onChange
        self.onNext = onNext

        // Default: June 15, 1996
        let defaultComponents = screen.birthdayDefault ?? DateComponents(year: 1996, month: 6, day: 15)
        let defaultDate = Calendar.current.date(from: defaultComponents) ?? Date()
        _selectedDate = State(initialValue: value ?? defaultDate)
    }

    private var minDate: Date {
        // 120 years ago
        Calendar.current.date(byAdding: .year, value: -120, to: Date()) ?? Date()
    }

    private var maxDate: Date {
        // Must be at least 13
        Calendar.current.date(byAdding: .year, value: -13, to: Date()) ?? Date()
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Question
            Text(screen.question ?? "When were you born?")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(AppTheme.Colors.primaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 20)

            // Date picker (wheel style)
            DatePicker(
                "",
                selection: $selectedDate,
                in: minDate...maxDate,
                displayedComponents: .date
            )
            .datePickerStyle(.wheel)
            .labelsHidden()
            .padding(.horizontal, 20)
            .onChange(of: selectedDate) { _, newValue in
                onChange(newValue)
            }

            Spacer()

            // Next button
            Button(action: {
                Haptic.medium()
                onChange(selectedDate)
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
