# 🌾 Crop AI | React Native Application

Crop AI is a **mobile application** built with **React Native** that empowers farmers with **AI-powered crop recommendations** and **plant disease detection**. This app consumes the **FastAPI backend** (AgroTech AI API) to deliver real-time predictions using soil, weather, and image data.

## 📱 Features

- ✅ **Crop Recommendation** based on soil nutrients (N, P, K), pH, rainfall, temperature & humidity
- ✅ **Plant Disease Detection** using image classification models (ResNet / ONNX)
- ✅ **Weather Data Fetching** from latitude & longitude (via OpenWeatherMap API)
- ✅ **Modern UI** designed for ease of use in rural & agricultural contexts
- ✅ **Android-first** deployment

## 🛠 Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) or React Native CLI
- [Android Studio](https://developer.android.com/studio) with Android Emulator OR a physical Android device
- [FastAPI Backend](../ml-server) running locally or deployed (required for API calls)

Make sure your backend server is running and accessible from the app.

## 🏗 Building the Android APK

This app uses custom native modules (`llama.rn`, ONNX Runtime, expo-sqlite) wired through
[config plugins](../app.json), so it must be built as a **standalone native APK** — a plain
Expo Go build cannot run the on-device LLM or plant-disease detection.

### Option A — GitHub Actions (recommended, no local toolchain)

A CI workflow (`.github/workflows/build-apk.yml`) builds the release APK on demand:

1. Push your code:

   ```bash
   git push origin main
   ```

2. On GitHub, open **Actions → Build Android APK → Run workflow**.
3. Wait for the run to finish. The fresh APK is published automatically to the
   **Releases → Latest APK** page on this repo (also available as the `crop-ai-apk`
   workflow artifact).
4. Install it on your Android phone — download `app-release.apk` from the release and
   open it, or use:

   ```bash
   adb install app-release.apk
   ```

> Size: release builds package a single `arm64-v8a` APK (~4x smaller than a universal
> build), which covers virtually all modern Android phones. Set `APP_ABIS` in the
> workflow to build for other architectures.

The workflow only builds the **native app** (`apps/native`): it installs pnpm/Node/JDK,
runs `expo prebuild -p android`, then `./gradlew assembleRelease`.

### Option B — Local build

Prerequisites: **JDK 17**, Android SDK with **NDK 27.x** and **CMake**, Node.js + pnpm.

```bash
# from the repo root
pnpm install

cd apps/native
pnpm exec expo prebuild -p android

cd android
./gradlew assembleRelease \
  -Dorg.gradle.jvmargs="-Xmx3g -XX:MaxMetaspaceSize=512m" \
  -Dorg.gradle.workers.max=4 \
  -Dorg.gradle.internal.http.socketTimeout=300000
```

The APK lands at:

```
apps/native/android/app/build/outputs/apk/release/app-release.apk
```

### Notes

- **The first build is slow** — Gradle + Maven downloads and the native compile of
  `llama.rn` / ONNX Runtime can take 20–50 minutes and needs ~2 GB free RAM per Gradle
  worker plus several GB of disk. Subsequent builds are faster (cached).
- **Signing**: the release APK is signed with Expo's debug keystore, so it installs on any
  device but cannot be published to the Play Store. Use EAS Build or a real keystore in
  `android/app/build.gradle` for production.
- **Model URLs** (`EXPO_PUBLIC_LLM_MODEL_*_URL`, `EXPO_PUBLIC_DISEASE_MODEL_URL`) are baked
  into the JS bundle. They come from `apps/native/.env` or from the defaults in the code
  (`lib/llm.ts`, `lib/disease-detection.ts`), so a build works without a `.env` file.
- **On first run** the app downloads the 0.5B LLM GGUF (~491 MB) and the ONNX disease model
  into its document directory — downloads are resumable and run fully offline afterwards.

## 📸 Screenshots

_Add screenshots of your app here for better documentation._
