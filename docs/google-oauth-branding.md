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
- **App logo:** upload the SE7A icon (120×120 PNG, from your brand kit
  at `~/Downloads/se7a-icons/` — pick a square version with a solid
  background, not transparent)

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

---

## Step 5 — Verify end-to-end

1. On a TestFlight or dev build of SE7A, open the Sign In screen
2. Tap **Continue with Google**
3. The in-app browser opens the Google consent page
4. **You should now see:**
   - "SE7A" at the top (not "Supabase")
   - Your logo
   - "SE7A wants access to your Google account"
   - "Continue to **SE7A**" (not "Continue to supabase.co")
5. Tap Allow → OAuth completes → user is logged into SE7A

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
| iOS reviewer sees warning banner | App is in "Testing" status in Google Cloud | Publish to Production in OAuth consent screen settings |
