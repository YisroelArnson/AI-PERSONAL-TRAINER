import SwiftUI

struct SwipeNavigationView: View {
    @State private var currentPanel: NavigationPanel = .home
    @State private var dragOffset: CGSize = .zero
    @State private var isDragging: Bool = false
    @GestureState private var gestureOffset: CGSize = .zero
    
    enum NavigationPanel {
        case home
        case assistant  // Bottom
        case info      // Right
        case stats     // Left
        case profile   // Top
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background with material texture
                Color(#colorLiteral(red: 0.08, green: 0.08, blue: 0.1, alpha: 1))
                    .overlay(MaterialTextureView())
                    .ignoresSafeArea()
                
                // Main content container
                ZStack {
                    // Home View (always in the stack)
                    HomeView()
                        .offset(homeOffset(for: geometry.size))
                        .shadow(color: shadowColor(for: .home), radius: shadowRadius(for: .home), x: shadowX(for: .home), y: shadowY(for: .home))
                        .zIndex(zIndex(for: .home))
                    
                    AssistantPanelView()
                        .offset(panelOffset(for: .assistant, size: geometry.size))
                        .shadow(color: shadowColor(for: .assistant), radius: shadowRadius(for: .assistant), x: shadowX(for: .assistant), y: shadowY(for: .assistant))
                        .zIndex(zIndex(for: .assistant))
                    
                    InfoPanelView()
                        .offset(panelOffset(for: .info, size: geometry.size))
                        .shadow(color: shadowColor(for: .info), radius: shadowRadius(for: .info), x: shadowX(for: .info), y: shadowY(for: .info))
                        .zIndex(zIndex(for: .info))
                    
                    StatsPanelView()
                        .offset(panelOffset(for: .stats, size: geometry.size))
                        .shadow(color: shadowColor(for: .stats), radius: shadowRadius(for: .stats), x: shadowX(for: .stats), y: shadowY(for: .stats))
                        .zIndex(zIndex(for: .stats))
                    
                    ProfilePanelView()
                        .offset(panelOffset(for: .profile, size: geometry.size))
                        .shadow(color: shadowColor(for: .profile), radius: shadowRadius(for: .profile), x: shadowX(for: .profile), y: shadowY(for: .profile))
                        .zIndex(zIndex(for: .profile))
                }
                .gesture(
                    DragGesture()
                        .updating($gestureOffset) { value, state, _ in
                            state = value.translation
                        }
                        .onChanged { value in
                            isDragging = true
                            dragOffset = value.translation
                        }
                        .onEnded { value in
                            handleSwipeEnd(translation: value.translation, size: geometry.size)
                            isDragging = false
                        }
                )
                
                // Edge Icons
                if currentPanel == .home {
                    EdgeIconsView(onTap: handleIconTap)
                        .allowsHitTesting(!isDragging)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
    
    // Calculate home offset based on current panel and drag
    private func homeOffset(for size: CGSize) -> CGSize {
        // When home is active, move it in tandem with the incoming panel
        if currentPanel == .home {
            guard isDragging, let target = detectSwipeDirection(translation: dragOffset) else {
                return .zero
            }
            
            switch target {
            case .assistant:
                let translation = max(-size.height, min(0, dragOffset.height))
                return CGSize(width: 0, height: translation)
            case .info:
                let translation = max(-size.width, min(0, dragOffset.width))
                return CGSize(width: translation, height: 0)
            case .stats:
                let translation = min(size.width, max(0, dragOffset.width))
                return CGSize(width: translation, height: 0)
            case .profile:
                let translation = min(size.height, max(0, dragOffset.height))
                return CGSize(width: 0, height: translation)
            case .home:
                return .zero
            }
        }
        
        // When a panel is active, keep the home view parked off-screen unless the user is swiping back
        var offset: CGSize = .zero
        switch currentPanel {
        case .assistant:
            offset = CGSize(width: 0, height: -size.height)
        case .info:
            offset = CGSize(width: -size.width, height: 0)
        case .stats:
            offset = CGSize(width: size.width, height: 0)
        case .profile:
            offset = CGSize(width: 0, height: size.height)
        case .home:
            offset = .zero
        }
        
        if isDragging {
            switch currentPanel {
            case .assistant:
                let translation = min(max(dragOffset.height, 0), size.height)
                offset.height += translation
            case .info:
                let translation = min(max(dragOffset.width, 0), size.width)
                offset.width += translation
            case .stats:
                let translation = min(max(-dragOffset.width, 0), size.width)
                offset.width -= translation
            case .profile:
                let translation = min(max(-dragOffset.height, 0), size.height)
                offset.height -= translation
            case .home:
                break
            }
        }
        
        return offset
    }
    
    // Calculate panel offset based on state
    private func panelOffset(for panel: NavigationPanel, size: CGSize) -> CGSize {
        if currentPanel == .home {
            if let target = detectSwipeDirection(translation: dragOffset), target == panel {
                return openingOffset(for: panel, translation: dragOffset, size: size)
            }
            return offscreenOffset(for: panel, size: size)
        }
        
        if panel == currentPanel {
            if !isDragging {
                return .zero
            }
            return closingOffset(for: panel, translation: dragOffset, size: size)
        }
        
        return offscreenOffset(for: panel, size: size)
    }
    
    private func offscreenOffset(for panel: NavigationPanel, size: CGSize) -> CGSize {
        switch panel {
        case .assistant:
            return CGSize(width: 0, height: size.height)
        case .info:
            return CGSize(width: size.width, height: 0)
        case .stats:
            return CGSize(width: -size.width, height: 0)
        case .profile:
            return CGSize(width: 0, height: -size.height)
        case .home:
            return .zero
        }
    }
    
    private func openingOffset(for panel: NavigationPanel, translation: CGSize, size: CGSize) -> CGSize {
        switch panel {
        case .assistant:
            let delta = max(-size.height, min(0, translation.height))
            return CGSize(width: 0, height: size.height + delta)
        case .info:
            let delta = max(-size.width, min(0, translation.width))
            return CGSize(width: size.width + delta, height: 0)
        case .stats:
            let delta = min(size.width, max(0, translation.width))
            return CGSize(width: -size.width + delta, height: 0)
        case .profile:
            let delta = min(size.height, max(0, translation.height))
            return CGSize(width: 0, height: -size.height + delta)
        case .home:
            return .zero
        }
    }
    
    private func closingOffset(for panel: NavigationPanel, translation: CGSize, size: CGSize) -> CGSize {
        switch panel {
        case .assistant:
            let delta = min(max(translation.height, 0), size.height)
            return CGSize(width: 0, height: delta)
        case .info:
            let delta = min(max(translation.width, 0), size.width)
            return CGSize(width: delta, height: 0)
        case .stats:
            let delta = min(max(-translation.width, 0), size.width)
            return CGSize(width: -delta, height: 0)
        case .profile:
            let delta = min(max(-translation.height, 0), size.height)
            return CGSize(width: 0, height: -delta)
        case .home:
            return .zero
        }
    }
    
    // Detect swipe direction
    private func detectSwipeDirection(translation: CGSize) -> NavigationPanel? {
        let threshold: CGFloat = 50
        
        if abs(translation.width) > abs(translation.height) {
            if translation.width > threshold {
                return .stats  // Swipe right reveals left panel
            } else if translation.width < -threshold {
                return .info   // Swipe left reveals right panel
            }
        } else {
            if translation.height > threshold {
                return .profile // Swipe down reveals top panel
            } else if translation.height < -threshold {
                return .assistant // Swipe up reveals bottom panel
            }
        }
        
        return nil
    }
    
    // Calculate swipe progress (0 to 1)
    private func calculateSwipeProgress(translation: CGSize, size: CGSize) -> CGFloat {
        guard let direction = detectSwipeDirection(translation: translation) else { return 0 }
        
        switch direction {
        case .assistant:
            return min(1, max(0, -translation.height / (size.height * 0.3)))
        case .info:
            return min(1, max(0, -translation.width / (size.width * 0.3)))
        case .stats:
            return min(1, max(0, translation.width / (size.width * 0.3)))
        case .profile:
            return min(1, max(0, translation.height / (size.height * 0.3)))
        default:
            return 0
        }
    }
    
    // Handle swipe end
    private func handleSwipeEnd(translation: CGSize, size: CGSize) {
        // First check if we're trying to return to home
        if currentPanel != .home {
            let reverseProgress: CGFloat
            switch currentPanel {
            case .assistant:
                reverseProgress = translation.height / (size.height * 0.3)
            case .info:
                reverseProgress = translation.width / (size.width * 0.3)
            case .stats:
                reverseProgress = -translation.width / (size.width * 0.3)
            case .profile:
                reverseProgress = -translation.height / (size.height * 0.3)
            default:
                reverseProgress = 0
            }
            
            if reverseProgress > 0.33 {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8, blendDuration: 0)) {
                    currentPanel = .home
                    dragOffset = .zero
                }
                return
            }
        }
        
        // If not returning home, check for opening a new panel
        if currentPanel == .home {
            let progress = calculateSwipeProgress(translation: translation, size: size)
            if progress > 0.33, let targetPanel = detectSwipeDirection(translation: translation) {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8, blendDuration: 0)) {
                    currentPanel = targetPanel
                    dragOffset = .zero
                }
            }
        }
        
