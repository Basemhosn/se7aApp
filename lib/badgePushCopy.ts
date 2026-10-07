/**
 * Server-side badge push copy. Mirrors a subset of
 * apps/mobile/src/lib/i18n/locales/*.json `badges.catalog.<key>.{t,d}`
 * — the two values we need to compose a notification title + body
 * ("You earned <Title> — <description>.").
 *
 * Keeping this duplicated (instead of importing the full i18n JSON on
 * the server) keeps bundle size small and avoids pulling mobile
 * locale files into the Next.js server runtime.
 */

export type BadgeLocale = "en" | "ar";

interface Copy {
  en: { t: string; d: string };
  ar: { t: string; d: string };
}

const BADGE_COPY: Record<string, Copy> = {
  // ── Firsts ────────────────────────────────────────────────
  first_meal: {
    en: { t: "First Bite", d: "You logged your first meal" },
    ar: { t: "اللقمة الأولى", d: "سجّلت أول وجبة" },
  },
  first_plate_scan: {
    en: { t: "Snap Judgement", d: "You scanned your first plate" },
    ar: { t: "لمحة بصر", d: "صوّرت أول طبق" },
  },
  first_menu_scan: {
    en: { t: "Menu Reader", d: "You scanned your first menu" },
    ar: { t: "قارئ القائمة", d: "صوّرت أول قائمة طعام" },
  },
  first_barcode: {
    en: { t: "Beep Beep", d: "You scanned your first barcode" },
    ar: { t: "بيب بيب", d: "صوّرت أول باركود" },
  },
  first_voice_log: {
    en: { t: "Say Cheese", d: "You logged a meal with your voice" },
    ar: { t: "قل تشيز", d: "سجّلت وجبة بصوتك" },
  },
  first_weighin: {
    en: { t: "On the Scale", d: "First weigh-in logged" },
    ar: { t: "على الميزان", d: "سجّلت أول وزن" },
  },
  first_water: {
    en: { t: "Hydrated", d: "First water log in" },
    ar: { t: "ترطيب", d: "سجّلت أول كأس ماء" },
  },
  first_workout: {
    en: { t: "First Set", d: "First workout logged" },
    ar: { t: "أول تمرين", d: "سجّلت أول تمرين" },
  },

  // ── Streaks ───────────────────────────────────────────────
  streak_3d: {
    en: { t: "3-Day Streak 🔥", d: "Three days in a row" },
    ar: { t: "٣ أيام متتالية 🔥", d: "ثلاثة أيام على التوالي" },
  },
  streak_7d: {
    en: { t: "7-Day Streak 🔥", d: "A full week logged" },
    ar: { t: "٧ أيام متتالية 🔥", d: "أسبوع كامل مسجّل" },
  },
  streak_30d: {
    en: { t: "30-Day Streak 🔥", d: "A month without missing a day" },
    ar: { t: "٣٠ يوم متتالي 🔥", d: "شهر دون انقطاع" },
  },
  streak_100d: {
    en: { t: "100-Day Streak 🏆", d: "Triple-digit consistency" },
    ar: { t: "١٠٠ يوم 🏆", d: "ثبات ثلاثي الأرقام" },
  },
  streak_365d: {
    en: { t: "365-Day Streak 👑", d: "A full year — unreal" },
    ar: { t: "٣٦٥ يوم 👑", d: "سنة كاملة — رائع" },
  },

  // ── Meal volume ───────────────────────────────────────────
  logged_10: {
    en: { t: "10 Meals Logged", d: "You're building the habit" },
    ar: { t: "١٠ وجبات مسجّلة", d: "تبني العادة" },
  },
  logged_50: {
    en: { t: "50 Meals Logged", d: "Consistency is paying off" },
    ar: { t: "٥٠ وجبة", d: "الثبات يُثمر" },
  },
  logged_100: {
    en: { t: "100 Meals Logged", d: "Centurion" },
    ar: { t: "١٠٠ وجبة", d: "القرن الأول" },
  },
  logged_500: {
    en: { t: "500 Meals Logged", d: "Dedicated" },
    ar: { t: "٥٠٠ وجبة", d: "متفانٍ" },
  },
  logged_1000: {
    en: { t: "1000 Meals Logged", d: "Elite tier" },
    ar: { t: "١٠٠٠ وجبة", d: "الطبقة النخبوية" },
  },

  // ── Weight loss ───────────────────────────────────────────
  weight_lost_1kg: {
    en: { t: "First Kilo Down", d: "The scale is moving" },
    ar: { t: "أول كيلو", d: "الميزان يتحرك" },
  },
  weight_lost_5kg: {
    en: { t: "5kg Down 🎯", d: "Noticeable progress" },
    ar: { t: "٥ كجم ناقصة 🎯", d: "تقدم ملحوظ" },
  },
  weight_lost_10kg: {
    en: { t: "10kg Down 🏆", d: "Life-changing" },
    ar: { t: "١٠ كجم ناقصة 🏆", d: "تغيير جذري" },
  },
  weight_lost_25kg: {
    en: { t: "25kg Down 👑", d: "Transformational" },
    ar: { t: "٢٥ كجم ناقصة 👑", d: "تحوّل كامل" },
  },

  // ── Workouts ──────────────────────────────────────────────
  workouts_10: {
    en: { t: "10 Workouts", d: "The gym is a habit now" },
    ar: { t: "١٠ تمارين", d: "النادي صار عادة" },
  },

  // ── Goals ─────────────────────────────────────────────────
  kcal_goal_hit_1: {
    en: { t: "Target Hit", d: "Day one in the green" },
    ar: { t: "تحقّق الهدف", d: "أول يوم في الهدف" },
  },
  kcal_goal_streak_7d: {
    en: { t: "7-Day Target Streak", d: "A full week in the green" },
    ar: { t: "٧ أيام في الهدف", d: "أسبوع كامل في الهدف" },
  },
  kcal_goal_streak_30d: {
    en: { t: "30-Day Target Streak", d: "A month in the green" },
    ar: { t: "٣٠ يوم في الهدف", d: "شهر كامل في الهدف" },
  },

  // ── Water ─────────────────────────────────────────────────
  water_streak_3d: {
    en: { t: "3-Day Hydration Streak 💧", d: "Three days of water goals hit" },
    ar: { t: "٣ أيام ترطيب 💧", d: "ثلاثة أيام على التوالي" },
  },
  water_streak_10d: {
    en: { t: "10-Day Hydration Streak 💧", d: "Ten days of water goals hit" },
    ar: { t: "١٠ أيام ترطيب 💧", d: "عشرة أيام" },
  },

  clean_sweep: {
    en: { t: "Clean Sweep ✨", d: "Every meal slot filled today" },
    ar: { t: "اليوم مكتمل ✨", d: "كل الوجبات مسجّلة" },
  },
};

export function badgeNotificationCopy(
  badgeKey: string,
  locale: BadgeLocale
): { title: string; body: string } | null {
  const c = BADGE_COPY[badgeKey];
  if (!c) return null;
  const picked = c[locale] ?? c.en;
  return {
    title: locale === "ar" ? `حصلت على: ${picked.t}` : `You earned: ${picked.t}`,
    body: picked.d,
  };
}
