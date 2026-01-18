//
//  AppView.swift
//  AI Personal Trainer App
//
//  Created by ISWA on 8/22/25.
//

import SwiftUI

struct AppView: View {
  @State var isAuthenticated = false
  @StateObject private var userDataStore = UserDataStore.shared

  var body: some View {
    Group {
      if isAuthenticated {
        MainAppView()
          .environmentObject(userDataStore)
      } else {
        AuthView()
      }
    }
    .task {
      for await state in supabase.auth.authStateChanges {
        if [.initialSession, .signedIn, .signedOut].contains(state.event) {
          isAuthenticated = state.session != nil
          
          // Load user data when authenticated
          if isAuthenticated {
            await userDataStore.loadAllUserData()
            print("✅ User data loaded successfully on open from AppView")
          }
        }
      }
    }
  }
}

// Main app view with ChatGPT-style side drawer navigation
struct MainAppView: View {
    @EnvironmentObject var userDataStore: UserDataStore
    @StateObject private var appCoordinator = AppStateCoordinator()
    
    // Global AI Assistant overlay manager
    @State private var assistantManager = AssistantOverlayManager()
    
    // Navigation state
    @State private var currentPage: DrawerDestination = .home
    @State private var isDrawerOpen = false
    
    // Interactive drag state
    @State private var dragOffset: CGFloat = 0
    @State private var isDragging = false
    
    // Sheet states
    @State private var showingProfile = false
    
    // User info
    @State private var userEmail: String = ""
    
    // Drawer configuration
    private let drawerWidth: CGFloat = 280
    private let edgeSwipeWidth: CGFloat = 30
    private let velocityThreshold: CGFloat = 300
    
    var body: some View {
        ZStack {
            // Main app content with drawer (ignores keyboard to prevent content shifting)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Container that holds drawer + content side by side
                    HStack(spacing: 0) {
                        // Side drawer
                        SideDrawerView(
                            currentPage: $currentPage,
                            onNavigate: { destination in
                                navigateToPage(destination)
                            },
                            onProfileTap: {
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                    isDrawerOpen = false
                                    dragOffset = 0
                                }
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                                    showingProfile = true
                                }
                            },
                            userEmail: userEmail
                        )
                        .frame(width: drawerWidth)
                        
                        // Main content area
                        ZStack {
                            // Current page content - instant switch, no transition
                            currentPageView
                                .frame(width: geometry.size.width)
                            
                            // Dim overlay that follows drawer position
                            Color.black
                                .opacity(drawerOverlayOpacity)
                                .ignoresSafeArea()
                                .allowsHitTesting(isDrawerOpen || isDragging)
                                .onTapGesture {
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                        isDrawerOpen = false
                                        dragOffset = 0
                                    }
                                }
                        }
                        .frame(width: geometry.size.width)
                    }
                    .offset(x: currentDrawerOffset)
                    .animation(isDragging ? nil : .spring(response: 0.35, dampingFraction: 0.8), value: isDrawerOpen)
                }
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            handleDragChange(value: value)
                        }
                        .onEnded { value in
                            handleDragEnd(value: value)
                        }
                )
            }
            .ignoresSafeArea(.keyboard) // Main content ignores keyboard
            
            // Global AI Assistant Overlay (respects keyboard to push input up)
            AssistantOverlayView()
                .environment(\.assistantManager, assistantManager)
        }
        .sheet(isPresented: $showingProfile) {
            ProfileView()
        }
        .onAppear {
            // Start the coordinated initialization sequence
            Task {
                await appCoordinator.startAppInitialization()
            }
            // Get user email
            Task {
                await loadUserEmail()
            }
        }
    }
    
    // MARK: - Current Page View
    
    @ViewBuilder
    private var currentPageView: some View {
        switch currentPage {
        case .home:
            HomeView(isDrawerOpen: $isDrawerOpen)
                .environmentObject(appCoordinator)
                .id("home") // Ensure view identity for transitions
        case .stats:
            StatsPageView(isDrawerOpen: $isDrawerOpen)
                .id("stats")
        case .info:
            InfoPageView(isDrawerOpen: $isDrawerOpen)
                .environmentObject(userDataStore)
                .id("info")
        case .profile:
            // Profile is handled via sheet, not full page
            EmptyView()
        }
    }
    
    // MARK: - Drawer Offset Calculations
    
    /// The current drawer offset combining base position + drag
    private var currentDrawerOffset: CGFloat {
        let baseOffset = isDrawerOpen ? 0 : -drawerWidth
        return baseOffset + dragOffset
    }
    
    /// Overlay opacity based on drawer position (0 when closed, 0.3 when open)
    private var drawerOverlayOpacity: Double {
        // Calculate how "open" the drawer is (0 to 1)
        let openProgress = (currentDrawerOffset + drawerWidth) / drawerWidth
        let clampedProgress = max(0, min(1, openProgress))
        return Double(clampedProgress) * 0.3
    }
    
    // MARK: - Drag Gesture Handling
    
    private func handleDragChange(value: DragGesture.Value) {
        // Determine if this is a valid drag
        let isFromLeftEdge = value.startLocation.x < edgeSwipeWidth
        let canDrag = isDrawerOpen || isFromLeftEdge
        
        guard canDrag else { return }
        
        isDragging = true
        
        // Calculate the drag offset
        let translation = value.translation.width
        
        if isDrawerOpen {
            // When open, allow dragging left (negative) to close
            // Constrain so drawer can't go past closed position
            dragOffset = min(0, translation)
        } else {
            // When closed, allow dragging right (positive) to open
            // Constrain so drawer can't go past open position
            dragOffset = max(0, min(drawerWidth, translation))
        }
    }
    
    private func handleDragEnd(value: DragGesture.Value) {
        isDragging = false
        
        let velocity = value.predictedEndTranslation.width - value.translation.width
        let currentPosition = currentDrawerOffset
        
        // Determine final state based on velocity and position
        let shouldOpen: Bool
        
        // Fast swipe overrides position
        if abs(velocity) > velocityThreshold {
            shouldOpen = velocity > 0
        } else {
            // Position-based: bias toward closing (drawer closes when dragged past 30% closed)
            // This makes it easier to close - only need to drag ~30% to trigger close
            let closeThreshold = -drawerWidth * 0.3
            shouldOpen = currentPosition > closeThreshold
        }
        
        // Animate to final state
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            isDrawerOpen = shouldOpen
            dragOffset = 0
        }
    }
    
    // MARK: - Navigation
    
    private func navigateToPage(_ destination: DrawerDestination) {
        // Don't navigate if already on this page
        guard destination != currentPage else {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                isDrawerOpen = false
                dragOffset = 0
            }
            return
        }
        
        // Switch page instantly (no animation)
        currentPage = destination
        
        // Close drawer with spring animation
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            isDrawerOpen = false
            dragOffset = 0
        }
    }
    
    // MARK: - User Data
    
    private func loadUserEmail() async {
        do {
            let session = try await supabase.auth.session
            userEmail = session.user.email ?? ""
        } catch {
            print("❌ Failed to load user email: \(error)")
            userEmail = ""
        }
    }
}

