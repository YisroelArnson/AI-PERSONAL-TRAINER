//
//  DistributionModels.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/16/25.
//

import Foundation
import SwiftUI

struct DistributionMetrics: Codable {
    let trackingSince: String?
    let totalExercises: Int
    let categories: [String: DistributionData]
    let muscles: [String: DistributionData]
    let hasData: Bool
}

struct DistributionData: Codable {
    let target: Double
    let actual: Double
    let debt: Double
    let totalShare: Double
    
    var debtPercentage: Double {
        debt * 100
    }
    
    var isOnTarget: Bool {
        abs(debt) < 0.05
    }
    
    var statusColor: Color {
        isOnTarget ? AppTheme.Colors.primaryText : AppTheme.Colors.secondaryText
    }
    
    var debtText: String {
        if isOnTarget {
            return "On target"
        }
        let sign = debt > 0 ? "+" : ""
        return "\(sign)\(Int(debtPercentage))%"
    }
}

struct DistributionAPIResponse: Codable {
    let success: Bool
    let data: DistributionMetrics
}
