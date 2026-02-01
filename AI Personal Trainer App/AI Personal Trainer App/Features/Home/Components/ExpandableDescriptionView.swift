//
//  ExpandableDescriptionView.swift
//  AI Personal Trainer App
//
//  Created by AI Assistant on 11/24/25.
//

import SwiftUI

struct ExpandableDescriptionView: View {
    let text: String
    let showContent: Bool
    
    @State private var isExpanded: Bool = false
    
    // Check if text needs expansion (more than ~50 chars)
    private var needsExpansion: Bool {
        text.count > 50
    }
    
    private let lineHeight: CGFloat = 20
    
    @State private var fullHeight: CGFloat = 20
    
    var body: some View {
        Button(action: {
            if needsExpansion {
                withAnimation(AppTheme.Animation.gentle) {
                    isExpanded.toggle()
                }
            }
        }) {
            HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                // Single flowing text with height control
                ZStack(alignment: .topTrailing) {
                    // Full text - one continuous paragraph
                    Text(text)
                        .font(.system(size: 14, weight: .regular, design: .rounded))
                        .foregroundColor(AppTheme.Colors.secondaryText)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .background(
                            // Measure the full text height
                            GeometryReader { geo in
                                Color.clear
                                    .onAppear { fullHeight = geo.size.height }
                                    .onChange(of: text) { _, _ in fullHeight = geo.size.height }
                            }
                        )
                        .mask(
                            // Mask controls what's visible (fade effect)
                            VStack(spacing: 0) {
                                // First line always visible
                                Rectangle()
                                    .frame(height: lineHeight)
                                
                                // Rest of content - fades in
                                Rectangle()
                                    .opacity(isExpanded ? 1 : 0)
                                    .animation(AppTheme.Animation.gentle, value: isExpanded)
                            }
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        )
                    
                }
                // Control the actual height (compact when collapsed)
                .frame(height: isExpanded ? fullHeight : lineHeight, alignment: .top)
                .clipped()
                .animation(AppTheme.Animation.gentle, value: isExpanded)
                
                // Chevron - fixed size, rotates smoothly
                if needsExpansion {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(AppTheme.Colors.tertiaryText)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                        .animation(AppTheme.Animation.gentle, value: isExpanded)
                        .frame(width: 16, height: 16)
                }
            }
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(!needsExpansion)
        .opacity(showContent ? 1 : 0)
        .animation(AppTheme.Animation.gentle.delay(0.08), value: showContent)
    }
}

#Preview {
    ZStack {
        AppTheme.Colors.background
            .ignoresSafeArea()
        
        VStack(alignment: .leading, spacing: 40) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Barbell Bench Press")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                ExpandableDescriptionView(
                    text: "Press the handles forward at chest height, focusing on full contraction and slow, controlled lowering.",
                    showContent: true
                )
            }
            .padding(.horizontal, 20)
            
            VStack(alignment: .leading, spacing: 12) {
                Text("Short Description")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.Colors.primaryText)
                
                ExpandableDescriptionView(
                    text: "Short description",
                    showContent: true
                )
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 40)
    }
}