// MARK: - Two-Line Hamburger Icon (ChatGPT style)

struct TwoLineMenuIcon: View {
    var body: some View {
        VStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 1)
                .fill(AppTheme.Colors.primaryText.opacity(0.7))
                .frame(width: 18, height: 2)
            RoundedRectangle(cornerRadius: 1)
                .fill(AppTheme.Colors.primaryText.opacity(0.7))
                .frame(width: 18, height: 2)
        }
    }
}

// MARK: - Stats Page View (Full Page Wrapper)

struct StatsPageView: View {
    @Binding var isDrawerOpen: Bool
    
    var body: some View {
        ZStack {
            // Animated gradient background (matches HomeView)
            AnimatedGradientBackground()
            
            VStack(spacing: 0) {
                // Custom navigation bar (matches HomeView positioning)
                pageNavigationBar(title: "Stats")
                
                // Stats content
                StatsContentView()
            }
        }
    }
    
    private func pageNavigationBar(title: String) -> some View {
        HStack {
            Button(action: {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    isDrawerOpen = true
                }
            }) {
                TwoLineMenuIcon()
                    .frame(width: 44, height: 44)
            }
            
            Spacer()
            
            Text(title)
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(AppTheme.Colors.primaryText)
            
            Spacer()
            
            // Placeholder for balance (matches HomeView's right side element)
            Color.clear
                .frame(width: 44, height: 44)
        }
        .padding(.horizontal, AppTheme.Spacing.md)
        .padding(.top, AppTheme.Spacing.xs) // Match HomeView's topBar padding
    }
}

// MARK: - Info Page View (Full Page Wrapper)

struct InfoPageView: View {
    @EnvironmentObject var userDataStore: UserDataStore
    @Binding var isDrawerOpen: Bool
    
    var body: some View {
        ZStack {
            // Animated gradient background (matches HomeView)
            AnimatedGradientBackground()
            
            VStack(spacing: 0) {
                // Custom navigation bar (matches HomeView positioning)
                pageNavigationBar(title: "Preferences")
                
                // Info/Preferences content
                InfoContentView()
                    .environmentObject(userDataStore)
            }
        }
    }
    
    private func pageNavigationBar(title: String) -> some View {
        HStack {
            Button(action: {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    isDrawerOpen = true
                }
            }) {
                TwoLineMenuIcon()
                    .frame(width: 44, height: 44)
            }
            
            Spacer()
            
            Text(title)
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(AppTheme.Colors.primaryText)
            
            Spacer()
            
            // Placeholder for balance (matches HomeView's right side element)
            Color.clear
                .frame(width: 44, height: 44)
        }
        .padding(.horizontal, AppTheme.Spacing.md)
        .padding(.top, AppTheme.Spacing.xs) // Match HomeView's topBar padding
    }
}

#Preview {
    AppView()
}
