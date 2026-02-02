# AI Personal Trainer App - Claude Instructions

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
