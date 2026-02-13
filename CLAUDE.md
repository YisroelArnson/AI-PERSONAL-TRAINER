# AI Personal Trainer App - Claude Instructions

## Development Workflow

Before writing any code, describe your approach and wait for approval. Always ask clarifying questions before writing any code if requirements are ambiguous. If a task requires changes to more than 3 files, stop and break it into smaller tasks first.

### Workflow order
1. **Research** (`/research`) — Investigate technologies, patterns, or approaches
2. **Spec** (`/spec`) — Interview to surface edge cases and design decisions, then write to `docs/specs/`
3. **Plan** (`/plan`) — Create a phased implementation plan in `docs/plans/`
4. **Implement** (`/implement`) — Execute the plan with verification

Not every task needs all steps. Small bug fixes can skip straight to implementation. Research and spec can happen in either order depending on what you know going in.

## Build and Deploy to iPhone

After making changes to Swift files, automatically build and deploy to the connected iPhone:

```bash
# 1. Build the app
cd "/Users/iswa/Documents/code/AI-PERSONAL-TRAINER/AI Personal Trainer App" && \
xcodebuild -project "AI Personal Trainer App.xcodeproj" \
  -scheme "AI Personal Trainer App" \
  -destination "id=00008120-001215180132201E" \
  -configuration Debug build

# 2. Install on iPhone (device must be unlocked)
xcrun devicectl device install app \
  --device "00008120-001215180132201E" \
  "/Users/iswa/Library/Developer/Xcode/DerivedData/AI_Personal_Trainer_App-guthkpekjbfzkvabmjirjlhgemrk/Build/Products/Debug-iphoneos/AI Personal Trainer App.app"

# 3. Launch the app
xcrun devicectl device process launch \
  --device "00008120-001215180132201E" \
  "AI-PT-ORG.AI-Personal-Trainer-App"
```

**Device info:**
- Device: yisroel's iPhone (iOS 18.6.2)
- Device ID: `00008120-001215180132201E`
- Bundle ID: `AI-PT-ORG.AI-Personal-Trainer-App`

**Notes:**
- The iPhone must be unlocked when installing
- First build may take longer; subsequent builds use cache
- If build fails, check Xcode for code signing issues
