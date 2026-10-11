# SE7A — App Store listing copy

Paste-ready content for the App Store Connect listing. Every field App
Store Connect asks for is filled in below.

---

## Name (30 chars max)

`SE7A · AI Food & Fitness`

**Alt if the '·' character isn't accepted:**
`SE7A - AI Food & Fitness`

## Subtitle (30 chars max)

`Honest ranges, real coach`

**Alts:**
- `Scan meals. Coach in pocket.`
- `AI coach that speaks Gulf.`

## Promotional text (170 chars — updatable without review)

`Honest calorie ranges from a photo — not fake precision. Personalized workout program, Gulf-food-aware scans, and an AI coach that knows your macros.`

## Description (4000 chars)

```
SE7A is an AI food and fitness coach built for the Gulf. Scan a plate,
scan a menu, ask a coach — and get honest ranges instead of the fake
precision every other tracking app pretends to offer.

WHY SE7A DIFFERENT
• Ranges, not point values. A photo can't see the oil, and we don't
  pretend it can. Every meal returns "540–680 kcal" so you know what's
  guesswork and what isn't.
• Gulf-first. Machboos, mansaf, kunafa, karak — we know what these
  are. Menu scans read Arabic and English. Coach knows halal is the
  default.
• Real program. Answer 11 short questions during setup and get a
  workout plan sized to your equipment, experience, and days per
  week. Log sets with a built-in rest timer.
• AI coach that knows your data. Ask "is shawarma OK tonight?" and
  the coach factors in your remaining kcal, your goal, your training
  day.

WHAT YOU CAN DO
• Plate scan — snap a photo, get calorie + macro ranges + a running
  ledger for the day
• Menu scan — the AI reads the menu and ranks dishes against your
  remaining budget before you order
• Body scan — an honest body-fat range with weeks-to-goal, no scale
  needed. Photo processed in memory, never stored.
• Manual entry — for foods you know cold
• Recent foods — one tap to re-log yesterday's coffee
• Coach chat — Gulf-region food + fitness Q&A, knows your profile
• Weekly recap push notification every Sunday
• Water tracking with one-tap +250ml
• Weight trend chart with 30/60/90 day view
• Intermittent fasting timer (12:12 through 24:0)
• Calendar view of every meal, workout, weigh-in, and water log
• Auto-import weight and body fat from Apple Health
• Personalized workout programs with rest timers and exercise swaps

PRIVACY THAT MEANS SOMETHING
• Body-composition photos are analyzed in memory and never stored
• Delete your account and all data from inside the app, any time
• No third-party ads, no third-party analytics of your health data
• Operated from Dubai. Governed by UAE data protection law.

HONEST DISCLAIMER
Nutrition and body-composition estimates are ranges, not diagnoses.
SE7A is a tool for coaching and tracking, not a medical device. If
you have a medical condition, are pregnant, or have a history of
disordered eating, talk to your doctor before making significant
dietary changes.

Ships in English and Arabic (العربية).
```

## Keywords (100 chars total, comma-separated, no spaces after commas)

`calorie,macro,tracker,shawarma,kabsa,gym,workout,IF,fasting,coach,arabic,gulf,uae,keto,cutting`

## Category

- **Primary:** Health & Fitness
- **Secondary:** Food & Drink

## Support URL

`https://se7a.app/`

## Marketing URL

`https://se7a.app/`

## Privacy Policy URL

`https://se7a.app/privacy`

## Terms of Service URL

`https://se7a.app/terms`

---

## Age rating questionnaire answers

Apple asks a series of yes/no questions. Answers:

| Question | Answer |
|---|---|
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Prolonged graphic or sadistic realistic violence | None |
| Profanity or crude humor | None |
| Mature/suggestive themes | None |
| Horror/fear themes | None |
| Medical/treatment information | Infrequent/Mild |
| Alcohol, tobacco, or drug use or references | None |
| Simulated gambling | None |
| Sexual content or nudity | None |
| Graphic sexual content and nudity | None |
| Unrestricted web access | No |
| Gambling and contests | No |

**Reasoning for "Medical/treatment information: Infrequent/Mild":**
SE7A displays calorie estimates, body-fat ranges, and coaching advice
that touches on health topics. Every output includes disclaimers that
it's not medical advice. Rating this "None" would be dishonest given
the nutrition + fitness scope; "Frequent/Intense" would overstate it.

**Expected rating:** 4+ (some apps in this category rate 17+ if they
include harmful diet advice — SE7A explicitly refuses to for users
under 16 or with BMI < 17, so 4+ is defensible).

---

## App Privacy — data types collected

Apple's Privacy Nutrition Label answers are documented in detail at
`docs/privacy-label-spec.md`. Short version:

**Data linked to you (all categories):**
- Contact Info (email, name)
- Health & Fitness (weight, body fat, workouts, cardio, sleep, cycle,
  glucose if integrated)
- Financial Info (purchase history via RevenueCat)
- User Content (meal photos, menu photos, voice meal logs, chat with
  coach, logged meals/workouts/water)
- Identifiers (user ID, device push token)
- Purchases (same as Financial Info — ASC asks twice)
- Usage Data (PostHog product analytics)
- Diagnostics (Sentry errors + 10% transaction sampling)

**Data not linked to you:**
- None (everything is tied to the user_id)

**Data used for tracking:**
- None. No advertising SDKs, no IDFA, no cross-app tracking.

---

## App Review Information

**Sign-in required:** Yes

**Demo account:**
- Email: `<TBD — set when reviewer account is provisioned>`
- Password: `<TBD>`
- Sign-in method: on the Sign In screen, enter the credentials in the
  default email + password fields. (The app also supports Google OAuth
  and Sign in with Apple as alternatives.)

The reviewer account is pre-granted Pro entitlement server-side via
the `APPLE_REVIEW_USER_ID` env override — no purchase needed to test
Pro-gated features (Coach, Meal Plan, Menu scan, Body scan).

**Notes for the reviewer:**
See `docs/app-review-notes.md` for the full script.

---

## Export compliance

- **Uses non-exempt encryption?** No.
- `ITSAppUsesNonExemptEncryption` is set to `false` in `Info.plist`.

## Availability

- **Countries:** Start with UAE, KSA, Kuwait, Bahrain, Qatar, Oman
  (Gulf-first). Expand to remaining MENA + Europe/US after v1 feedback.
- **Price:** Free download. Pro subscription in-app:
  - Monthly: 29 AED (~$8)
  - Annual: 249 AED (~$68, ~28% savings vs monthly)
  - One-time 90-Day Plan Report: 19 AED
- See `docs/iap-setup.md` for exact product IDs and ASC setup.

## Version release notes (first release)

```
Welcome to SE7A — honest nutrition and fitness built for the Gulf.

What's inside:
- Plate scan: snap any meal, get calorie and macro ranges you can
  actually trust (no fake precision)
- Menu scan: point the camera at a restaurant menu and see which
  dishes fit your remaining budget today (Pro)
- AI Coach: ask anything about food, training, or progress — in
  English or Arabic (Pro)
- Personalized meal plans built around your macros, dislikes, and
  cultural preferences (Pro)
- Workout programs matched to your goal, experience, and equipment
- Weight, body-composition, water, sleep, cycle tracking
- Apple Health auto-sync for weight and workouts
- Full Arabic support with native right-to-left layout
- Honest body-fat ranges from a photo — image never stored
- Delete everything at any time, right from Settings
```
