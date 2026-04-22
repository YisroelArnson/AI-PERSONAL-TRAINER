//
//  ToastView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 11/2/25.
//

// Provides shared helpers for toast view.
//
// Main functions in this file:
// - body: Builds and returns the SwiftUI view hierarchy for this type.
// - scheduleAutoDismiss: Schedules Auto dismiss for later execution.
// - dismissToast: Dismisses Toast from the current UI state.
// - toast: Handles Toast for ToastView.swift.

import SwiftUI

// MARK: - Toast Data Model

struct ToastData: Equatable {
    let message: String
    let icon: String
    let duration: TimeInterval
    
    init(message: String, icon: String = "checkmark.circle.fill", duration: TimeInterval = 3.0) {
        self.message = message
        self.icon = icon
        self.duration = duration
    }
}

// MARK: - Toast View

struct ToastView: View {
    let data: ToastData
    let onDismiss: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: data.icon)
                .font(.system(size: 20))
                .foregroundColor(AppTheme.Colors.primaryText)
            
            Text(data.message)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(AppTheme.Colors.primaryText)
                .lineLimit(2)
            
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(AppTheme.Colors.surface)
        )
        .padding(.horizontal, 20)
        .onTapGesture {
            onDismiss()
        }
    }
}

// MARK: - Toast View Modifier

struct ToastModifier: ViewModifier {
    @Binding var toast: ToastData?
    @State private var workItem: DispatchWorkItem?
    
    /// Builds and returns the SwiftUI view hierarchy for this type.
    func body(content: Content) -> some View {
        ZStack {
            content
            
            if let toast = toast {
                VStack {
                    ToastView(data: toast) {
                        dismissToast()
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onAppear {
                        scheduleAutoDismiss()
                    }
                    .padding(.top, 50)
                    
                    Spacer()
                }
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: toast)
            }
        }
    }
    
    /// Schedules Auto dismiss for later execution.
    private func scheduleAutoDismiss() {
        guard let toast = toast else { return }
        
        // Cancel existing work item
        workItem?.cancel()
        
        // Create new work item
        let task = DispatchWorkItem {
            dismissToast()
        }
        
        workItem = task
        DispatchQueue.main.asyncAfter(deadline: .now() + toast.duration, execute: task)
    }
    
    /// Dismisses Toast from the current UI state.
    private func dismissToast() {
        withAnimation {
            toast = nil
        }
        workItem?.cancel()
        workItem = nil
    }
}

// MARK: - View Extension

extension View {
    /// Handles Toast for ToastView.swift.
    func toast(_ toast: Binding<ToastData?>) -> some View {
        modifier(ToastModifier(toast: toast))
    }
}

// MARK: - Preview

#Preview {
    VStack {
        Text("Sample Content")
    }
    .toast(.constant(ToastData(message: "Switched to Home Gym", icon: "location.fill")))
}
