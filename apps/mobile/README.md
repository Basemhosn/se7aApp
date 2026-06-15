# SE7A — Mobile

Expo (React Native) app that wraps the SE7A web API. Same backend, native
camera. Targets iOS first (TestFlight beta), Android via the same codebase.

## Stack

- **Expo SDK 52** + **expo-router** (file-based stack navigation)
- **TypeScript** strict
- **Supabase JS** with AsyncStorage adapter for session persistence
- **expo-image-picker** + **expo-image-manipulator** (camera + resize)
- **@expo-google-fonts** for Syne / Instrument Sans / IBM Plex Mono (matches the web brand)

## Architecture

The app is a thin client. All AI calls go to the **same Next.js API**
deployed at `https://se7a.app`. The web's API routes accept either:

- Session cookie (web caller)
- `Authorization: Bearer <access_token>` header (this app)

`src/lib/api.ts` injects the Bearer token from the active Supabase session
on every request. No service-role key is ever in the bundle.

## Routes (expo-router)

```
app/
  _layout.tsx          ← AuthProvider + font loader
  index.tsx            ← auth-aware redirect
  login.tsx            ← magic-link entry
  auth/callback.tsx    ← exchanges the deep-link code → session
  onboarding.tsx       ← first-login profile form
  dashboard.tsx        ← targets + today's ledger + 3 scan CTAs
  scan/
    plate.tsx          ← camera → plate scan → review → log
    menu.tsx           ← camera → menu scan → order/consider/skip
    body.tsx           ← camera → body scan; photo NOT stored
```

## Local dev

```bash
cd apps/mobile
npm install                  # ~500 MB; make sure you have disk
cp .env.example .env.local   # fill in three values
npm start                    # press i for iOS sim, a for Android
```

`.env.local` needs:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EXPO_PUBLIC_API_BASE=http://<your-mac-LAN-IP>:3000
```

`EXPO_PUBLIC_API_BASE` is your dev Next.js URL. The iOS simulator can use
`http://localhost:3000`, but a physical device needs your LAN IP because
`localhost` resolves to the device itself.

## Supabase configuration (required for magic-link)

In your Supabase project, **Auth → URL Configuration → Redirect URLs**,
add the app's URL scheme:

```
se7a://auth/callback
```

This is on top of the web entries (`http://localhost:3000/auth/callback`
and `https://se7a.app/auth/callback`). When the user taps the magic link
on their phone, iOS opens the app via the `se7a://` scheme and lands on
`app/auth/callback.tsx`, which exchanges the code for a session.

## EAS / TestFlight

1. **Apple Developer account** is required. Make sure your Apple ID is
   enrolled in the Developer Program.

2. **Bundle identifier**: currently `app.se7a.mobile` in `app.json`.
   Change if you want a different namespace.

3. **Create the EAS project** (one-time):

   ```bash
   npm install -g eas-cli
   eas login                                   # uses your Expo account
   eas init                                    # creates the project
   ```

   Update `app.json → expo.extra.eas.projectId` with the value EAS prints.

4. **Fill in `eas.json` submit config** with:
   - Apple ID email
   - App Store Connect app ID
   - Apple Team ID

5. **First build**:

   ```bash
   npm run build:preview      # internal distribution, signed for TestFlight
   ```

   EAS handles certs/profiles automatically the first time.

6. **Submit to TestFlight**:

   ```bash
   eas build --profile production --platform ios
   eas submit --platform ios --latest
   ```

## Honest brand rule

Mirrors the web. Every macro value rendered as a `low–high` range. Body-fat
estimate rendered as a range. Confidence pill on every scan. No fake
precision. See project memory `project_se7a_overview.md`.
