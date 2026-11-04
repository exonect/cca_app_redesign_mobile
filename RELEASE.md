# Releasing the CCA mobile app

Builds run on EAS (Expo's build service). Profiles in `eas.json`:

| Profile | Talks to | Output | For |
|---|---|---|---|
| `uat` | UAT API | Android APK, iOS ad hoc build (internal distribution) | Testers, installed from the EAS link |
| `production` | PROD API | Android App Bundle, iOS App Store build | Play Store and App Store |

Both use the live store ids: Android `com.thermex.app`, iOS `com.thermex.com`.
A UAT build and a store build are the same app to the phone, so one device
holds one or the other, not both.

## One time setup

1. Expo account with access to the project: `npx eas-cli@latest login`, then
   `npx eas-cli@latest init`. Because `app.config.ts` is dynamic, EAS prints the
   project id instead of writing it: add it as `extra.eas.projectId` in
   `app.config.ts` and commit.
2. Fill the `REPLACE-WITH-...` values in `eas.json`: API base URL per
   environment (`https://<host>/api/v1`, with the sub path if the server uses
   one), the mobile app registration client id and the Thermax tenant id. These
   are not secrets. Check nothing is left: `grep REPLACE eas.json` must print nothing.
3. Entra ID (Thermax IT): the mobile app registration has the platform
   "Mobile and desktop applications" with redirect URI `com.thermex.app://auth`,
   and "Allow public client flows" on. Its client id must also be in
   `ENTRA_CLIENT_IDS` on the UAT and PROD servers.
4. Signing: use the existing store signing identities, never new ones, or the
   stores reject the update.
   * Android: upload the existing upload keystore with
     `npx eas-cli@latest credentials -p android` (or confirm EAS already holds it).
   * iOS: sign in with the Apple developer account that owns `com.thermex.com`
     when the build asks; EAS manages certificates and profiles.
5. Version numbers live on EAS (`appVersionSource: remote`) and go up by one
   on every build. Set them once above the highest build already in the
   stores (Play Console: App bundle explorer; App Store Connect: TestFlight):
   ```
   npx eas-cli@latest build:version:set -p android   # enter the highest live versionCode (at least 7)
   npx eas-cli@latest build:version:set -p ios       # enter the highest live build number
   ```
   The `ANDROID_VERSION_CODE` / `IOS_BUILD_NUMBER` values in `app.config.ts`
   are only used for local builds.
6. Store submission keys: a Google Play service account JSON at
   `secrets/play-service-account.json` (git ignored), and for iOS an App Store
   Connect API key (EAS asks on the first submit).

## UAT build

Deploy and check the UAT server first (backend `deploy/DEPLOY.md`), then:
```
npx eas-cli@latest build --profile uat --platform android
npx eas-cli@latest build --profile uat --platform ios
```
iOS ad hoc builds install only on registered devices: register testers'
iPhones first with `npx eas-cli@latest device:create`. (Alternative: build iOS
with the `production` profile pointed at UAT and use TestFlight.)

## Production build and store submission

Only after UAT sign off and the PROD server is live.
1. Raise `version` in `app.config.ts` (e.g. 2.0.0 to 2.0.1) for each store release.
2. Build and submit:
   ```
   npx eas-cli@latest build --profile production --platform all
   npx eas-cli@latest submit --profile production --platform android --latest
   npx eas-cli@latest submit --profile production --platform ios --latest
   ```
   Android goes to the Play internal testing track as a draft; iOS goes to TestFlight.
3. Smoke test the store builds against PROD (sign in, open a project, add a
   trial photo), then promote: Play Console, internal testing to production;
   App Store Connect, add the build to a new version and submit for review.
   Store listing texts and screenshots are updated in the consoles.

## Checks before any build
```
npx tsc --noEmit && npx jest
EXPO_OFFLINE=1 CI=1 npx expo export --platform android --output-dir /tmp/cca-export
```
