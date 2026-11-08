import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { PrefRow, settingsStyles } from "@/components/SettingsAtoms";

interface NotificationPrefs {
  streak_at_risk?: boolean;
  lunch_nudge?: boolean;
  weigh_in?: boolean;
  pr_celebration?: boolean;
  plan_your_week?: boolean;
  weekly_recap?: boolean;
}

/**
 * Notifications sub-screen. Fetches current prefs on mount, posts
 * individual toggles to /api/profile/prefs with optimistic UI + revert
 * on failure. Each pref defaults to true (opt-out model) so an API
 * failure that returns an empty object doesn't visually disable
 * every reminder.
 */
export default function NotificationsSettingsScreen() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  // Start with an empty prefs object instead of null — every toggle
  // uses the `!== false` pattern which treats undefined as true (the
  // opt-out default). This lets the screen render instantly with
  // sensible defaults; the server fetch then upgrades individual
  // values in place. Previously we gated the whole screen on `null`
  // which introduced a visible 200-400ms delay between tapping
  // "Notifications" and seeing any rows.
  const [prefs, setPrefs] = useState<NotificationPrefs>({});

  useEffect(() => {
    api<{ notification_prefs: NotificationPrefs }>("/api/profile/prefs")
      .then((r) => setPrefs(r.notification_prefs ?? {}))
      .catch(() => {
        /* keep defaults on fetch failure */
      });
  }, []);

  const togglePref = useCallback(
    async (key: keyof NotificationPrefs, value: boolean) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
      try {
        await api("/api/profile/prefs", {
          method: "POST",
          body: JSON.stringify({ notification_prefs: { [key]: value } }),
        });
      } catch {
        setPrefs((prev) => ({ ...prev, [key]: !value }));
      }
    },
    []
  );

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "الإشعارات" : "Notifications"}
      </Text>
      <View style={settingsStyles.card}>
          <PrefRow
            label={isArabic ? "خطر انكسار السلسلة" : "Streak at risk"}
            hint={isArabic ? "٨ مساءً إذا لم تسجل شيء" : "8 pm if you haven't logged"}
            value={prefs.streak_at_risk !== false}
            onChange={(v) => togglePref("streak_at_risk", v)}
          />
          <PrefRow
            label={isArabic ? "تنبيه الغداء" : "Lunch nudge"}
            hint={isArabic ? "١ ظهراً" : "1 pm reminder"}
            value={prefs.lunch_nudge !== false}
            onChange={(v) => togglePref("lunch_nudge", v)}
          />
          <PrefRow
            label={isArabic ? "الوزن الأسبوعي" : "Weekly weigh-in"}
            hint={isArabic ? "صباح الاثنين" : "Monday morning"}
            value={prefs.weigh_in !== false}
            onChange={(v) => togglePref("weigh_in", v)}
          />
          <PrefRow
            label={isArabic ? "احتفال PR" : "PR celebration"}
            hint={isArabic ? "بعد التمرين مباشرة" : "Right after a workout"}
            value={prefs.pr_celebration !== false}
            onChange={(v) => togglePref("pr_celebration", v)}
          />
          <PrefRow
            label={isArabic ? "خطة الأسبوع (Pro)" : "Plan your week (Pro)"}
            hint={isArabic ? "صباح الأحد" : "Sunday morning"}
            value={prefs.plan_your_week !== false}
            onChange={(v) => togglePref("plan_your_week", v)}
          />
          <PrefRow
            label={isArabic ? "التلخيص الأسبوعي" : "Weekly recap"}
            hint={isArabic ? "صباح الأحد" : "Sunday morning"}
            value={prefs.weekly_recap !== false}
            onChange={(v) => togglePref("weekly_recap", v)}
            last
          />
        </View>
    </Screen>
  );
}
