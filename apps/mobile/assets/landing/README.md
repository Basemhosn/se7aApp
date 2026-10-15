# Landing screenshots

Drop real device screenshots here when ready. The DeviceFrame component
on each landing card will swap from the built-in placeholder to the
real screenshot automatically.

## Required files

- `landing-home.png` — Home tab, showing the "remaining today" range
  prominently. Used on card 1 (Honest ranges).
- `landing-plate.png` — Plate scan result, showing a logged meal with
  range + macro pills. Used on card 2 (Gulf cuisine).
- `landing-coach.png` — Coach chat in Arabic RTL, 1 user bubble + 1
  coach reply. Used on card 3 (AI coach).

## Spec

- iPhone 15 Pro Max (6.7") — 1290 × 2796 px, PNG
- Clean status bar (9:41, 100% battery, 3 wifi bars):
  ```
  xcrun simctl status_bar iPhone-15-Pro-Max override --time 9:41 \
    --batteryLevel 100 --wifiBars 3 --cellularBars 4
  ```
- Capture on a well-populated account (3+ weeks of history) so the UI
  looks lived-in, not sparse

## Wiring the screenshots in

Once dropped in, edit `apps/mobile/app/landing.tsx` lines ~56-71 and
replace `screenshot={null}` with the require path:

```tsx
<FeatureCard
  screenshot={require("../assets/landing/landing-home.png")}
  placeholder={<PlaceholderRanges />}
/>
```

The DeviceFrame automatically picks the screenshot when present and
falls back to the placeholder when null.
