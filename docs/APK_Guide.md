# First-time Setup
npm install @capacitor/core @capacitor/cli @capacitor/android # installs Capacitor
npm run build                                                 # builds your React app
npx cap add android                                           # creates the mobile/android project

# Normal Worflow - Do after every change
npm run build        # TypeScript compile + Vite build → dist/
npx cap sync android # Sync latest changes into android app

# Run Android Studio after finalizing changes
npm run android  # Build and open in Android Studio
                 # or open mobile/android in android studio manually

# Build an APK
Debug APK - Used for quick testing, emulator installs, your own development
Click: Build → Generate App Bundles or APKs → Generate APKs
Output in: mobile/android/app/build/outputs/apk/debug/app-debug.apk

Release APK - Used for sharing with teammates, more realistic testing, demo installs
Click: Build → Generate Signed App Bundle or APK → APK
Output in: mobile/android/app/build/outputs/apk/release/app-release.apk

# Running APK on Android Studio emulation
Start device then drag the .apk onto the emulator for it to download