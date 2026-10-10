# Unified Web, Mobile (iOS & Android) and Television (Android TV / Fire TV) Setup

This project embeds native mobile and television support directly into the existing React application in `client/`.

---

## 1. How It Works

Your entire codebase lives in `client/` and serves all targets simultaneously:

```
client/
├── build/                       # Web build bundle
├── src/                         # Unified React + TypeScript source code
│   ├── shared/Hooks/useTVNavigation.js # 10-foot TV Remote D-Pad Spatial Navigation
│   ├── Global.scss              # High-contrast TV focus indicators (:focus-visible)
│   ├── shared/Utils/apiConfig.ts# Dynamic API server host resolution
│   └── ...
├── ios/                         # Native iOS Xcode project (iPhone & iPad)
├── android/                     # Native Android project (Mobile, Tablet, Android TV, Fire TV)
│   └── app/src/main/AndroidManifest.xml # Leanback TV Launcher & non-touchscreen support
├── capacitor.config.json        # Capacitor native bridge configuration
└── package.json                 # Web & mobile scripts
```

---

## 2. Television Remote Control Support

On televisions (Android TV, Google TV, Fire TV, or Smart TV web browsers), users navigate using a D-pad remote:
- **Spatial Navigation**: [useTVNavigation.js](file:///Users/harrival/Desktop/my-app/client/src/shared/Hooks/useTVNavigation.js) calculates 2D geometric distances to navigate smoothly between buttons, inputs, tables, and cards when arrow keys are pressed.
- **TV Focus Styling**: [Global.scss](file:///Users/harrival/Desktop/my-app/client/src/Global.scss) provides a 1.02x zoom and an emerald glowing outline (`#16a34a`) so the focused element is easily visible from 10 feet away.
- **TV Scoreboard Mode**: The existing `PlayersMonitor` component automatically renders in full 4-quadrant layout (`.tvLayout`) with fluid typography (`clamp()`).

---

## 3. Commands

From the workspace root (`/Users/harrival/Desktop/my-app`):

### 1. Web Development (Browser)
```bash
npm run web
# Starts React web app on http://localhost:3000
```

### 2. Build & Sync Web Assets to iOS & Android
Whenever you modify code in `client/src`, build and sync with:
```bash
npm run cap:sync
```

### 3. Open Native iOS Project (Xcode)
```bash
npm run cap:ios
```
*(Requires Xcode on macOS to build for iPhone and iPad)*

### 4. Open Native Android & TV Project (Android Studio)
```bash
npm run cap:android
```
*(Opens the project in Android Studio. You can run on an Android phone, tablet, or an Android TV / Google TV emulator)*
