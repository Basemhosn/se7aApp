# IAP Setup — App Store Connect + RevenueCat

Three products to create:

| Product ID | Type | Price (base: UAE) |
|------------|------|---------|
| `se7a_pro_monthly` | Auto-Renewable Subscription | 19 AED/mo |
| `se7a_pro_annual` | Auto-Renewable Subscription | 149 AED/yr |
| `se7a_report_90day` | Consumable (non-subscription) | 19 AED one-time |

**RevenueCat entitlement:** `pro` (grants when either `_monthly` or `_annual` is active)

---

# PART 1 — App Store Connect

## Step 1 — Open the IAP section

1. **https://appstoreconnect.apple.com** → sign in
2. Click **My Apps** → SE7A
3. In the left sidebar: **Monetization** → **Subscriptions**

## Step 2 — Create the Subscription Group

Auto-renewable subscriptions MUST live in a group — users can only have one active sub per group at a time.

1. In the Subscriptions section, click **+** next to "Subscription Groups"
2. **Reference Name:** `SE7A Pro` (internal only, users don't see this)
3. Click **Create**

A new group row appears. Click into it.

## Step 3 — Localize the Group

The group needs at least one localized display name.

1. In the Subscription Group → **Localization** section → click **+**
2. **Language:** English (U.S.)
3. **Subscription Group Display Name:** `SE7A Pro`
4. **App Name:** `SE7A`
5. Save

Repeat for Arabic (as primary market):
- Language: Arabic
- Display Name: `بريميوم SE7A`  (or `SE7A برو`)
- App Name: `SE7A`

## Step 4 — Create the Monthly Subscription

Still inside the Subscription Group:

1. Click **+** under "Subscriptions"
2. **Reference Name:** `SE7A Pro Monthly`
3. **Product ID:** `se7a_pro_monthly` ⚠️ **This must match EXACTLY — case sensitive**
4. Click **Create**

Now the detail page opens. Fill in:

### Subscription Duration
- **Subscription Duration:** `1 Month`

### Subscription Prices
1. Click **+** next to "Subscription Prices"
2. **Base Country/Region:** **United Arab Emirates**
3. **Price:** `19 AED`
4. Click **Next** → Apple shows auto-calculated prices for all other regions. Review, click **Confirm**.

### Review Information
*(ASC requires a screenshot showing the paywall where users see this product)*
1. **Review Notes:** `Paywall shows this as the Monthly option (19 AED/mo). Accessible from Settings → Subscription or when user hits a Pro-gated feature.`
2. **Screenshot:** Upload a screenshot of your paywall screen showing both options. (640×920 or larger for iPhone, PNG/JPEG)

### Localizations
1. Click **+** → **Add Language** → English
2. **Subscription Display Name:** `Monthly`
3. **Description:** `Full access to AI Coach, meal plans, menu scanning, and body scans. Billed monthly.`
4. Save

Repeat for Arabic:
- Display Name: `شهريًا`
- Description: `وصول كامل إلى المدرب الذكي، خطط الوجبات، مسح القوائم، ومسح الجسم. فوترة شهرية.`

### Introductory Offer (optional for v1 — SKIP for now)
Can add a free trial later via "Subscription Offers" if desired.

### Save the subscription
Click **Save** top right. Status changes to **Ready to Submit** (ASC will auto-submit it alongside the app review).

## Step 5 — Create the Annual Subscription

Repeat Step 4 with these values:

- **Reference Name:** `SE7A Pro Annual`
- **Product ID:** `se7a_pro_annual`
- **Subscription Duration:** `1 Year`
- **Base Price (UAE):** `149 AED`
- **Review Notes:** `Paywall shows this as the Annual option (149 AED/yr — ~35% savings vs monthly). Default-selected on the paywall.`
- **Screenshot:** Same paywall screenshot as monthly
- **English Display Name:** `Annual`
- **English Description:** `Full access to all Pro features. Save ~35% vs monthly. Billed yearly.`
- **Arabic Display Name:** `سنويًا`
- **Arabic Description:** `وصول كامل إلى جميع ميزات برو. وفّر ~٣٥٪ مقابل الاشتراك الشهري. فوترة سنوية.`

## Step 6 — Create the Consumable (90-Day Report)

Consumables live in a different section than subscriptions.

1. ASC left sidebar: **Monetization** → **In-App Purchases**
2. Click **+** next to "In-App Purchases"
3. **Type:** `Consumable`
4. **Reference Name:** `SE7A 90-Day Plan Report`
5. **Product ID:** `se7a_report_90day`
6. Click **Create**

Fill in the detail page:

### Availability
Default: all territories enabled. Leave as-is.

### Price Schedule
- **Base Country/Region:** United Arab Emirates
- **Price:** `19 AED`
- Confirm

### Localization
English:
- **Display Name:** `90-Day Plan Report`
- **Description:** `A personalized 90-day fat-loss or muscle-gain plan with calibrated calorie and macro targets, workout framework, and weekly check-in guidance.`

Arabic:
- **Display Name:** `خطة ٩٠ يومًا`
- **Description:** `خطة شخصية ٩٠ يومًا لإنقاص الدهون أو زيادة العضلات، مع أهداف سعرات ومكرو مُعايَرة، إطار تمارين، وإرشادات متابعة أسبوعية.`

### Review Information
- **Review Notes:** `One-time purchase (consumable) for a personalized long-form plan. Accessible from the Report tab. Each purchase entitles one report generation.`
- **Screenshot:** Screenshot of the Report tab showing the purchase CTA.

Save → status becomes **Ready to Submit**.

---

# PART 2 — RevenueCat

## Step 7 — Add the products to RevenueCat

1. **https://app.revenuecat.com** → sign in → pick your SE7A project
2. Left sidebar: **Products**
3. Click **+ New** → **Add Product**

Create three products. For each:

### Product 1 — Monthly
- **Store:** App Store
- **Identifier:** `se7a_pro_monthly` (must match ASC exactly)
- **Type:** Auto-Renewable Subscription
- Save

### Product 2 — Annual
- **Store:** App Store
- **Identifier:** `se7a_pro_annual`
- **Type:** Auto-Renewable Subscription
- Save

### Product 3 — Report
- **Store:** App Store
- **Identifier:** `se7a_report_90day`
- **Type:** Consumable
- Save

## Step 8 — Configure the "pro" Entitlement

1. Left sidebar: **Entitlements**
2. If an entitlement called `pro` already exists → click it. Else click **+ New** → identifier: `pro`
3. In the entitlement's **Attached Products** section → click **+** → add:
   - `se7a_pro_monthly`
   - `se7a_pro_annual`
   - **Do NOT add** `se7a_report_90day` — the report is a one-time thing, not a Pro grant
4. Save

## Step 9 — Create the Offering

An "offering" is the set of packages shown to users on the paywall. RC lets you A/B test multiple offerings; we need one.

1. Left sidebar: **Offerings**
2. Click **+ New Offering**
3. **Identifier:** `default` (lowercase; this is what the code calls `offerings.current`)
4. **Description:** `Primary paywall offering — monthly + annual`
5. Save

Open the newly created `default` offering → **Packages** section → click **+ Add Package**:

### Package 1 — Monthly
- **Identifier type:** Pick a predefined one → **$rc_monthly** (RC's reserved monthly identifier — the paywall code looks for `"monthly"` in the identifier)
- **Product:** `se7a_pro_monthly`
- Save

### Package 2 — Annual
- **Identifier type:** **$rc_annual** (reserved annual identifier — paywall code looks for `"annual"`)
- **Product:** `se7a_pro_annual`
- Save

**Important:** The paywall code at `apps/mobile/app/paywall.tsx:56-67` finds packages by matching `.identifier.toLowerCase().includes("annual")` or `"monthly"`. The reserved identifiers `$rc_monthly` and `$rc_annual` contain those substrings, so this works. If you use custom identifiers, make sure they contain the word.

### Mark as Current
In the Offerings list, your `default` offering must be marked as the **Current Offering** (there's usually a toggle or "Make Current" button). The mobile code calls `offerings.current` which returns whichever is marked current.

## Step 10 — Verify API keys are correct

The mobile app reads `EXPO_PUBLIC_RC_IOS_KEY` from env. The key must be an iOS public SDK key (starts with `appl_...`).

1. RC dashboard → **Project settings** → **API keys**
2. Confirm the **iOS App** entry → the public SDK key starts with `appl_`
3. If your `.env` or EAS secret has a different value, update it

---

# PART 3 — Verify end-to-end

Once ASC products are "Ready to Submit" and RC is wired:

1. On a TestFlight or dev build on your iPhone, open the paywall
2. You should see:
   - Monthly: `19 AED` (or your localized price)
   - Annual: `149 AED` with "~12.4 AED/mo" subtitle
3. Try a sandbox purchase (using a Sandbox Apple ID — set one up at ASC → Users and Access → Sandbox Testers)
4. Purchase should complete → entitlement `pro` should be active → Coach / Meal Plan / Menu scan should unlock

### If the paywall shows empty / "—"
- Check RC dashboard → Overview → the offering shows "0 packages" or similar
- Confirm the API key is `appl_...` not `test_...`
- Confirm products in RC are tied to the right ASC entries

---

# Common pitfalls

| Problem | Cause | Fix |
|---|---|---|
| Paywall shows nothing | API key is `test_...` not `appl_...` | Replace with real public SDK key from RC |
| "Product unavailable" error | ASC product status is "Missing Metadata" | Fill all required fields; status must say "Ready to Submit" |
| Annual price slot is empty but monthly works | Package identifier doesn't include "annual" | Use `$rc_annual` or ensure custom identifier contains the word |
| Purchase succeeds but Pro doesn't activate | Entitlement doesn't include the product | RC → Entitlements → `pro` → add the product |
| Only works in sandbox, fails in prod | ASC products not yet reviewed/approved | They review alongside the app; status becomes "Approved" after app approval |

---

# After this is done

- Products stay in **Ready to Submit** state until you submit the app for review
- Apple reviews IAPs alongside the app binary
- Once app is approved, products go to **Approved** state and are purchasable in production
- RevenueCat picks up live-mode purchases automatically — no additional config needed
