import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { TrendChart } from "@/components/TrendChart";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

interface TrendResponse {
  days: number;
  points: {
    weight_kg: number;
    body_fat_pct: number | null;
    logged_at: string;
  }[];
}

const RANGES = [
  { days: 30, label: "30D" },
  { days: 60, label: "60D" },
  { days: 90, label: "90D" },
];

export default function Progress() {
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const [weight, setWeight] = useState("");
  const [bf, setBf] = useState("");
  const [logging, setLogging] = useState(false);
  const [logErr, setLogErr] = useState("");

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await api<TrendResponse>(`/api/weight/trend?days=${d}`);
      setTrend(res);
    } catch {
      /* empty */
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(days);
    }, [days, load])
  );

  const logWeight = async () => {
    const w = Number(weight);
    if (!w || w <= 0) return;
    setLogging(true);
    setLogErr("");
    try {
      await api("/api/weight", {
        method: "POST",
        body: JSON.stringify({
          weight_kg: w,
          body_fat_pct: bf ? Number(bf) : undefined,
        }),
      });
      setWeight("");
      setBf("");
      await load(days);
    } catch (e) {
      setLogErr((e as Error).message || "Couldn't log.");
    }
    setLogging(false);
  };

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.title}>Progress</Text>
        <Text style={styles.sub}>Trend over weeks, not any single day.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Weight trend</Text>
          <View style={styles.rangeRow}>
            {RANGES.map((r) => (
              <Pressable
                key={r.days}
                onPress={() => setDays(r.days)}
                style={[styles.rangeChip, days === r.days && styles.rangeChipOn]}
              >
                <Text
                  style={[
                    styles.rangeText,
                    days === r.days && styles.rangeTextOn,
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.lg }} />
        ) : (
          <TrendChart points={trend?.points ?? []} />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Log a weigh-in</Text>
        <Text style={styles.cardSub}>
          The trend re-tunes your targets automatically as you log.
        </Text>
        <View style={styles.formRow}>
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>WEIGHT (KG)</Text>
            <TextInput
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
              placeholder="75"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>BODY FAT % (OPTIONAL)</Text>
            <TextInput
              value={bf}
              onChangeText={setBf}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
          </View>
        </View>
        {!!logErr && <Text style={styles.err}>{logErr}</Text>}
        <Btn
          label={logging ? "Logging…" : "Log weigh-in"}
          onPress={logWeight}
          loading={logging}
          disabled={!weight || Number(weight) <= 0}
        />
      </View>

      <Pressable
        onPress={() => router.push("/scan/body")}
        style={styles.linkCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.coral }]}>BODY SCAN</Text>
          <Text style={styles.linkTitle}>Read your composition</Text>
          <Text style={styles.linkSub}>
            Honest body-fat range + weeks-to-goal. Photo not stored.
          </Text>
        </View>
        <Text style={[styles.linkArrow, { color: colors.coral }]}>→</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/calendar")}
        style={styles.linkCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.gold }]}>CALENDAR</Text>
          <Text style={styles.linkTitle}>Day-by-day history</Text>
          <Text style={styles.linkSub}>
            Every meal, workout, weigh-in, and water log in a month view.
          </Text>
        </View>
        <Text style={[styles.linkArrow, { color: colors.gold }]}>→</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm, gap: 4 },
  title: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  cardSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
  },
  rangeRow: { flexDirection: "row", gap: 4 },
  rangeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  rangeChipOn: { borderColor: colors.gold, backgroundColor: "rgba(246,183,60,0.10)" },
  rangeText: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 0.8,
  },
  rangeTextOn: { color: colors.gold },
  formRow: { flexDirection: "row", gap: spacing.sm },
  label: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  linkTitle: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
    marginTop: 4,
  },
  linkSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
    lineHeight: 19,
  },
  linkArrow: {
    fontFamily: font.displayBold,
    fontSize: 22,
  },
});
