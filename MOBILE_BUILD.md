# Mobile Build Guide

Bundle ID: `com.offloadusa.app`

## Prerequisites

### Android

1. **Keystore**: Place `offload-release.keystore` in `android/app/`.
2. **Environment variables** (required for release builds):
   ```bash
   export OFFLOAD_KEYSTORE_PASSWORD="<your-keystore-password>"
   export OFFLOAD_KEY_PASSWORD="<your-key-password>"
   ```
3. **Version bumping** (required for Play Store uploads):
   ```bash
   export VERSION_CODE=$(date +%s)   # or increment manually
   export VERSION_NAME="1.1.0"        # semantic version
   ```
4. **Firebase Cloud Messaging** (for push notifications):
   - Create a Firebase project at https://console.firebase.google.com
   - Download `google-services.json` and place at `android/app/google-services.json`
   - This file is `.gitignore`d and must be added manually per build environment

### iOS

1. **Xcode**: Open `ios/App/App.xcworkspace`
2. **Signing**: Configure your Apple Developer team in Xcode project settings
3. **Associated Domains**: The entitlement for `applinks:offloadusa.com` is already configured.
   Upload the `apple-app-site-association` file to `https://offloadusa.com/.well-known/apple-app-site-association`
   and replace `<TEAM_ID>` with your actual Apple Developer Team ID.
4. **APNs**: The `aps-environment` is set to `production`. For development/sandbox testing,
   change it to `development` in `ios/App/App/App.entitlements`.
5. **Push notifications**: Set these server env vars:
   ```
   APNS_KEY_ID=<your-key-id>
   APNS_TEAM_ID=<your-team-id>
   APNS_KEY_PATH=<path-to-p8-file>
   APNS_BUNDLE_ID=com.offloadusa.app
   ```

## Build Commands

### Client (web assets for Capacitor)

```bash
npm run build
npx cap sync
```

### Android Debug

```bash
cd android && ./gradlew assembleDebug
```

### Android Release

```bash
export OFFLOAD_KEYSTORE_PASSWORD="..."
export OFFLOAD_KEY_PASSWORD="..."
export VERSION_CODE=$(date +%s)
export VERSION_NAME="1.1.0"
cd android && ./gradlew bundleRelease
```

### iOS

Open `ios/App/App.xcworkspace` in Xcode and use Product > Archive.

## Server Push Configuration

### APNs (iOS)

Set these env vars on the server:
- `APNS_KEY_ID` — Key ID from Apple Developer portal
- `APNS_TEAM_ID` — Team ID from Apple Developer portal
- `APNS_KEY_PATH` — Path to the .p8 key file
- `APNS_BUNDLE_ID` — `com.offloadusa.app` (default)

### FCM (Android)

Set this env var on the server:
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Full JSON content of the Firebase service account key
  (download from Firebase Console > Project Settings > Service accounts > Generate new private key)
