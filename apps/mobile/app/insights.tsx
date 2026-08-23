import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

interface Pattern {
  id: string;
  severity: "info" | "warn";
  title: string;
  body: string;
  evidence: Record<string, string | number>;
}

interface PatternsResponse {
  patterns: Pattern[];
  window_days: number;
}

const ICON_FOR_ID: Record<string, keyof typeof Ionicons.glyphMap> = {
  dow_kcal_bias: "calendar",
  late_night_eating: "moon",
  post_workout_sleep_drop: "bed",
  weekend_cardio_dip: "walk",
  fiber_sodium_days: "leaf",
  ramadan_drift: "moon",
  cycle_phase_kcal_drift: "sync",
  cycle_phase_workout_capacity: "barbell",
  cycle_phase_micro_drift: "nutrition",
};

export default function Insights() {
  const [data, setData] = useState<PatternsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<PatternsResponse>("/api/insights/patterns");
      setData(res);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <BackButton />
        <Text style={styles.kicker}>INSIGHTS</Text>
        <Text style={styles.title}>Patterns SE7A noticed</Text>
        <Text style={styles.sub}>
          {data
            ? `Last ${data.window_days} days of your data — no AI, just math.`
            : "Loading…"}
        </Text>

        {loading ? (
          <ActivityIndicator
            color={colors.gold}
            style={{ marginVertical: spacing.xl }}
          />
        ) : !data || data.patterns.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="hourglass" size={32} color={colors.dim} />
            <Text style={styles.emptyText}>
              Nothing to surface yet. Two or three weeks of consistent
              logging usually turns up something.
            </Text>
          </View>
        ) : (
          data.patterns.map((p, i) => {
            const tint =
              p.severity === "warn" ? colors.coral : colors.gold;
            return (
              <View
                key={i}
                style={[styles.card, { borderLeftColor: tint }]}
              >
                <View style={styles.cardHead}>
                  <View
                    style={[
                      styles.cardIcon,
                      { borderColor: tint, backgroundColor: colors.panel2 },
                    ]}
                  >
                    <Ionicons
                      name={ICON_FOR_ID[p.id] ?? "sparkles"}
                      size={16}
                      color={tint}
                    />
                  </View>
                  <Text style={[styles.cardTitle, { color: tint }]}>
                    {p.title}
                  </Text>
                </View>
                <Text style={styles.cardBody}>{p.body}</Text>
              </View>
            );
          })
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
    marginTop: 4,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 4,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: 6,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: font.displayBold,
    fontSize: 15,
    flex: 1,
  },
  cardBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
  },
  empty: {
    alignItems: "center",
    marginTop: spacing.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    textAlign: "center",
    lineHeight: 21,
  },
});
