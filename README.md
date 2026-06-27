# Cycle

A minimalist period tracking app built with React, Vite, and Capacitor for Android.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npx cap sync android
```

## Android

Install a JDK and Android Studio, then build from the Android project:

```bash
cd android
./gradlew assembleDebug
```

The debug APK will be generated under `android/app/build/outputs/apk/debug/`.
