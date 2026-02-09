import SwiftUI

struct SegmentedProgressBar: View {
    let currentStep: Int

    private var sections: [(label: OnboardingSection, startIndex: Int, count: Int)] {
        OnboardingScreens.sections
    }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(sections.enumerated()), id: \.offset) { sectionIndex, section in
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(AppTheme.Colors.surface)

                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(AppTheme.Colors.primaryText)
                            .frame(width: geometry.size.width * fillFraction(for: section))
                            .animation(.easeInOut(duration: 0.4), value: currentStep)
                    }
                }
                .frame(height: 3)
            }
        }
        .frame(height: 3)
    }

    private func fillFraction(for section: (label: OnboardingSection, startIndex: Int, count: Int)) -> CGFloat {
        let sectionEnd = section.startIndex + section.count - 1

        if currentStep > sectionEnd {
            return 1.0
        } else if currentStep < section.startIndex {
            return 0.0
        } else {
            let progress = currentStep - section.startIndex
            return CGFloat(progress + 1) / CGFloat(section.count)
        }
    }
}
