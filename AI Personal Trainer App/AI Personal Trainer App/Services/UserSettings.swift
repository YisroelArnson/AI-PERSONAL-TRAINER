//
//  UserSettings.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/2/25.
//

import Foundation
import SwiftUI

/// Centralized settings storage for user preferences
@MainActor
class UserSettings: ObservableObject {
    static let shared = UserSettings()
    
    // MARK: - Published Settings
    
    @AppStorage("isAutoDetectLocationEnabled")
    var isAutoDetectLocationEnabled: Bool = false
    
    private init() {}
    
    // MARK: - Helper Methods
    
    /// Reset all settings to defaults
    func resetToDefaults() {
        isAutoDetectLocationEnabled = false
    }
}

