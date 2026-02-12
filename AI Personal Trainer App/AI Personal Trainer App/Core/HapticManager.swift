import UIKit

/// Centralized haptic feedback for consistent tactile response across the app.
enum Haptic {

    // MARK: - Impact

    /// Light tap — picker scrolls, toggles, secondary actions
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// Medium tap — primary buttons ("Get Started", "Next", "Continue")
    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    // MARK: - Selection

    /// Selection change — radio-button style options, checkbox toggles
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    // MARK: - Notification

    /// Success — milestone completion, confetti moments, verification success
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /// Error — validation failure, auth error
    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
