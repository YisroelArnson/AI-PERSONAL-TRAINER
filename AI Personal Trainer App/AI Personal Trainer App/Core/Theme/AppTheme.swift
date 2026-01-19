//
//  AppTheme.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//

import SwiftUI

/// Centralized theme configuration for consistent design across the app
/// Design inspiration: Aurora weather app - warm gradients, frosted glass, calm aesthetics
enum AppTheme {
    // MARK: - Colors
    enum Colors {
        // Primary backgrounds - warm gradient palette
        static let backgroundGradientStart = Color(hex: "FDF8F3")  // Warm cream
        static let backgroundGradientEnd = Color(hex: "F9F0E8")    // Soft peach
        
        // Legacy background (for compatibility)
        static let background = Color(hex: "FDF8F3")
        
        // Card styling - frosted glass effect
        static let cardBackground = Color.white.opacity(0.85)
        static let cardBackgroundSolid = Color.white
        
        // Text hierarchy
        static let primaryText = Color(hex: "2E2A26")      // Warm charcoal
        static let secondaryText = Color(hex: "9A9590")    // Soft gray
        static let tertiaryText = Color(hex: "C5C0BB")     // Muted gray
        
        // Accents
        static let accent = Color(hex: "93E2C4")           // Soft mint (completion)
        static let accentSecondary = Color(hex: "7FB7FF")  // Soft blue
        static let warmAccent = Color(hex: "F4A574")       // Peachy-orange (orb glow)
        static let warmAccentLight = Color(hex: "FFDBC4")  // Light peach
        
        // Semantic colors
        static let success = Color(hex: "93E2C4")          // Soft mint
        static let warning = Color(hex: "F7C97D")          // Gentle amber
        static let border = Color(hex: "E8E4E0").opacity(0.6)
        
        // Exercise type colors (4-type system)
        static let reps = Color(hex: "F4A574")             // Warm orange (strength/bodyweight)
        static let hold = Color(hex: "C4A7E7")             // Soft lavender (isometric/balance)
        static let duration = Color(hex: "7FB7FF")         // Soft blue (cardio/yoga)
        static let intervals = Color(hex: "F7A0A0")        // Soft coral (HIIT)
    }
    
    // MARK: - Gradients
    enum Gradients {
        /// Main background gradient - warm cream to soft peach
        static var background: LinearGradient {
            LinearGradient(
                colors: [Colors.backgroundGradientStart, Colors.backgroundGradientEnd],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        
        /// Orb glow gradient - peachy pink ring
        static var orbGlow: AngularGradient {
            AngularGradient(
                colors: [
                    Colors.warmAccentLight,
                    Colors.warmAccent,
                    Color(hex: "F7C4D4"),  // Soft pink
                    Colors.warmAccentLight
                ],
                center: .center
            )
        }
        
        /// Subtle card shine
        static var cardShine: LinearGradient {
            LinearGradient(
                colors: [
                    Color.white.opacity(0.5),
                    Color.white.opacity(0.0)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
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
        static let xxxxl: CGFloat = 48
    }
    
    // MARK: - Corner Radius
    enum CornerRadius {
        static let small: CGFloat = 8
        static let medium: CGFloat = 12
        static let large: CGFloat = 20
        static let xlarge: CGFloat = 28
    }
    
    // MARK: - Shadow
    enum Shadow {
        // Frosted glass card shadow
        static let card = Color.black.opacity(0.04)
        static let cardRadius: CGFloat = 20
        static let cardOffset = CGSize(width: 0, height: 8)
        
        // Orb glow shadow
        static let orb = Colors.warmAccent.opacity(0.3)
        static let orbRadius: CGFloat = 20
        
        // Subtle button shadow
        static let button = Color.black.opacity(0.06)
        static let buttonRadius: CGFloat = 12
        static let buttonOffset = CGSize(width: 0, height: 4)
    }
    
    // MARK: - Typography
    enum Typography {
        // SF Pro Rounded for friendly, modern feel
        static let titleFont = Font.system(size: 28, weight: .bold, design: .rounded)
        static let title2Font = Font.system(size: 22, weight: .semibold, design: .rounded)
        static let headlineFont = Font.system(size: 17, weight: .semibold, design: .rounded)
        static let bodyFont = Font.system(size: 15, weight: .regular, design: .rounded)
        static let captionFont = Font.system(size: 12, weight: .medium, design: .rounded)
        
        // Sizes for manual configuration
        static let titleSize: CGFloat = 28
        static let title2Size: CGFloat = 22
        static let headlineSize: CGFloat = 17
        static let bodySize: CGFloat = 15
        static let captionSize: CGFloat = 12
    }
    
    // MARK: - Animation
    enum Animation {
        static let gentle = SwiftUI.Animation.easeInOut(duration: 0.3)
        static let slow = SwiftUI.Animation.easeInOut(duration: 0.5)
        static let spring = SwiftUI.Animation.spring(response: 0.4, dampingFraction: 0.7)
        
        // Breathing animation for orb
        static let breathing = SwiftUI.Animation.easeInOut(duration: 2.0).repeatForever(autoreverses: true)
    }
}