        // Reset drag offset
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7, blendDuration: 0)) {
            dragOffset = .zero
        }
    }
    
    // Handle icon tap
    private func handleIconTap(panel: NavigationPanel) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8, blendDuration: 0)) {
            currentPanel = panel
        }
    }
    
    // Shadow helpers for depth effect
    private func shadowColor(for panel: NavigationPanel) -> Color {
        switch panel {
        case .home:
            if currentPanel == .home {
                return Color.clear
            }
            return Color.black.opacity(0.35)
        default:
            if panel == currentPanel {
                return Color.black.opacity(0.25)
            }
            if currentPanel == .home {
                return Color.black.opacity(0.15)
            }
            return Color.clear
        }
    }
    
    private func shadowRadius(for panel: NavigationPanel) -> CGFloat {
        switch panel {
        case .home:
            return currentPanel == .home ? 0 : 20
        default:
            return panel == currentPanel ? 12 : (currentPanel == .home ? 8 : 0)
        }
    }
    
    private func shadowX(for panel: NavigationPanel) -> CGFloat {
        guard panel != .home else { return 0 }
        switch panel {
        case .info:
            return -4
        case .stats:
            return 4
        default:
            return 0
        }
    }
    
    private func shadowY(for panel: NavigationPanel) -> CGFloat {
        guard panel != .home else { return 0 }
        switch panel {
        case .assistant:
            return -4
        case .profile:
            return 4
        default:
            return 0
        }
    }
    
    private func zIndex(for panel: NavigationPanel) -> Double {
        if currentPanel == .home {
            guard let target = detectSwipeDirection(translation: dragOffset) else {
                return panel == .home ? 1 : 0
            }
            if panel == .home { return 1 }
            return panel == target ? 1 : 0
        }
        
        if panel == currentPanel { return 1 }
        if panel == .home { return 0.5 }
        return 0
    }
}

