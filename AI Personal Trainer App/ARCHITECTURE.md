# AI Personal Trainer App - Architecture Documentation

## 📁 Project Structure

This document outlines the professional iOS app architecture implemented for the AI Personal Trainer app.

### Folder Organization

```
AI Personal Trainer App/
├── 📁 App/                          # App lifecycle & configuration
│   ├── AI_Personal_Trainer_AppApp.swift
│   ├── AppView.swift
│   └── supabase.swift
│
├── 📁 Core/                         # Core functionality & utilities
│   ├── 📁 Extensions/
│   │   └── Color+Extensions.swift   # Color hex support
│   └── 📁 Theme/
│       └── AppTheme.swift          # Centralized design system
│
├── 📁 Models/                       # Data models
│   ├── Exercise.swift              # Exercise domain model
│   └── APIModels.swift             # API request/response models
│
├── 📁 Services/                     # Business logic & API
│   └── APIService.swift            # Network service layer
│
├── 📁 Features/                     # Feature-based modules
│   │
│   ├── 📁 Home/
│   │   └── ContentView.swift       # Main home screen
│   │
│   ├── 📁 Info/
│   │   ├── 📁 Views/
│   │   │   ├── InfoView.swift
│   │   │   ├── AddPreferenceSheet.swift
│   │   │   └── PreferencesManagerView.swift
│   │   └── 📁 Components/
│   │       ├── ActivePreferencesSection.swift
│   │       └── EmptyPreferencesState.swift
│   │
│   ├── 📁 Stats/
│   │   └── StatsView.swift
│   │
│   ├── 📁 Assistant/
│   │   └── AssistantView.swift
│   │
│   ├── 📁 WritingMode/
│   │   └── WritingModeView.swift
│   │
│   └── 📁 Profile/
│       ├── ProfileView.swift
│       └── AuthView.swift
│
├── 📁 Shared/                       # Shared UI components
│   └── 📁 Components/
│       └── FloatingNavigationBar.swift
│
└── 📁 Resources/
    └── Assets.xcassets/
```

---

## 🏗️ Architecture Principles

### 1. **Feature-Based Organization**
Each major feature has its own folder containing:
- **Views**: Main screen views
- **Components**: Reusable components specific to that feature
- **ViewModels**: (Future) Business logic for the feature

**Benefits:**
- Easy to find related code
- Clear feature boundaries
- Simple to add new features
- Easy to delete entire features

### 2. **Separation of Concerns**

#### App Layer
- App lifecycle management
- Global configuration
- Authentication setup

#### Core Layer
- Extensions to native types
- Theme/design system
- Utilities used across features

#### Models Layer
- Domain models (Exercise, User, etc.)
- API models (requests/responses)
- View models (future)

#### Services Layer
- API communication
- Business logic
- Data persistence (future)

#### Features Layer
- UI screens organized by feature
- Feature-specific components
- Feature-specific logic

#### Shared Layer
- Reusable components used across features
- Common views

---

## 🎨 Design System (AppTheme)

The `AppTheme` enum provides centralized design tokens:

```swift
// Colors
AppTheme.Colors.background
AppTheme.Colors.primaryText
AppTheme.Colors.cardBackground

// Spacing
AppTheme.Spacing.sm    // 8
AppTheme.Spacing.md    // 12
AppTheme.Spacing.lg    // 16
AppTheme.Spacing.xl    // 20

// Corner Radius
AppTheme.CornerRadius.small    // 8
AppTheme.CornerRadius.medium   // 12
AppTheme.CornerRadius.large    // 20

// Shadow
AppTheme.Shadow.card
AppTheme.Shadow.cardRadius
```

**Benefits:**
- Consistent design across app
- Easy to update theme globally
- Type-safe design tokens
- No magic numbers

---

## 📝 File Naming Conventions

### Views
- Main screens: `[Feature]View.swift` (e.g., `InfoView.swift`)
- Sheets/Modals: `[Purpose]Sheet.swift` (e.g., `AddPreferenceSheet.swift`)
- Detail screens: `[Feature]DetailView.swift`

