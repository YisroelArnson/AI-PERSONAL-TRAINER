import SwiftUI

struct FeatureTourOverlay: View {
    @ObservedObject var tourManager: FeatureTourManager
    let highlights: [String: Anchor<CGRect>]

    var body: some View {
        GeometryReader { proxy in
            if tourManager.isShowingTour, let currentStep = tourManager.currentStep {
                ZStack {
                    // Dimmed background with cutout
                    overlayBackground(proxy: proxy, highlightKey: currentStep.highlightKey)

                    // Tooltip
                    tooltipView(currentStep, proxy: proxy)
                }
                .ignoresSafeArea()
                .transition(.opacity)
            }
        }
    }

    // MARK: - Overlay Background

    private func overlayBackground(proxy: GeometryProxy, highlightKey: String) -> some View {
        ZStack {
            // Full screen dim
            Color.black.opacity(0.6)

            // Cutout for highlighted element
            if let anchor = highlights[highlightKey] {
                let rect = proxy[anchor]
                let paddedRect = rect.insetBy(dx: -8, dy: -8)

                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.medium)
                    .frame(width: paddedRect.width, height: paddedRect.height)
                    .position(x: paddedRect.midX, y: paddedRect.midY)
                    .blendMode(.destinationOut)
            }
        }
        .compositingGroup()
    }

    // MARK: - Tooltip

    private func tooltipView(_ step: TourStepDefinition, proxy: GeometryProxy) -> some View {
        VStack {
            if let anchor = highlights[step.highlightKey] {
                let rect = proxy[anchor]
                let isTopHalf = rect.midY < proxy.size.height / 2

                if isTopHalf {
                    Spacer()
                        .frame(height: rect.maxY + 20)
                }

                tooltipContent(step)
                    .padding(.horizontal, AppTheme.Spacing.xxl)

                if !isTopHalf {
                    Spacer()
                }
            } else {
                // Fallback: center the tooltip
                Spacer()
                tooltipContent(step)
                    .padding(.horizontal, AppTheme.Spacing.xxl)
                Spacer()
            }
        }
    }

    private func tooltipContent(_ step: TourStepDefinition) -> some View {
        VStack(spacing: AppTheme.Spacing.lg) {
            // Content
            VStack(spacing: AppTheme.Spacing.sm) {
                Text(step.title)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(AppTheme.Colors.primaryText)

                Text(step.description)
                    .font(.system(size: 15))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
            }

            // Progress dots
            HStack(spacing: AppTheme.Spacing.sm) {
                ForEach(0..<tourManager.tourSteps.count, id: \.self) { index in
                    Circle()
                        .fill(index == tourManager.currentStepIndex ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryText.opacity(0.3))
                        .frame(width: 8, height: 8)
                }
            }

            // Buttons
            HStack(spacing: AppTheme.Spacing.lg) {
                Button(action: { tourManager.skipTour() }) {
                    Text("Skip")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }

                Button(action: { tourManager.nextStep() }) {
                    Text(tourManager.isLastStep ? "Got it" : "Next")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.background)
                        .padding(.horizontal, AppTheme.Spacing.xxl)
                        .padding(.vertical, AppTheme.Spacing.md)
                        .background(AppTheme.Colors.primaryText)
                        .cornerRadius(AppTheme.CornerRadius.pill)
                }
            }
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.CornerRadius.large)
        .shadow(color: Color.black.opacity(0.2), radius: 20, x: 0, y: 10)
    }
}

// MARK: - View Modifier

struct FeatureTourModifier: ViewModifier {
    @StateObject private var tourManager = FeatureTourManager.shared
    @State private var highlights: [String: Anchor<CGRect>] = [:]

    func body(content: Content) -> some View {
        content
            .onPreferenceChange(HighlightBoundsPreferenceKey.self) { preferences in
                highlights = preferences
            }
            .overlayPreferenceValue(HighlightBoundsPreferenceKey.self) { _ in
                FeatureTourOverlay(tourManager: tourManager, highlights: highlights)
            }
            .onAppear {
                if tourManager.shouldShowTour {
                    // Delay slightly to allow layout to complete
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        tourManager.startTour()
                    }
                }
            }
    }
}

extension View {
    func withFeatureTour() -> some View {
        modifier(FeatureTourModifier())
    }
}

#Preview {
    ZStack {
        AppTheme.Colors.background
            .ignoresSafeArea()

        VStack {
            Text("Home View Content")
                .tourHighlight("workout_button")

            Spacer()
        }
        .padding()
    }
    .withFeatureTour()
}
