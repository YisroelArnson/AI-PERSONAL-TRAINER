//
//  IntervalTimerOverlay.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 12/7/25.
//

import SwiftUI

/// Floating interval timer overlay that appears in the bottom-left corner
struct IntervalTimerOverlay: View {
    @ObservedObject var viewModel: IntervalTimerViewModel
    
    /// Binding to pass the detail text up to the parent view
    @Binding var detailText: String?
    
    // Animation states
    @State private var pulseScale: CGFloat = 1.0
    @State private var isExpanded: Bool = false
    
    private let circleSize: CGFloat = 64
    
    var body: some View {
        VStack(alignment: .center, spacing: 4) {
            // Cue text above the circle
            if let phase = viewModel.currentPhase, viewModel.hasStarted {
                Text(phase.cue)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.secondaryText)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                    .animation(.easeInOut(duration: 0.2), value: viewModel.currentPhaseIndex)
            }
            
            // Timer circle
            timerCircle
        }
        .onChange(of: viewModel.currentPhase?.detail) { _, newDetail in
            withAnimation(.easeInOut(duration: 0.2)) {
                detailText = newDetail
            }
        }
        .onChange(of: viewModel.isComplete) { _, isComplete in
            if isComplete {
                detailText = nil
            }
        }
    }
    
    // MARK: - Timer Circle
    
    private var timerCircle: some View {
        ZStack {
            // Background circle
            Circle()
                .fill(AppTheme.Colors.cardBackground)
                .frame(width: circleSize, height: circleSize)
                .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 4)
            
            // Phase color ring (subtle tint based on phase type)
            if let phase = viewModel.currentPhase, viewModel.hasStarted {
                Circle()
                    .stroke(phase.phase_type.color.opacity(0.3), lineWidth: 3)
                    .frame(width: circleSize - 4, height: circleSize - 4)
            }
            
            // Content
            if viewModel.isLoading {
                ProgressView()
                    .scaleEffect(0.8)
            } else if viewModel.isComplete {
                // Completion state
                Image(systemName: "checkmark")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(AppTheme.Colors.success)
            } else if !viewModel.hasStarted {
                // Initial state - show play icon
                Image(systemName: "play.fill")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(AppTheme.Colors.primaryText)
            } else if viewModel.isRunning {
                // Running state - show countdown
                Text("\(viewModel.timeRemaining)")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)
                    .contentTransition(.numericText())
                    .animation(.spring(response: 0.3), value: viewModel.timeRemaining)
            } else {
                // Paused state
                VStack(spacing: 2) {
                    Text("\(viewModel.timeRemaining)")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundColor(AppTheme.Colors.primaryText.opacity(0.6))
                    
                    Text("PAUSED")
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                }
            }
        }
        .scaleEffect(pulseScale)
        .opacity(viewModel.isRunning ? 1.0 : (viewModel.hasStarted ? 0.7 : 1.0))
        .contentShape(Circle())
        .onTapGesture {
            handleTap()
        }
        .onLongPressGesture(minimumDuration: 0.5) {
            // Long press to reset
            withAnimation(.spring(response: 0.3)) {
                viewModel.reset()
            }
        }
        .onChange(of: viewModel.currentPhaseIndex) { _, _ in
            // Pulse animation on phase change
            withAnimation(.spring(response: 0.2, dampingFraction: 0.5)) {
                pulseScale = 1.1
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    pulseScale = 1.0
                }
            }
        }
    }
    
    // MARK: - Actions
    
    private func handleTap() {
        withAnimation(.spring(response: 0.2, dampingFraction: 0.7)) {
            if viewModel.isComplete {
                // Tap on completed - reset
                viewModel.reset()
            } else {
                // Toggle play/pause
                viewModel.toggle()
            }
        }
    }
}

// MARK: - Detail Banner View

/// Banner that displays at the top of the screen showing phase detail
struct IntervalDetailBanner: View {
    let text: String?
    
    var body: some View {
        if let text = text {
            Text(text)
                .font(.system(size: 16, weight: .medium, design: .rounded))
                .foregroundColor(AppTheme.Colors.primaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(AppTheme.Colors.cardBackground)
                        .shadow(color: .black.opacity(0.08), radius: 4, x: 0, y: 2)
                )
                .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        AnimatedGradientBackground()
        
        VStack {
            // Detail banner at top
            IntervalDetailBanner(text: "Set 2 of 3")
                .padding(.top, 60)
            
            Spacer()
            
            // Timer overlay at bottom-left
            HStack {
                IntervalTimerOverlay(
                    viewModel: {
                        let vm = IntervalTimerViewModel()
                        // Mock data for preview
                        return vm
                    }(),
                    detailText: .constant("Set 1 of 3")
                )
                .padding(.leading, 20)
                .padding(.bottom, 100)
                
                Spacer()
            }
        }
    }
}


