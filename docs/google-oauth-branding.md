# Google OAuth — branded consent screen setup

Fixes the issue where users signing in with Google see the Supabase URL
instead of "SE7A" branding on the Google consent screen.

**Root cause:** You're using Supabase's shared Google OAuth client.
**Fix:** Create your own Google OAuth client, paste credentials into
Supabase.

**Cost:** Free. ~15 min of clicks.

---

## Step 1 — Google Cloud Console project

If you don't have a Google Cloud project for SE7A yet:

1. **https://console.cloud.google.com** → sign in with your Google
   account
2. Top-left project selector → **New Project**
3. **Project name:** `SE7A`
4. **Organization:** leave as "No organization" if you don't have one
5. Click **Create**
6. Wait ~10 sec, then select the new project from the top-left dropdown

If you already have one, select it.

---

## Step 2 — Configure the OAuth consent screen

This is what users see on the Google sign-in page.

1. Left sidebar → **APIs & Services** → **OAuth consent screen**
2. **User Type:** select **External** (unless you have a Google
   Workspace org, then Internal works too). Click Create.
3. Fill in the OAuth consent screen form:

### App information
- **App name:** `SE7A`
- **User support email:** your email (`basem.aboulhosn@gmail.com`
  works)
- **App logo:** upload the SE7A icon (120×120 PNG). Use
  `~/Downloads/se7a-logo-extracted/se7a-logo/ios/AppIcon-1024.png` —
  Google will downscale it. Solid dark background, matches what users
  see on their home screen.

### App domain
- **Application home page:** `https://se7a.app`
- **Application privacy policy link:** `https://se7a.app/privacy`
- **Application terms of service link:** `https://se7a.app/terms`

### Authorized domains
- Click **Add Domain** → `se7a.app`

### Developer contact information
- Your email again

4. Click **Save and Continue**

### Scopes screen
5. Click **Add or Remove Scopes**
6. Check: `.../auth/userinfo.email` and `.../auth/userinfo.profile`
   and `openid`
7. Click **Update** → **Save and Continue**

### Test users (if your app is in "Testing" status)
8. Add your personal Google account(s) → **Save and Continue**

### Summary
9. Review → **Back to Dashboard**

### Publishing status
- Initially your app is in **Testing** mode — only test users can sign
  in. For production, click **Publish App** at the top. Google may
  require verification for sensitive scopes, but for `email` and
  `profile` only, publishing is instant.

---

## Step 3 — Create the OAuth 2.0 Client ID

1. Left sidebar → **APIs & Services** → **Credentials**
2. **+ Create Credentials** → **OAuth client ID**
3. **Application type:** **Web application**
4. **Name:** `SE7A Supabase OAuth` (internal label)

### Authorized JavaScript origins
Leave empty (not used for mobile OAuth)

### Authorized redirect URIs
Click **Add URI** → paste:
```
https://uierkrqfubcfosxeyynm.supabase.co/auth/v1/callback
```

(This is Supabase's auth callback. Must match exactly — no trailing
slash.)

5. Click **Create**

A dialog pops up with your **Client ID** and **Client Secret**.
**Copy both now** — you'll paste them into Supabase in Step 4.

This is the **Web client**. SE7A also needs an **iOS client** for the
native Google Sign-In SDK (see Step 3b).

---

## Step 3b — Create the iOS OAuth client (for the native SDK)

This separate client lets the mobile app bypass `ASWebAuthenticationSession`
entirely, which removes the iOS *"SE7A Wants to Use supabase.co to Sign In"*
system dialog.

1. Same **Credentials** page → **+ Create Credentials** → **OAuth client ID**
2. **Application type:** **iOS**
3. **Name:** `SE7A iOS`
4. **Bundle ID:** `app.se7a.mobile`
5. Click **Create**

