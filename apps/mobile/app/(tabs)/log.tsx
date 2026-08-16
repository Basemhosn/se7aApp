import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/api";
import type { LedgerTodayResponse } from "@/types";
import { colors, font, radius, spacing } from "@/lib/theme";

interface RecentItem {
  id: number;
  name: string;
  portion_estimate: string | null;
  scan_id: string | null;
  photo_url: string | null;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
  confidence: "low" | "medium" | "high" | null;
  times_logged: number;
}

interface RecentResponse {
  items: RecentItem[];
}

function slotForNow(): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

export default function Log() {
  const [ledger, setLedger] = useState<LedgerTodayResponse | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [relogBusy, setRelogBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [today, rec] = await Promise.all([
        api<LedgerTodayResponse>("/api/ledger/today"),
        api<RecentResponse>("/api/ledger/recent?limit=12").catch(() => ({
          items: [] as RecentItem[],
        })),
      ]);
      setLedger(today);
      setRecent(rec.items);
    } catch {
      /* empty */
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const relog = async (item: RecentItem) => {
    setRelogBusy(item.id);
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          meal_slot: slotForNow(),
          items: [
            {
              name: item.name,
              portion_estimate: item.portion_estimate ?? undefined,
              kcal_low: item.kcal_low,
              kcal_high: item.kcal_high,
              protein_g_low: item.protein_g_low,
              protein_g_high: item.protein_g_high,
              carb_g_low: item.carb_g_low,
              carb_g_high: item.carb_g_high,
              fat_g_low: item.fat_g_low,
              fat_g_high: item.fat_g_high,
              confidence: item.confidence ?? "medium",
            },
          ],
        }),
      });
      await load();
    } catch (e) {
      Alert.alert("Couldn't log", (e as Error).message);
    }
    setRelogBusy(null);
  };

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.title}>Log</Text>
        <Text style={styles.sub}>Capture what you ate.</Text>
      </View>

      <View style={styles.ctaCol}>
        <CTA
          kicker="AFTER YOU EAT"
          title="Scan a plate"
          subtitle="Snap your meal. Honest ranges, logged to today."
          onPress={() => router.push("/scan/plate")}
          tint={colors.gold}
        />
        <CTA
          kicker="BEFORE YOU ORDER"
          title="Scan a menu"
          subtitle="We rank dishes against your remaining budget."
          onPress={() => router.push("/scan/menu")}
          tint={colors.mint}
        />
        <CTA
          kicker="TYPE IT IN"
          title="Add manually"
          subtitle="Foods you know cold — name, kcal, macros."
          onPress={() => router.push("/manual-meal")}
          tint={colors.ink}
        />
      </View>

      {recent.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent</Text>
          <Text style={styles.cardSub}>
            One tap to re-log something you eat often.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}
          >
            {recent.map((it) => (
              <Pressable
                key={it.id}
                onPress={() => relog(it)}
                disabled={relogBusy === it.id}
                style={styles.recentChip}
              >
                {relogBusy === it.id ? (
                  <ActivityIndicator color={colors.gold} />
                ) : (
                  <>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {it.name}
                    </Text>
                    <Text style={styles.recentKcal}>
                      {it.kcal_low}–{it.kcal_high} kcal
                    </Text>
                    {it.times_logged > 1 && (
                      <Text style={styles.recentTimes}>
                        {it.times_logged}× logged
                      </Text>
                    )}
                  </>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : ledger && ledger.totals.items.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today{"’"}s log</Text>
          <Text style={styles.cardSub}>
            {ledger.totals.items.length} items · {ledger.totals.kcal.low}–
            {ledger.totals.kcal.high} kcal
          </Text>
          {ledger.totals.items.map((it) => (
            <View key={it.id} style={styles.row}>
              {it.photo_url ? (
                <Image source={{ uri: it.photo_url }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Text style={styles.thumbPlaceholderText}>
                    {it.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{it.name}</Text>
                <Text style={styles.rowMeta}>
                  {it.portion_estimate || ""}
                  {it.confidence ? ` · ${it.confidence}` : ""}
                </Text>
              </View>
              <Text style={styles.rowKcal}>
                {it.kcal_low}–{it.kcal_high} kcal
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Nothing logged yet today.</Text>
          <Text style={styles.emptyBody}>
            Tap one of the buttons above to add your first meal.
          </Text>
        </View>
      )}
    </Screen>
  );
}

function CTA({
  kicker,
  title,
  subtitle,
  onPress,
  tint,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  tint: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.cta}>
      <Text style={[styles.kicker, { color: tint }]}>{kicker}</Text>
      <Text style={styles.ctaTitle}>{title}</Text>
      <Text style={styles.ctaSub}>{subtitle}</Text>
      <Text style={[styles.ctaArrow, { color: tint }]}>→</Text>
    </Pressable>
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
    color: colors.gold,
    letterSpacing: 1.4,
  },
  ctaCol: { gap: spacing.sm },
  cta: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    position: "relative",
  },
  ctaTitle: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 4,
  },
  ctaSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 4,
  },
  ctaArrow: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.md,
    fontFamily: font.displayBold,
    fontSize: 22,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
  },
  cardTitle: { fontFamily: font.displayBold, fontSize: 18, color: colors.ink },
  cardSub: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: "center",
    gap: spacing.sm,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.dim,
  },
  rowName: { fontFamily: font.body, fontSize: 14, color: colors.ink },
  rowMeta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  rowKcal: { fontFamily: font.mono, fontSize: 12, color: colors.dim },
  emptyTitle: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 4,
    lineHeight: 20,
  },
  recentChip: {
    minWidth: 130,
    padding: spacing.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    gap: 2,
  },
  recentName: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
  },
  recentKcal: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    marginTop: 2,
  },
  recentTimes: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    marginTop: 2,
  },
});
