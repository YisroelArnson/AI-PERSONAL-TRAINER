// Defines iOS app code for haptic manager.
//
// Main functions in this file:
// - light: Handles Light for HapticManager.swift.
// - medium: Handles Medium for HapticManager.swift.
// - selection: Handles Selection for HapticManager.swift.
// - success: Handles Success for HapticManager.swift.
// - error: Handles Error for HapticManager.swift.

import UIKit

/// Centralized haptic feedback for consistent tactile response across the app.
enum Haptic {

    // MARK: - Impact

    /// Handles Light for HapticManager.swift.
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// Handles Medium for HapticManager.swift.
    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    // MARK: - Selection

    /// Handles Selection for HapticManager.swift.
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    // MARK: - Notification

    /// Handles Success for HapticManager.swift.
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /// Handles Error for HapticManager.swift.
    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
