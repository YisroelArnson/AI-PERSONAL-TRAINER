//
//  AppTheme.swift
//  AI Personal Trainer App
//
//  Updated to match design-schema.json (minimal flat monochrome, orb-only color).
//

import SwiftUI

/// Centralized theme configuration for consistent design across the app
/// Design inspiration: Minimal flat monochrome with a single colorful AI orb.
enum AppTheme {
    // MARK: - Colors
    enum Colors {
        private static func dynamic(light: UIColor, dark: UIColor) -> Color {
            Color(UIColor { traits in
                traits.userInterfaceStyle == .dark ? dark : light
            })
        }

        static let background = dynamic(light: UIColor(hex: "FFFFFF"), dark: UIColor(hex: "000000"))
        static let surface = dynamic(light: UIColor(hex: "F5F5F7"), dark: UIColor(hex: "111111"))
        static let surfaceHover = dynamic(light: UIColor(hex: "EBEBED"), dark: UIColor(hex: "1A1A1A"))

        static let primaryText = dynamic(light: UIColor(hex: "000000"), dark: UIColor(hex: "FFFFFF"))
        static let secondaryText = dynamic(light: UIColor(hex: "000000").withAlphaComponent(0.6), dark: UIColor(hex: "FFFFFF").withAlphaComponent(0.6))
        static let tertiaryText = dynamic(light: UIColor(hex: "000000").withAlphaComponent(0.4), dark: UIColor(hex: "FFFFFF").withAlphaComponent(0.4))

        static let divider = dynamic(light: UIColor(hex: "000000").withAlphaComponent(0.06), dark: UIColor(hex: "FFFFFF").withAlphaComponent(0.08))
        static let highlight = dynamic(light: UIColor(hex: "000000").withAlphaComponent(0.06), dark: UIColor(hex: "FFFFFF").withAlphaComponent(0.1))

        // Stat highlight - for inline text highlights (matches design-schema.json)
        static let statHighlight = dynamic(light: UIColor(hex: "000000").withAlphaComponent(0.06), dark: UIColor(hex: "FFFFFF").withAlphaComponent(0.1))

        static let accent = primaryText
        static let danger = Color(hex: "FF3B30")

        // Legacy aliases
        static let cardBackground = surface
        static let cardBackgroundSolid = surface
        static let warmAccent = primaryText
        static let warmAccentLight = primaryText
        static let success = primaryText
        static let warning = primaryText
        static let border = Color.clear

        // Orb colors - sky blue/cloud palette (matching AIOrb from intake)
        static let orbSkyLight = Color(red: 0.7, green: 0.85, blue: 0.95)
        static let orbSkyMid = Color(red: 0.4, green: 0.7, blue: 0.9)
        static let orbSkyDeep = Color(red: 0.2, green: 0.5, blue: 0.85)
        static let orbCloudWhite = Color(red: 0.95, green: 0.97, blue: 1.0)

        // Legacy orb colors (kept for compatibility)
        static let orbBlue = orbSkyMid
        static let orbBlueLight = orbSkyLight
        static let orbBlueDeep = orbSkyDeep
    }

    // MARK: - Gradients
    enum Gradients {
        static var background: LinearGradient {
            LinearGradient(
                colors: [Colors.background, Colors.background],
                startPoint: .top,
                endPoint: .bottom
            )
        }

        static var orb: LinearGradient {
            LinearGradient(
                gradient: Gradient(stops: [
                    .init(color: Colors.orbCloudWhite.opacity(0.95), location: 0),
                    .init(color: Colors.orbSkyLight, location: 0.3),
                    .init(color: Colors.orbSkyMid, location: 0.6),
                    .init(color: Colors.orbSkyDeep, location: 1.0)
                ]),
                startPoint: .top,
                endPoint: .bottom
            )
        }

        static var cardShine: LinearGradient {
            LinearGradient(
                colors: [Color.clear, Color.clear],
                startPoint: .top,
                endPoint: .bottom
            )
        }
    }

    // MARK: - Spacing
    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 10
        static let lg: CGFloat = 14
        static let xl: CGFloat = 16
        static let xxl: CGFloat = 20
        static let xxxl: CGFloat = 24
        static let xxxxl: CGFloat = 28
    }

    // MARK: - Corner Radius
    enum CornerRadius {
        static let small: CGFloat = 7
        static let medium: CGFloat = 11
        static let large: CGFloat = 15
        static let xlarge: CGFloat = 20
        static let pill: CGFloat = 44
    }

    // MARK: - Shadow
    enum Shadow {
        static let card = Color.clear
        static let cardRadius: CGFloat = 0
        static let cardOffset = CGSize(width: 0, height: 0)

        static let orb = Colors.orbSkyDeep.opacity(0.3)
        static let orbRadius: CGFloat = 12

        static let button = Color.clear
        static let buttonRadius: CGFloat = 0
        static let buttonOffset = CGSize(width: 0, height: 0)
    }

    // MARK: - Typography
    enum Typography {
        static let screenTitle = Font.system(size: 17, weight: .semibold)
        static let aiMessageLarge = Font.system(size: 19, weight: .regular)
        static let aiMessageMedium = Font.system(size: 16, weight: .regular)
        static let profileName = Font.system(size: 18, weight: .semibold)
        static let statNumber = Font.system(size: 24, weight: .bold)
        static let cardTitle = Font.system(size: 15, weight: .semibold)
        static let cardSubtitle = Font.system(size: 13, weight: .regular)
        static let button = Font.system(size: 14, weight: .semibold)
        static let caption = Font.system(size: 14, weight: .medium)
        static let label = Font.system(size: 12, weight: .medium)
        static let input = Font.system(size: 15, weight: .regular)
        static let pillText = Font.system(size: 14, weight: .medium)
        static let modalItem = Font.system(size: 15, weight: .medium)
        static let suggestedPrompt = Font.system(size: 13, weight: .medium)
    }

    // MARK: - Animation
    enum Animation {
        static let gentle = SwiftUI.Animation.easeInOut(duration: 0.15)
        static let slow = SwiftUI.Animation.easeInOut(duration: 0.3)
        static let spring = SwiftUI.Animation.spring(response: 0.3, dampingFraction: 0.8)
    }
}
