# Sign in with Apple — Developer Portal + Supabase setup

Code side is already shipped. This doc covers the two external systems that need configuration before Sign in with Apple actually works end-to-end.

## Prerequisites checklist

- ✅ `expo-apple-authentication` installed
- ✅ `com.apple.developer.applesignin` entitlement in `app.json`
- ✅ `usesAppleSignIn: true` flag set
- ✅ Apple sign-in button added to login screen (iOS only, gated on `isAvailableAsync`)
- ✅ `supabase.auth.signInWithIdToken({ provider: "apple" })` wired up
- ⏳ Apple Developer: enable Sign in with Apple for App ID + create Services ID
- ⏳ Supabase: configure Apple provider with Services ID + key

---

# Part A — Apple Developer portal (~15 min)

## Step 1 — Enable Sign in with Apple for your App ID

1. **https://developer.apple.com** → sign in
2. **Certificates, Identifiers & Profiles** → **Identifiers**
3. Find `app.se7a.mobile` → click it
4. In the Capabilities list, scroll to **Sign in with Apple** → check the box
5. Click **Edit** next to it → leave as **"Enable as a primary App ID"** → Save
6. Click **Save** at the top-right → Apple will warn that you need to regenerate provisioning profiles. EAS does this automatically on next build.

## Step 2 — Create a Services ID (for Supabase OAuth callback)

Apple needs a separate "Services ID" to let Supabase act as an OAuth client.

1. Same page → **Identifiers** → **+** button
2. Pick **Services IDs** → Continue
3. **Description:** `SE7A Sign in with Apple`
4. **Identifier:** `app.se7a.mobile.auth` (any unique string — this is NOT the same as the bundle ID; convention is to append `.auth` or `.service`)
5. Click Continue → Register

Now configure it:

1. Click into the newly created Services ID
2. Check **Sign in with Apple** → Click **Configure**
3. **Primary App ID:** select `app.se7a.mobile` from the dropdown
4. **Domains and Subdomains:** add `uierkrqfubcfosxeyynm.supabase.co` (your Supabase project domain — strip `https://`)
5. **Return URLs:** add `https://uierkrqfubcfosxeyynm.supabase.co/auth/v1/callback`
6. Save → Continue → Save

## Step 3 — Create a signing key

Supabase needs a private key to validate Apple's ID tokens.

1. Same page → **Keys** (sidebar) → **+** button
2. **Key Name:** `SE7A Sign in with Apple key`
3. Check **Sign in with Apple** → click **Configure**
4. **Primary App ID:** `app.se7a.mobile` → Save
5. Continue → Register
6. **DOWNLOAD THE .p8 FILE NOW** — this is the only chance. Save it somewhere safe (1Password, encrypted vault, offline drive).
7. **Copy the Key ID** (10 characters, shown on the Keys list after creation)
8. Also note your **Team ID**: top-right corner of developer portal shows it (10 chars like `WFPM8238WC`)

---

# Part B — Supabase Apple provider (~5 min)

## Step 4 — Enable Apple provider

1. Supabase dashboard → **Authentication** → **Providers**
2. Find **Apple** → click → toggle **Enable Apple provider**

## Step 5 — Fill in the credentials

Three fields to fill:

### Services ID (Client ID)
Paste the Services ID identifier from Step 2 above.
→ `app.se7a.mobile.auth`

### Team ID
Your Apple Developer Team ID (from Step 3, step 8).
→ `WFPM8238WC`

### Key ID
From Step 3, step 7.
→ `XXXXXXXXXX` (10 chars)

### Secret Key (for OAuth)
This is NOT the raw .p8 contents. Supabase expects a JWT signed with the .p8 key, OR newer Supabase versions accept the .p8 pasted directly.

**If Supabase has a "Secret Key (for OAuth)" multiline field:**
- Open your `.p8` file in a text editor
- Paste the **entire contents** including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
- Save

**If Supabase has separate "Client Secret" field asking for a JWT:**
- Use this tool to generate the JWT: https://github.com/supabase/sign-in-with-apple-helper
- Or run locally:
  ```bash
  npx @supabase/sign-in-with-apple-helper
  ```
- Follow the prompts, paste the result

### Save

Click **Save** at the bottom of the Supabase Apple provider page.

## Step 6 — Verify redirect URL matches

Still in Supabase → **Authentication** → **URL Configuration**:
- **Site URL:** `https://se7a.app` (should already be set)
- **Redirect URLs:** must include:
  - `se7a://auth/callback` (for mobile deep link)
  - `https://uierkrqfubcfosxeyynm.supabase.co/auth/v1/callback` (OAuth return URL — must match what you set in Apple Services ID Step 2)

---

# Part C — Build and test

## Step 7 — Rebuild the app

The `expo-apple-authentication` plugin modifies iOS entitlements, so a native rebuild is required. The Expo-managed JS reload won't do it.

- Push to CodeMagic → trigger a new build → wait ~20 min
- Or run `eas build --platform ios --profile preview` if you have EAS set up

## Step 8 — Test on device

Apple sign-in requires a real device signed into iCloud. Simulator will fail with `ERR_UNKNOWN`.

1. Install new TestFlight build
2. Open Sign In screen
3. You should see a native black "Sign in with Apple" button above Google
4. Tap it → iOS native sheet prompts for Face ID / Touch ID
5. Choose "Share My Email" or "Hide My Email" → confirm
6. Back in app: should be logged in → routed to onboarding (first time) or home (returning)

---

# Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Button doesn't appear on device | `isAvailableAsync` returned false | iOS version < 13 (unlikely), or `usesAppleSignIn` missing from app.json |
| "Invalid grant" / sign-in fails silently | Services ID or Return URL mismatch | Re-verify Step 2 Services ID matches what Supabase has; return URL must be EXACTLY `https://PROJECT.supabase.co/auth/v1/callback` |
| "Invalid client" error | Key ID or Team ID wrong | Re-copy from Apple Developer portal, no leading/trailing whitespace |
| Sign-in works but email is `random@privaterelay.appleid.com` | User chose "Hide My Email" | This is Apple's privacy relay — it's a real forwarding address. Expected behavior. |
| Second sign-in with same Apple ID returns `null` name | Apple only returns name on FIRST sign-in | Store name on first sign-in to profiles table; don't rely on it being present every time |

---

# About "Hide My Email"

When a user picks **Hide My Email**, Apple generates a unique email like `abc123.xyz@privaterelay.appleid.com` and forwards it to the user's real inbox. This appears as a real email in your Supabase `auth.users.email` field.

- Treat it as a real email (it is — delivery works)
- Don't flag these as spam / fake in any validation logic
- If the user later disconnects your app from Apple, that relay email becomes undeliverable (same as any abandoned account)

---

# What App Review wants to see

Apple's Guideline 4.8 is specifically checked during review. The reviewer will:

1. See you have Google / third-party sign-in
2. Confirm Sign in with Apple button is present
3. Try signing in with their test Apple ID
4. Verify the account creates / signs in successfully

If any of these fail, the app will be rejected with a 4.8 reference.

---

# After it works

You can mention this in review notes:
> Sign in with Apple is implemented alongside Google OAuth and email/password per Guideline 4.8. Test on any iOS device signed into iCloud.
