//
//  AgentTestingView.swift
//  AI Personal Trainer App
//
//  Created for AI Personal Trainer orchestration agent testing
//

import SwiftUI

struct AgentTestingView: View {
    @ObservedObject var apiService: APIService
    @Binding var agentMessage: String
    @Binding var agentResponse: AgentResponse?
    @Binding var agentError: String?
    @Binding var isAgentLoading: Bool
    @Binding var useTools: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            // Header
            HStack {
                Image(systemName: "brain.head.profile")
                    .foregroundColor(.purple)
                Text("AI Agent Testing")
                    .font(.headline)
                    .foregroundColor(.primary)
                Spacer()
            }
            
            // Input section
            AgentInputSection(
                agentMessage: $agentMessage,
                useTools: $useTools,
                isAgentLoading: isAgentLoading,
                onSend: sendAgentMessage
            )
            
            // Response section
            if let response = agentResponse {
                AgentResponseView(response: response)
            }
            
            // Error section
            if let error = agentError {
                AgentErrorView(error: error)
            }
        }
        .padding()
        .background(Color.purple.opacity(0.05))
        .cornerRadius(15)
        .overlay(
            RoundedRectangle(cornerRadius: 15)
                .stroke(Color.purple.opacity(0.2), lineWidth: 1)
        )
    }
    
    private func sendAgentMessage() {
        let messageToSend = agentMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !messageToSend.isEmpty else { return }
        
        isAgentLoading = true
        agentError = nil
        agentResponse = nil
        
        Task {
            do {
                let response = try await apiService.sendAgentMessage(messageToSend, useTools: useTools)
                
                await MainActor.run {
                    self.agentResponse = response
                    self.isAgentLoading = false
                    // Clear the input field after successful send
                    if response.success {
                        self.agentMessage = ""
                    }
                }
            } catch {
                await MainActor.run {
                    self.agentError = error.localizedDescription
                    self.isAgentLoading = false
                }
            }
        }
    }
}

struct AgentInputSection: View {
    @Binding var agentMessage: String
    @Binding var useTools: Bool
    let isAgentLoading: Bool
    let onSend: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Input text field
            VStack(alignment: .leading, spacing: 8) {
                Text("Ask the AI agent:")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                TextField("Type your message here...", text: $agentMessage, axis: .vertical)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .lineLimit(3...6)
            }
            
            // Tools toggle
            HStack {
                Toggle("Use Tools", isOn: $useTools)
                    .font(.subheadline)
                Spacer()
                Text(useTools ? "🔧 Tools Enabled" : "💬 Text Only")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            // Send button
            Button(action: onSend) {
                HStack {
                    if isAgentLoading {
                        ProgressView()
                            .scaleEffect(0.8)
                    }
                    Image(systemName: "paperplane.fill")
                    Text("Send Message")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(agentMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.gray : Color.purple)
                .foregroundColor(.white)
                .cornerRadius(10)
            }
            .disabled(agentMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isAgentLoading)
        }
    }
}

struct AgentResponseView: View {
    let response: AgentResponse
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Response header
            HStack {
                Image(systemName: response.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundColor(response.success ? .green : .red)
                Text("AI Response")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                if let usage = response.usage, let totalTokens = usage.totalTokens {
                    Text("\(totalTokens) tokens")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            
            // Response text
            ScrollView {
                Text(response.response)
                    .font(.body)
                    .foregroundColor(.primary)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 150)
            .padding()
            .background(Color.gray.opacity(0.1))
            .cornerRadius(8)
            
            // Tool calls display
            if let toolCalls = response.toolCalls, !toolCalls.isEmpty {
                ToolCallsView(toolCalls: toolCalls)
            }
        }
        .padding()
        .background(Color.purple.opacity(0.05))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.purple.opacity(0.3), lineWidth: 1)
        )
    }
}

struct ToolCallsView: View {
    let toolCalls: [ToolCall]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("🔧 Tools Used:")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.purple)
            
            ForEach(Array(toolCalls.enumerated()), id: \.offset) { index, toolCall in
                Text("• \(toolCall.toolName)")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.top, 5)
    }
}

struct AgentErrorView: View {
    let error: String
    
    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
            Text(error)
                .font(.caption)
                .foregroundColor(.red)
            Spacer()
        }
        .padding()
        .background(Color.red.opacity(0.1))
        .cornerRadius(8)
    }
}

#Preview {
    AgentTestingView(
        apiService: APIService(),
        agentMessage: .constant("Test message"),
        agentResponse: .constant(nil),
        agentError: .constant(nil),
        isAgentLoading: .constant(false),
        useTools: .constant(true)
    )
}