// Home View
struct HomeView: View {
    var body: some View {
        ZStack {
            // Background
            LinearGradient(
                gradient: Gradient(colors: [Color(#colorLiteral(red: 0.1, green: 0.1, blue: 0.15, alpha: 1)), Color(#colorLiteral(red: 0.05, green: 0.05, blue: 0.1, alpha: 1))]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            VStack(spacing: 20) {
                Text("AI Personal Trainer")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                
                Text("Swipe in any direction")
                    .font(.body)
                    .foregroundColor(.gray)
            }
        }
        .ignoresSafeArea()
    }
}

// Assistant Panel View
struct AssistantPanelView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color(#colorLiteral(red: 0.1, green: 0.2, blue: 0.4, alpha: 1)), Color(#colorLiteral(red: 0.05, green: 0.1, blue: 0.3, alpha: 1))]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            Text("Assistant Panel")
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(.white)
        }
        .ignoresSafeArea()
    }
}

// Info Panel View
struct InfoPanelView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color(#colorLiteral(red: 0.1, green: 0.4, blue: 0.2, alpha: 1)), Color(#colorLiteral(red: 0.05, green: 0.3, blue: 0.1, alpha: 1))]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            Text("Info Page")
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(.white)
        }
        .ignoresSafeArea()
    }
}

// Stats Panel View
struct StatsPanelView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color(#colorLiteral(red: 0.4, green: 0.3, blue: 0.1, alpha: 1)), Color(#colorLiteral(red: 0.3, green: 0.2, blue: 0.05, alpha: 1))]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            Text("Stats Page")
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(.white)
        }
        .ignoresSafeArea()
    }
}

// Profile Panel View
struct ProfilePanelView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color(#colorLiteral(red: 0.3, green: 0.3, blue: 0.35, alpha: 1)), Color(#colorLiteral(red: 0.2, green: 0.2, blue: 0.25, alpha: 1))]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            Text("Profile Page")
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(.white)
        }
        .ignoresSafeArea()
    }
}

#Preview {
    SwipeNavigationView()
}