Note the **iOS Client ID** (format: `NNNNN-xxxxx.apps.googleusercontent.com`)
and the **iOS URL scheme** (format: `com.googleusercontent.apps.NNNNN-xxxxx`
— it's the client ID reversed and prefixed). Both go into the
environment variables in Step 5.

---

## Step 4 — Paste into Supabase

1. Supabase dashboard → **Authentication** → **Providers**
2. Find **Google** → click to expand
3. Toggle on **"Use custom OAuth credentials"** (or similar — Supabase
   UI varies)
4. Paste:
   - **Client ID (OAuth 2.0 ID):** your Google Client ID
   - **Client Secret:** your Google Client Secret
5. Click **Save**

The Supabase shared client is now bypassed — users will see your
branded SE7A consent screen.

### Also add the iOS Client ID to Supabase's allow-list

Supabase verifies the Google ID token the mobile SDK returns against the
Google client that issued it. For Supabase to accept tokens issued by
our iOS client, add that client's ID to the allow-list:

1. Same Google provider page in Supabase dashboard
2. Scroll to **Authorized Client IDs** (or similar wording — Supabase UI varies)
3. Paste the **iOS Client ID** from Step 3b
4. Save

---

## Step 5 — Add environment variables for the mobile app

The native SDK + Expo plugin read three env vars at build time. Add them
to the mobile project's `.env` (or EAS secrets if building in the cloud).
For `--local` builds, a `.env` file in `apps/mobile/` is picked up.

```
# Public — baked into the JS bundle, safe to ship
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=NNNNN-xxxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=NNNNN-yyyyy.apps.googleusercontent.com

# Build-time only — used by apps/mobile/app.config.js to register the
# iOS URL scheme on Info.plist. NOT prefixed with EXPO_PUBLIC_ because
# it doesn't need to be in the JS bundle, only present at prebuild time.
GOOGLE_IOS_REVERSED_CLIENT_ID=com.googleusercontent.apps.NNNNN-yyyyy
```

When these env vars are absent, the login screen falls back to the
WebBrowser OAuth path (what shipped in build 94) — so sign-in still
works but the iOS "Wants to Use supabase.co" dialog returns. That means
the iOS client setup + env vars + a fresh build are all required to
actually see the clean flow.

---

## Step 6 — Verify end-to-end

1. Cut a fresh iOS build (the native SDK + plugin need a new native
   build — JS reload is not enough): `cd apps/mobile && npx eas build
   --platform ios --profile production --local`
2. Upload the .ipa via Transporter
3. Install from TestFlight and open the Sign In screen
4. Tap **Continue with Google**
5. **You should now see (both screens clean):**
   - **No** iOS "SE7A Wants to Use supabase.co to Sign In" system dialog
     — the native SDK bypasses `ASWebAuthenticationSession` entirely
   - Google's native account picker opens directly, showing
     "Sign in to **SE7A**" (or your app name) — not the Supabase
     project subdomain
6. Pick an account → session created → user is logged into SE7A

---

## Note on publishing / verification

Google requires app verification for:
- Apps using sensitive scopes (gmail.readonly, drive.file, etc.)
- Apps with >100 users in production

**SE7A requests only `email`, `profile`, `openid`** → these are
non-sensitive. Publishing is instant, no verification required, no
user cap.

If Google asks you to verify your domain (`se7a.app`), use Google
Search Console verification — add a TXT record to your DNS. Takes 5
min.

---

## About the "unverified app" warning

Even for non-sensitive scopes, Google might show a "Google hasn't
verified this app" warning if you're still in "Testing" mode. Users
can bypass by clicking "Advanced" → "Go to SE7A (unsafe)".

Fix: in OAuth consent screen settings, click **PUBLISH APP** at the
top. Status changes from "Testing" to "In production" instantly.
Warning disappears.

---

## When this breaks

| Problem | Likely cause | Fix |
|---|---|---|
| Users still see "Supabase" | Supabase still using default client | Confirm "Use custom OAuth credentials" is toggled ON |
| "redirect_uri_mismatch" error | Mismatch between Google's authorized URIs and what Supabase sends | Double-check the URI matches `https://PROJECT.supabase.co/auth/v1/callback` exactly |
| "This app is blocked" | OAuth consent screen is in Testing + you're not a test user | Add yourself as test user OR publish the app |
| Native Google sheet doesn't open, falls back to WebBrowser flow | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` or `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` missing at build time | Set both env vars + re-run `eas build --local`. The JS bundle bakes these in at build; adding them post-build has no effect. |
| `DEVELOPER_ERROR` / `12500` in Sentry | The iOS Client ID's bundle ID doesn't match `app.se7a.mobile`, or the plist's REVERSED_CLIENT_ID is wrong | Re-create the iOS OAuth client with bundle ID `app.se7a.mobile` exactly, update `GOOGLE_IOS_REVERSED_CLIENT_ID`, rebuild |
| `invalid_token` from `signInWithIdToken` | The iOS Client ID isn't in Supabase's Authorized Client IDs list | Paste the iOS Client ID into Supabase → Authentication → Providers → Google → Authorized Client IDs |
| iOS reviewer sees warning banner | App is in "Testing" status in Google Cloud | Publish to Production in OAuth consent screen settings |
