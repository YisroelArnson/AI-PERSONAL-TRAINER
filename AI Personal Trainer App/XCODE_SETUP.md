# Xcode Project Setup Guide

## 🚨 Important: Xcode Project File Update Required

The file structure has been reorganized on disk, but **Xcode needs to be updated** to reflect these changes in the project navigator.

---

## ✅ Step-by-Step Instructions

### Step 1: Open Xcode Project
1. Open `AI Personal Trainer App.xcodeproj` in Xcode
2. You may see some files with red names (missing references)
3. Don't worry - we'll fix this!

### Step 2: Remove Old File References
In the Project Navigator (left sidebar), **delete these files** (Right-click → Delete → Remove Reference):
- ❌ `NavigationViews.swift` (old location)
- ❌ `APIService.swift` (old location)
- ❌ `FloatingNavigationBar.swift` (old location)
- ❌ `AuthView.swift` (old location)
- ❌ `AppView.swift` (old location)
- ❌ `supabase.swift` (old location)

**Note**: Choose "Remove Reference" NOT "Move to Trash" (the files are already moved)

### Step 3: Create Folder Groups in Xcode
Right-click on "AI Personal Trainer App" group → New Group

Create these groups:
1. **App** (for app lifecycle files)
2. **Core** (with subgroups: Extensions, Theme)
3. **Models**
4. **Services**
5. **Features** (with subgroups: Home, Info, Stats, Assistant, WritingMode, Profile)
6. **Shared** (with subgroup: Components)

### Step 4: Add Files to Correct Groups
For each group, right-click → "Add Files to..."

#### App Group
- Select and add:
  - `App/AppView.swift`
  - `App/supabase.swift`

#### Core/Extensions Group
- Add: `Core/Extensions/Color+Extensions.swift`

#### Core/Theme Group
- Add: `Core/Theme/AppTheme.swift`

#### Models Group
- Add:
  - `Models/Exercise.swift`
  - `Models/APIModels.swift`

#### Services Group
- Add: `Services/APIService.swift`

#### Features/Info Group
Create subgroups "Views" and "Components", then add:
- **Views/**
  - `Features/Info/Views/InfoView.swift`
  - `Features/Info/Views/AddPreferenceSheet.swift`
  - `Features/Info/Views/PreferencesManagerView.swift`
- **Components/**
  - `Features/Info/Components/ActivePreferencesSection.swift`
  - `Features/Info/Components/EmptyPreferencesState.swift`

#### Features/Stats Group
- Add: `Features/Stats/StatsView.swift`

#### Features/Assistant Group
- Add: `Features/Assistant/AssistantView.swift`

#### Features/WritingMode Group
- Add: `Features/WritingMode/WritingModeView.swift`

#### Features/Profile Group
- Add:
  - `Features/Profile/ProfileView.swift`
  - `Features/Profile/AuthView.swift`

#### Shared/Components Group
- Add: `Shared/Components/FloatingNavigationBar.swift`

### Step 5: Verify Build
1. Press `Cmd + B` to build
2. Fix any remaining import issues
3. Run the app (`Cmd + R`)

---

## 🔍 Troubleshooting

### Problem: "Cannot find type in scope"
**Solution**: The file might not be added to the target
1. Select the file in Project Navigator
2. Open File Inspector (right sidebar)
3. Check "AI Personal Trainer App" under Target Membership

### Problem: Files show as red in Project Navigator
**Solution**: Remove reference and re-add
1. Right-click → Delete → Remove Reference
2. Right-click on group → Add Files to...
3. Select the file from disk

### Problem: Duplicate symbols error
**Solution**: File added twice
1. Search for the file in Project Navigator
2. Remove duplicate references

---

## 📱 Testing Checklist

After setup, verify these features work:
- [ ] App launches
- [ ] Home screen displays
- [ ] Navigation bar visible
- [ ] Info button opens Info view
- [ ] Active Preferences section visible
- [ ] Empty state shows correctly
- [ ] AI Assist button works
- [ ] Edit button works
- [ ] All other nav buttons open their views

---

## 🎨 Visual Structure in Xcode

Your Project Navigator should look like this:

```
AI Personal Trainer App
├── App
│   ├── AI_Personal_Trainer_AppApp.swift
│   ├── AppView.swift
│   └── supabase.swift
├── Core
│   ├── Extensions
│   │   └── Color+Extensions.swift
│   └── Theme
│       └── AppTheme.swift
├── Models
│   ├── Exercise.swift
│   └── APIModels.swift
├── Services
│   └── APIService.swift
├── Features
│   ├── Home
│   │   └── ContentView.swift
│   ├── Info
│   │   ├── Views
│   │   │   ├── InfoView.swift
│   │   │   ├── AddPreferenceSheet.swift
│   │   │   └── PreferencesManagerView.swift
│   │   └── Components
│   │       ├── ActivePreferencesSection.swift
│   │       └── EmptyPreferencesState.swift
│   ├── Stats
│   │   └── StatsView.swift
│   ├── Assistant
│   │   └── AssistantView.swift
│   ├── WritingMode
│   │   └── WritingModeView.swift
│   └── Profile
│       ├── ProfileView.swift
│       └── AuthView.swift
├── Shared
│   └── Components
│       └── FloatingNavigationBar.swift
└── Assets.xcassets
```

---

## 💡 Pro Tips

1. **Use Groups, Not Folders**: Xcode groups don't have to match disk structure, but it's cleaner when they do
2. **Keep It Organized**: As you add files, put them in the right group immediately
3. **Use File Templates**: Create Xcode file templates for consistent structure
4. **Command + Shift + O**: Quick file search - works great with organized names

---

## 📚 Reference

- See `ARCHITECTURE.md` for detailed architecture documentation
- Follow naming conventions in the architecture doc
- Use `AppTheme` for all styling

---

*Need help? Check the ARCHITECTURE.md file for more details.*

