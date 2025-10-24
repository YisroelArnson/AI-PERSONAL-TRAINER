//
//  AppTheme.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

/// Centralized theme configuration for consistent design across the app
enum AppTheme {
    // MARK: - Colors
    enum Colors {
        static let background = Color(hex: "f5f6f7")
        static let cardBackground = Color(hex: "ffffff")
        static let primaryText = Color(hex: "212529")
        static let secondaryText = Color(hex: "212529").opacity(0.6)
        static let tertiaryText = Color(hex: "212529").opacity(0.5)
        static let border = Color(hex: "e0e0e0").opacity(0.4)
        
        // Exercise type colors
        static let strength = Color.orange
        static let cardio = Color.blue
        static let hiit = Color.red
        static let bodyweight = Color.green
        static let isometric = Color.purple
        static let flexibility = Color.pink
        static let yoga = Color.mint
    }
    
    // MARK: - Spacing
    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 24
        static let xxxl: CGFloat = 32
    }
    
    // MARK: - Corner Radius
    enum CornerRadius {
        static let small: CGFloat = 8
        static let medium: CGFloat = 12
        static let large: CGFloat = 20
    }
    
    // MARK: - Shadow
    enum Shadow {
        static let card = Color.black.opacity(0.06)
        static let cardRadius: CGFloat = 12
        static let cardOffset = CGSize(width: 0, height: 4)
        
        static let button = Color.black.opacity(0.08)
        static let buttonRadius: CGFloat = 10
        static let buttonOffset = CGSize(width: 0, height: 5)
    }
    
    // MARK: - Typography
    enum Typography {
        static let titleSize: CGFloat = 28
        static let title2Size: CGFloat = 22
        static let headlineSize: CGFloat = 17
        static let bodySize: CGFloat = 15
        static let captionSize: CGFloat = 12
    }
}

