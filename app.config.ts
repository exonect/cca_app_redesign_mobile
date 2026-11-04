import type { ExpoConfig } from 'expo/config'

/**
 * Bundle ids are those of the apps already live in the stores (they must not
 * change, or the stores treat this as a different app). The "thermex"
 * spelling is the original one.
 *
 * Build numbers must be higher than the live store builds: set
 * ANDROID_VERSION_CODE and IOS_BUILD_NUMBER at build time (Play currently
 * has at least versionCode 7 from the legacy app).
 */
const env = process.env

const config: ExpoConfig = {
  name: 'CCA',
  slug: 'thermax-cca',
  version: '2.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: env.EXPO_PUBLIC_AUTH_SCHEME ?? 'com.thermex.app',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.thermex.com',
    buildNumber: env.IOS_BUILD_NUMBER ?? '1',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription: 'CCA uses the camera to photograph cubes, slump tests and site conditions for a trial.',
      NSPhotoLibraryUsageDescription: 'CCA lets you attach photos from your library to a trial.',
      NSPhotoLibraryAddUsageDescription: 'CCA saves downloaded trial reports to your library when you ask it to.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.thermex.app',
    versionCode: Number(env.ANDROID_VERSION_CODE ?? 8),
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-web-browser',
    'expo-secure-store',
    'expo-font',
    ['expo-splash-screen', { image: './assets/splash-icon.png', backgroundColor: '#231F20', imageWidth: 160 }],
    'expo-sharing',
    ['expo-image-picker', { cameraPermission: 'CCA uses the camera to photograph cubes, slump tests and site conditions for a trial.' }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiBase: env.EXPO_PUBLIC_API_BASE,
    entraClientId: env.EXPO_PUBLIC_ENTRA_CLIENT_ID,
    entraTenantId: env.EXPO_PUBLIC_ENTRA_TENANT_ID,
    devLogin: env.EXPO_PUBLIC_DEV_LOGIN === 'true',
  },
}

export default config
