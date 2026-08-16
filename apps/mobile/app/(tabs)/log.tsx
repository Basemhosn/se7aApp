import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/api";
import type { LedgerTodayResponse } from "@/types";
import { colors, font, radius, spacing } from "@/lib/theme";

export default function Log() {
  const [ledger, setLedger] = useState<LedgerTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api<LedgerTodayResponse>("/api/ledger/today");
      setLedger(res);
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
  cardSub: { fontFamily: font.mono, fontSize: 11, color: colors.dim, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: "center",
  },
  rowName: { fontFamily: font.body, fontSize: 14, color: colors.ink },
  rowMeta: { fontFamily: font.mono, fontSize: 11, color: colors.dim, marginTop: 2 },
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
});
