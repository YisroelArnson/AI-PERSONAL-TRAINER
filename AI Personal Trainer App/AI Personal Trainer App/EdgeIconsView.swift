import SwiftUI

struct EdgeIconsView: View {
    let onTap: (SwipeNavigationView.NavigationPanel) -> Void
    @State private var pulseAnimation: Bool = false
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Top edge - Profile
                EdgeIcon(
                    icon: "person.circle.fill",
                    glowColor: .white,
                    panel: .profile,
                    onTap: onTap
                )
                .position(x: geometry.size.width / 2, y: 30)
                
                // Bottom edge - Assistant
                EdgeIcon(
                    icon: "sparkles",
                    glowColor: Color(#colorLiteral(red: 0.2, green: 0.6, blue: 1.0, alpha: 1)),
                    panel: .assistant,
                    onTap: onTap
                )
                .position(x: geometry.size.width / 2, y: geometry.size.height - 30)
                
                // Left edge - Stats
                EdgeIcon(
                    icon: "chart.bar.fill",
                    glowColor: Color(#colorLiteral(red: 1.0, green: 0.6, blue: 0.2, alpha: 1)),
                    panel: .stats,
                    onTap: onTap
                )
                .position(x: 30, y: geometry.size.height / 2)
                
                // Right edge - Info
                EdgeIcon(
                    icon: "info.circle.fill",
                    glowColor: Color(#colorLiteral(red: 0.2, green: 0.8, blue: 0.4, alpha: 1)),
                    panel: .info,
                    onTap: onTap
                )
                .position(x: geometry.size.width - 30, y: geometry.size.height / 2)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) {
                pulseAnimation = true
            }
        }
    }
}

struct EdgeIcon: View {
    let icon: String
    let glowColor: Color
    let panel: SwipeNavigationView.NavigationPanel
    let onTap: (SwipeNavigationView.NavigationPanel) -> Void
    
    @State private var isPressed: Bool = false
    @State private var glowIntensity: Double = 0.5
    
    var body: some View {
        ZStack {
            // Glow effect
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [
                            glowColor.opacity(glowIntensity * 0.6),
                            glowColor.opacity(glowIntensity * 0.3),
                            Color.clear
                        ]),
                        center: .center,
                        startRadius: 5,
                        endRadius: 40
                    )
                )
                .frame(width: 80, height: 80)
                .blur(radius: 10)
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: glowIntensity)
            
            // Embossed background
            Circle()
                .fill(
                    LinearGradient(
                        gradient: Gradient(colors: [
                            Color.black.opacity(0.3),
                            Color.gray.opacity(0.1)
                        ]),
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 50, height: 50)
                .overlay(
                    Circle()
                        .stroke(
                            LinearGradient(
                                gradient: Gradient(colors: [
                                    Color.white.opacity(0.1),
                                    Color.black.opacity(0.3)
                                ]),
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                )
                .shadow(color: Color.black.opacity(0.5), radius: 3, x: -2, y: -2)
                .shadow(color: Color.white.opacity(0.1), radius: 3, x: 2, y: 2)
            
            // Icon with inner glow
            Image(systemName: icon)
                .font(.system(size: 24, weight: .medium))
                .foregroundColor(glowColor)
                .shadow(color: glowColor, radius: isPressed ? 8 : 4)
                .shadow(color: glowColor.opacity(0.5), radius: isPressed ? 12 : 6)
                .scaleEffect(isPressed ? 0.9 : 1.0)
        }
        .onTapGesture {
            // Haptic feedback
            let impact = UIImpactFeedbackGenerator(style: .medium)
            impact.prepare()
            impact.impactOccurred()
            
            // Animation
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                isPressed = true
            }
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    isPressed = false
                }
                onTap(panel)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) {
                glowIntensity = 0.8
            }
        }
    }
}

// Material texture overlay
struct MaterialTextureView: View {
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Base texture
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color.gray.opacity(0.05),
                        Color.black.opacity(0.1)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                
                // Noise texture simulation
                ForEach(0..<50) { _ in
                    Circle()
                        .fill(Color.white.opacity(Double.random(in: 0.01...0.03)))
                        .frame(width: CGFloat.random(in: 1...3), height: CGFloat.random(in: 1...3))
                        .position(
                            x: CGFloat.random(in: 0...geometry.size.width),
                            y: CGFloat.random(in: 0...geometry.size.height)
                        )
                }
                
                // Surface scratches
                ForEach(0..<20) { _ in
                    Rectangle()
                        .fill(Color.black.opacity(Double.random(in: 0.02...0.05)))
                        .frame(width: CGFloat.random(in: 20...100), height: 0.5)
                        .rotationEffect(.degrees(Double.random(in: -45...45)))
                        .position(
                            x: CGFloat.random(in: 0...geometry.size.width),
                            y: CGFloat.random(in: 0...geometry.size.height)
                        )
                }
            }
            .blendMode(.overlay)
        }
    }
}

#Preview {
    ZStack {
        Color.black
        EdgeIconsView { _ in }
    }
}
