//
//  FloatingNavigationBar.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 10/5/25.
//

import SwiftUI

struct FloatingNavigationBar: View {
    @Binding var showingStats: Bool
    @Binding var showingInfo: Bool
    @Binding var showingAssistant: Bool
    @Binding var showingWritingMode: Bool
    @Binding var showingProfile: Bool
    
    var body: some View {
        HStack(spacing: 10) {
            // Stats Button
            Button(action: {
                showingStats = true
            }) {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 18))
                    .foregroundColor(Color(hex: "ffffff"))
                    .frame(width: 40, height: 40)
            }
            
            // Info Button
            Button(action: {
                showingInfo = true
            }) {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(Color(hex: "ffffff"))
                    .frame(width: 40, height: 40)
            }
            
            // AI Assistant Orb (simple white glowing orb)
            Button(action: {
                showingAssistant = true
            }) {
                Circle()
                    .fill(Color.white)
                    .frame(width: 46, height: 46)
                    .shadow(color: Color.white.opacity(0.3), radius: 3, x: 0, y: 1)
                    .overlay(
                        Circle()
                            .stroke(Color.white.opacity(0.7), lineWidth: 2)
                    )
            }
            
            // Writing Mode Button
            Button(action: {
                showingWritingMode = true
            }) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 18))
                    .foregroundColor(Color(hex: "ffffff"))
                    .frame(width: 40, height: 40)
            }
            
            // Profile Button
            Button(action: {
                showingProfile = true
            }) {
                Image(systemName: "person.fill")
                    .font(.system(size: 18))
                    .foregroundColor(Color(hex: "ffffff"))
                    .frame(width: 40, height: 40)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 30)
                .fill(Color.black.opacity(0.5))
                .blur(radius: 20)
        )
        .background(
            RoundedRectangle(cornerRadius: 30)
                .fill(Color.black.opacity(0.7))
        )
    }
}

#Preview {
    FloatingNavigationBar(
        showingStats: .constant(false),
        showingInfo: .constant(false),
        showingAssistant: .constant(false),
        showingWritingMode: .constant(false),
        showingProfile: .constant(false)
    )
}

