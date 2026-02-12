# UI Polish Plan: Professional Feel

**Goal:** Improve the feel of the app without changing structure. Focus on visual design, transitions, and interaction feedback.

**Keep unchanged:** Drawer navigation, single exercise focus, minimal info display, wheel pickers

---

## Summary of Changes

| Area | Current | After |
|------|---------|-------|
| **Page Transitions** | Instant (jarring) | Smooth slide+fade with spring |
| **Haptic Feedback** | None | Tactile responses throughout |
| **Color Palette** | Warm peach (#F4A574) | Calm sage green (#7FB685) |
| **Typography** | SF Pro Rounded | SF Pro (default) - cleaner |
| **Button States** | No press feedback | Scale + shadow on press |
| **Drawer** | Basic | Polished with haptics + press states |
| **Dark Mode** | Sidebar only | Full app support |

---

## Phase 1: Foundation

### 1.1 Create HapticManager
**New file:** `Core/Services/HapticManager.swift`

```swift
import UIKit

enum HapticManager {
    static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func medium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func soft() { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func selection() { UISelectionFeedbackGenerator().selectionChanged() }
}
```

**Where to add haptics:**
| Action | Haptic |
|--------|--------|
| Exercise completion (orb button) | `.success()` |
| Set completion toggle | `.light()` |
| Page navigation | `.medium()` |
| Drawer open/close | `.soft()` |
| Exercise swipe | `.soft()` |
| Picker value change | `.selection()` |
| Nav item tap | `.light()` |

### 1.2 Update AppTheme.swift - Colors

Replace warm palette with calm sage green:

```swift
enum Colors {
    // Backgrounds
    static let backgroundPrimary = Color(hex: "FAFAFA")
    static let backgroundSecondary = Color(hex: "F5F5F5")
    static let backgroundPrimaryDark = Color(hex: "1C1C1E")
    static let backgroundSecondaryDark = Color(hex: "2C2C2E")

    // Primary Accent: Sage Green
    static let accent = Color(hex: "7FB685")
    static let accentLight = Color(hex: "A8D4AE")
    static let warmAccent = Color(hex: "7FB685")  // Update orb color
    static let warmAccentLight = Color(hex: "C4E0C7")

    // Text
    static let primaryText = Color(hex: "1A1A1A")
    static let primaryTextDark = Color(hex: "F5F5F5")
    static let secondaryText = Color(hex: "6B6B6B")
    static let tertiaryText = Color(hex: "A8A8A8")

    // Cards
    static let cardBackground = Color.white.opacity(0.95)
    static let cardBackgroundDark = Color(hex: "2C2C2E")

    // Exercise types (softer)
    static let strength = Color(hex: "D4A574")
    static let cardio = Color(hex: "8BB8C4")
    static let hiit = Color(hex: "D49494")
    static let bodyweight = Color(hex: "7FB685")
    static let isometric = Color(hex: "B4A7D4")
    static let flexibility = Color(hex: "D4B4C4")
    static let yoga = Color(hex: "94C4B4")
}
```

### 1.3 Update AppTheme.swift - Typography

Remove `.rounded` design:

```swift
enum Typography {
    static let titleFont = Font.system(size: 28, weight: .bold)
    static let title2Font = Font.system(size: 22, weight: .semibold)
    static let headlineFont = Font.system(size: 17, weight: .semibold)
    static let bodyFont = Font.system(size: 15, weight: .regular)
    static let captionFont = Font.system(size: 12, weight: .medium)
}
```

Then search and replace `.design: .rounded)` → `)` across all files (~20 occurrences).

### 1.4 Update AppTheme.swift - Animations

Add spring-based animations:

```swift
enum Animation {
    static let quick = SwiftUI.Animation.spring(response: 0.25, dampingFraction: 0.75)
    static let standard = SwiftUI.Animation.spring(response: 0.35, dampingFraction: 0.8)
    static let calm = SwiftUI.Animation.spring(response: 0.5, dampingFraction: 0.85)
    static let press = SwiftUI.Animation.spring(response: 0.15, dampingFraction: 0.6)
    static let breathing = SwiftUI.Animation.easeInOut(duration: 1.8).repeatForever(autoreverses: true)
}
```

---

## Phase 2: Page Transitions

### 2.1 Update MainAppView.swift

Add smooth page transitions (currently instant):

```swift
@ViewBuilder
private var currentPageView: some View {
    Group {
        switch currentPage {
        case .home: HomeView(...)
        case .stats: StatsPageView(...)
        case .info: InfoPageView(...)
        case .profile: EmptyView()
        }
    }
    .id(currentPage)
    .transition(.opacity.combined(with: .scale(scale: 0.97)))
}

private func navigateToPage(_ destination: DrawerDestination) {
    guard destination != currentPage else {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            isDrawerOpen = false
        }
        return
    }

    HapticManager.medium()

    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
        currentPage = destination
        isDrawerOpen = false
        dragOffset = 0
    }
}
```

### 2.2 Add Drawer Haptics

In `handleDragEnd`:
```swift
if shouldOpen != isDrawerOpen {
    HapticManager.soft()
}
```

---

## Phase 3: Component Polish

### 3.1 SideDrawerView - Press States

Add scale feedback to nav items:

```swift
struct DrawerNavItem: View {
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            HapticManager.light()
            onTap()
        }) {
            // ... existing content
        }
        .scaleEffect(isPressed ? 0.97 : 1.0)
        .animation(.spring(response: 0.15, dampingFraction: 0.6), value: isPressed)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }
}
```

### 3.2 GlowingOrbButton - Haptics + Colors

```swift
Button(action: {
    HapticManager.success()
    action()
}) {
    // Update gradient colors from warmAccent to new sage green
}
```

### 3.3 SetCard (StrengthExerciseView) - Press States

Add scale + shadow feedback on press:

```swift
.scaleEffect(isPressed ? 0.98 : 1.0)
.shadow(radius: isPressed ? 4 : 8, y: isPressed ? 1 : 4)

// On tap:
HapticManager.light()
```

### 3.4 Exercise Swipe (HomeView) - Haptics

In `transitionToExercise`:
```swift
HapticManager.soft()
```

### 3.5 Picker Sheets - Selection Haptics

In `RepsPickerSheet` and `WeightPickerSheet`:
```swift
Picker(...).onChange(of: value) { _, _ in
    HapticManager.selection()
}
```

---

## Phase 4: Visual Refinements

### 4.1 AnimatedGradientBackground - New Colors

Update blob colors from warm peach to subtle sage:

```swift
private let blobColors: [(color: Color, opacity: Double)] = [
    (Color(hex: "E8F0EA"), 0.55),  // Pale sage
    (Color(hex: "F0F4F2"), 0.50),  // Near-white sage
    (Color(hex: "DCE8DF"), 0.45),  // Light sage
]
```

Add dark mode support with deeper colors.

### 4.2 Shadow Refinements

Update `AppTheme.Shadow`:
```swift
static let cardMedium = Color.black.opacity(0.06)  // was 0.04
static let cardRadius: CGFloat = 16  // was 20
static let cardY: CGFloat = 4  // was 8
```

### 4.3 Dark Mode Support

Add `@Environment(\.colorScheme)` to components and use adaptive colors:
- `ExerciseCard.swift`
- `ExerciseHeaderView`
- `HomeView.swift`
- `StatsView.swift`
- `LoadingStateView.swift`
- All exercise type views

---

## Files to Modify

| Priority | File | Changes |
|----------|------|---------|
| 1 | `AppTheme.swift` | Colors, typography, animations |
| 2 | `HapticManager.swift` (new) | Haptic utilities |
| 3 | `MainAppView.swift` | Page transitions + haptics |
| 4 | `SideDrawerView.swift` | Press states + haptics |
| 5 | `GlowingOrbButton.swift` | Colors + haptics |
| 6 | `HomeView.swift` | Swipe haptics |
| 7 | `StrengthExerciseView.swift` | Press states + haptics |
| 8 | `BodyweightExerciseView.swift` | Same as strength |
| 9 | `AnimatedGradientBackground.swift` | New colors + dark mode |
| 10 | `ExerciseCard.swift` | Dark mode + shadow |
| 11 | `RepsPickerSheet.swift` | Selection haptics |
| 12 | `WeightPickerSheet.swift` | Selection haptics |
| 13+ | All views with `.rounded` | Remove rounded typography |

---

## Verification Plan

1. **Build** - Verify no compile errors
2. **Light Mode** - Check all screens have new sage palette
3. **Dark Mode** - Toggle system dark mode, verify all screens
4. **Haptics** - Feel feedback on: button taps, swipes, completions, pickers
5. **Transitions** - Page switches should be smooth (no instant jumps)
6. **Press States** - Buttons/cards should scale on press
7. **Typography** - Text should be SF Pro (not rounded)