### Components
- Reusable UI: `[Component]View.swift` (e.g., `EmptyPreferencesState.swift`)
- Sections: `[Feature]Section.swift` (e.g., `ActivePreferencesSection.swift`)

### Models
- Domain models: `[Entity].swift` (e.g., `Exercise.swift`)
- API models: `APIModels.swift` or `[Feature]Models.swift`

### Services
- Service classes: `[Purpose]Service.swift` (e.g., `APIService.swift`)

---

## 🔄 Data Flow

```
View → ViewModel (future) → Service → API
  ↑                                    ↓
  └────────── Model Update ────────────┘
```

### Current Implementation
- Views directly call `APIService`
- State managed with `@State` and `@Binding`

### Future Enhancement (MVVM)
- ViewModels handle business logic
- Views only display UI
- Models remain passive

---

## 🚀 Adding New Features

### Step 1: Create Feature Folder
```
Features/
└── NewFeature/
    ├── Views/
    │   └── NewFeatureView.swift
    └── Components/
        └── NewFeatureComponent.swift
```

### Step 2: Create Main View
```swift
struct NewFeatureView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background
                    .ignoresSafeArea()
                
                // Your content
            }
            .navigationTitle("New Feature")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
```

### Step 3: Add to Navigation
Update `MainAppView` in `App/AppView.swift`:
```swift
@State private var showingNewFeature = false

.sheet(isPresented: $showingNewFeature) {
    NewFeatureView()
}
```

---

## 🧪 Testing Strategy (Future)

### Unit Tests
- Test ViewModels in isolation
- Test Services with mock network
- Test Models for business logic

### UI Tests
- Test critical user flows
- Test navigation
- Test form validation

### Integration Tests
- Test API integration
- Test data persistence
- Test authentication flow

---

## 📚 Best Practices

### 1. **Use AppTheme for all styling**
❌ Bad:
```swift
.foregroundColor(Color(hex: "212529"))
.padding(20)
```

✅ Good:
```swift
.foregroundColor(AppTheme.Colors.primaryText)
.padding(AppTheme.Spacing.xl)
```

### 2. **Keep views small and focused**
- Single responsibility
- Extract components when view > 200 lines
- Use `#Preview` for all views

### 3. **Organize imports**
```swift
import SwiftUI    // Framework imports first
import Supabase

// Your code
```

### 4. **Use MARK comments**
```swift
// MARK: - Properties
// MARK: - Body
// MARK: - Helper Methods
// MARK: - Preview
```

### 5. **Extract magic numbers**
❌ Bad:
```swift
.cornerRadius(20)
.padding(16)
```

✅ Good:
```swift
.cornerRadius(AppTheme.CornerRadius.large)
.padding(AppTheme.Spacing.lg)
```

---

## 🔧 Maintenance

### Adding a New Color
1. Add to `Core/Theme/AppTheme.swift`:
```swift
enum Colors {
    static let newColor = Color(hex: "abcdef")
}
```

### Adding a New Model
1. Create in `Models/` folder
2. Keep models passive (data only)
3. Add Codable conformance for API models

### Adding a New Service
1. Create in `Services/` folder
2. Use `ObservableObject` if needed
3. Keep services focused on one responsibility

---

## 📖 Additional Resources

- [Apple's App Architecture](https://developer.apple.com/design/human-interface-guidelines/)
- [SwiftUI Best Practices](https://www.swiftbysundell.com/)
- [MVVM Pattern in SwiftUI](https://www.hackingwithswift.com/books/ios-swiftui)

---

## 🎯 Next Steps

1. **Add ViewModels**: Implement MVVM pattern
2. **Add Tests**: Unit and UI tests
3. **Add Documentation**: Inline documentation
4. **Refactor ContentView**: Break into smaller components
5. **Add Error Handling**: Centralized error handling

---

*Last Updated: October 6, 2025*

