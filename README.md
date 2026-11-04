# CCA mobile v2

Native Android and iOS app for the Thermax Chemical Construction App, built
with Expo (React Native). The legacy app at the repository root is untouched.

- Bundle ids are the live store ids: Android `com.thermex.app`, iOS
  `com.thermex.com`. Set `ANDROID_VERSION_CODE` / `IOS_BUILD_NUMBER` above
  the live store builds when building a release.
- Sign in is Microsoft Entra ID with PKCE in the system browser; the ID
  token is exchanged with the CCA API exactly as on the web.
- `src/shared/calc.ts` and `src/shared/types.ts` are copied from the web app
  (`npm run sync-shared -- <path to web v2>`), so both compute identically.

## Run
```
cp .env.example .env            # API base, Entra ids
npm install --legacy-peer-deps
npx expo run:android            # or run:ios; needs Android Studio or Xcode
```
Expo Go cannot run Microsoft sign in; use a development build. Cloud builds:
`npx eas-cli@latest build --profile production` (needs the store signing
keys, which Thermax will provide at publish time).

## Checks
```
npm run typecheck && npm test && npx expo export --platform android
```
