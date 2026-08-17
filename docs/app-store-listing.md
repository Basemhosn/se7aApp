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

`https://se7a.vercel.app/`

## Marketing URL

`https://se7a.vercel.app/`

## Privacy Policy URL

`https://se7a.vercel.app/privacy`

## Terms of Service URL

`https://se7a.vercel.app/terms`

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

Apple's Privacy Nutrition Label. Answers:

**Data linked to you:**
- Email address (account authentication)
- Health & Fitness — weight, body fat, meal logs, workout logs,
  water intake

**Data not linked to you:**
- None

**Data collected but not used for tracking:**
- All of the above; nothing is used for cross-app tracking.

**Tracking:**
- No third-party tracking. No advertising SDKs. Sentry is used for
  crash/error reporting (self-hosted equivalent purposes; not for
  cross-app identification).

---

## App Review Information

**Sign-in required:** Yes

**Demo account:**
- Email: `apple-review@se7a.app`
- Password: N/A — SE7A uses magic-link auth. Have the reviewer email
  `hello@se7a.app` for a live magic link, OR pre-provision a review
  account with a fixed OTP code (Supabase allows this via admin
  panel).

**Alternative for reviewers:** email hello@se7a.app before submission
so the team can create a temporary demo account with a one-time link
that stays valid throughout the review period.

**Notes for the reviewer:**
See `docs/app-review-notes.md` for the full script.

---

## Export compliance

- **Uses non-exempt encryption?** No.
- `ITSAppUsesNonExemptEncryption` is set to `false` in `Info.plist`.

## Availability

- **Countries:** Start with UAE, KSA, Kuwait, Bahrain, Qatar, Oman
  (Gulf-first). Expand to remaining MENA + Europe/US after beta.
- **Price:** Free (during beta). No IAP configured yet.

## Version release notes (first release)

```
Welcome to SE7A.

- Scan plates, menus, and physique photos to get honest calorie and
  macro ranges — no fake precision.
- 11-question setup builds a workout plan matched to your goal,
  experience, and equipment.
- AI coach knows Gulf cuisine and your macros. Ask anything.
- Auto-sync weight and body fat from Apple Health.
- Weekly recap notification every Sunday.
- Full Arabic support with right-to-left layout.
- Delete everything at any time. Body-composition photos never stored.
```
