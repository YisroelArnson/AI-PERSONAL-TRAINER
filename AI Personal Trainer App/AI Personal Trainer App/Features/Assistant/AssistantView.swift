//
//  AssistantView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/6/25.
//
//  NOTE: This view has been superseded by AssistantOverlayView.
//  The new overlay system provides a floating chat interface that
//  works across all screens. This file is kept for reference.
//

import SwiftUI

/// Legacy assistant view - now replaced by AssistantOverlayView
/// The new system provides a global floating overlay with:
/// - Blur backdrop
/// - Floating message cards
/// - Expand/collapse gestures
/// - Minimized response pill
@available(*, deprecated, message: "Use AssistantOverlayView instead")
struct AssistantView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                Text("AI Assistant")
                    .font(.title)
                Text("This view has been replaced by AssistantOverlayView")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
            }
            .navigationTitle("Assistant")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}


