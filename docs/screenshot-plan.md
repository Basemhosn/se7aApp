# SE7A — App Store screenshot plan

Apple requires screenshots per device size class. For iPhone-only apps
you can get away with:

- **iPhone 6.7"** (Pro Max) — 1290 × 2796 — REQUIRED
- **iPhone 6.5"** (older Pro Max) — 1284 × 2778 — Apple will down-sample
  from 6.7" if not provided
- **iPhone 5.5"** (SE 2nd gen / older) — 1242 × 2208 — OPTIONAL post-2024

Take screenshots on a **Pro Max simulator** at 1290 × 2796. Apple will
scale.

## The 5 screenshots to capture (in order)

Each has a headline overlay + the actual screen. Overlay in Manrope
Bold 60pt gold. Background matches app bg (#0b0d0b).

### 1 — Hero: Home tab with a good "remaining today" number
Show `REMAINING TODAY · 850–1,050 kcal` with the workout card and
water ring visible below. This is the moment of clarity.

**Overlay text:** "Honest ranges. Not fake precision."

### 2 — Plate scan review (the AHA moment)
Show a plate of Gulf food (biryani + salad + fruit) with 3-4 items
listed, each with a checkbox and kcal range. Bottom card with the
plate total.

**Overlay text:** "Snap your meal. See what's guesswork."

### 3 — Menu scan with dishes categorized
Show the menu scan result with Order / Consider / Skip sections
populated. Regional dishes visible.

**Overlay text:** "Reads the menu. Ranks against your budget."

### 4 — Coach chat in Arabic (Gulf-first differentiator)
Full RTL Arabic conversation. User asks "شو أفضل عشا بميزانيتي؟"
(What's the best dinner within my budget?) — coach responds with
specific Gulf dishes and their macros.

**Overlay text:** "مدرب يعرف طعامك ." (English variant: "A coach that
knows your food.")

### 5 — Progress + trend chart
30-day weight chart with a clear downtrend, adherence card showing
"5/7 days", body scan link visible.

**Overlay text:** "Trend over weeks. Not any single day."

## Capture process

1. Sign in as `demo@se7a.app` (a well-populated account with 3+ weeks
   of history).
2. Open iOS Simulator → iPhone 15 Pro Max.
3. `Command+S` to save each screenshot to Desktop.
4. Rename: `01-home.png`, `02-plate.png`, `03-menu.png`, `04-coach-ar.png`,
   `05-progress.png`.
5. Add overlay text using Figma / Sketch / Canva. Template:
   - Gold text (#f6b73c) in Manrope Bold 60pt
   - Positioned in the top ~15% of the frame
   - Actual app screenshot fills the bottom 85%

## Uploading to App Store Connect

- 6.7" iPhone size class: upload all 5, ordered as above.
- Each language (English + Arabic) gets its own set. For Arabic,
  screenshot 4 is native RTL; others can also be recaptured with
  Arabic UI for a fully-localized listing.

## Gotchas

- Status bar: iOS Simulator lets you set a clean status bar via
  `xcrun simctl status_bar iPhone-15-Pro-Max override --time 9:41 --batteryLevel 100 --wifiBars 3 --cellularBars 4`.
- Fake data: use realistic ranges. Don't show `0 kcal remaining` or
  something that suggests the user is starving.
- Avoid personal info in the display name. Use `Basem` or something
  neutral.
- Screenshots must NOT include third-party IP (real restaurant menus
  from Applebee's, e.g.). Use SE7A-branded stock or your own kitchen.
