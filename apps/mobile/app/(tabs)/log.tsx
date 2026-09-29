import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useEntitlement } from "@/lib/EntitlementContext";
import type { LedgerDayResponse } from "@/types";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Log tab.
 *
 * Layout matches Home visual language:
 *   • One dominant scan CTA (thumb-reachable)
 *   • Compact 3-tile row for the remaining primary log methods
 *   • Ask-coach pair (suggestions + meal plan)
 *   • Today's meals flat list (mirrors Home meals card)
 */

export default function Log() {
  const { t } = useTranslation();
  const { ent } = useEntitlement();
  const [ledger, setLedger] = useState<LedgerDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const tzOffsetMin = -new Date().getTimezoneOffset();
      const today = await api<LedgerDayResponse>(
        `/api/ledger/today?tz_offset_min=${tzOffsetMin}`
      );
      setLedger(today);
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
    <SafeAreaView style={styles.shell} edges={["top", "bottom"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.gold}
          />
        }
      >
        <View style={styles.headRow}>
          <Text style={styles.headTitle}>{t("log.title")}</Text>
          <Pressable
            style={styles.headAvatar}
            onPress={() => router.push("/settings")}
          >
            <Ionicons name="person-outline" size={18} color={colors.ink} />
          </Pressable>
        </View>

        {/* Primary scan CTA — dominant, thumb-reachable */}
        <PrimaryScan
          title={t("log.cta_plate_title")}
          voiceLabel={t("log.hint_voice")}
          barcodeLabel={t("log.hint_barcode")}
          onScan={() => router.push("/scan/plate")}
          onVoice={() => router.push("/voice-log")}
          onBarcode={() => router.push("/scan/barcode")}
        />

        {/* Compact chip row — remaining log methods */}
        <SectionKicker>{t("log.section_more_ways")}</SectionKicker>
        <View style={styles.chipRow}>
          <LogChip
            icon="create-outline"
            label={t("log.tile_manual")}
            tint={colors.ink}
            onPress={() => router.push("/manual-meal")}
          />
          <LogChip
            icon="restaurant-outline"
            label={t("log.tile_menu")}
            tint={colors.mint}
            proBadge={!ent.is_pro}
            onPress={() => router.push("/scan/menu")}
          />
          <LogChip
            icon="book-outline"
            label={t("log.tile_recipes")}
            tint={colors.coral}
            onPress={() => router.push("/recipes")}
          />
        </View>

        {/* Ask coach pair */}
        <SectionKicker>{t("log.section_ask_coach")}</SectionKicker>
        <View style={styles.pairRow}>
          <PairCard
            icon="sparkles"
            title={t("log.suggest_title")}
            subtitle={t("log.suggest_sub")}
            tint={colors.gold}
            onPress={() => router.push("/meals-suggest")}
          />
          <PairCard
            icon="calendar"
            title={t("log.plan_title")}
            subtitle={t("log.plan_sub")}
            tint={colors.mint}
            proBadge={!ent.is_pro}
            onPress={() => router.push("/meal-plan")}
          />
        </View>

        {/* Today's log — flat list, mirrors Home meals card */}
        <SectionKicker>
          {t("log.section_today", {
            count: ledger?.totals.items.length ?? 0,
          })}
        </SectionKicker>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : ledger && ledger.totals.items.length > 0 ? (
          <View style={styles.todayCard}>
            <View style={styles.todayHead}>
              <Text style={styles.todayKcal}>
                {ledger.totals.kcal.low}–{ledger.totals.kcal.high} kcal
              </Text>
              <Text style={styles.todayMeta}>{t("log.today_range")}</Text>
            </View>
            {ledger.totals.items.map((it, idx) => (
              <View
                key={it.id}
                style={[
                  styles.itemRow,
                  idx < ledger.totals.items.length - 1 && styles.itemRowDivider,
                ]}
              >
                {it.photo_url ? (
                  <Image source={{ uri: it.photo_url }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPh]}>
                    <Text style={styles.thumbPhText}>
                      {it.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.name}
                  </Text>
                  {it.portion_estimate ? (
                    <Text style={styles.itemMeta}>{it.portion_estimate}</Text>
                  ) : null}
                </View>
                <Text style={styles.itemKcal}>
                  {Math.round((it.kcal_low + it.kcal_high) / 2)}
                  <Text style={styles.itemKcalUnit}> kcal</Text>
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="restaurant-outline" size={24} color={colors.dim} />
            <Text style={styles.emptyTitle}>{t("log.empty_title")}</Text>
            <Text style={styles.emptyBody}>{t("log.empty_body")}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────
// Section kicker

function SectionKicker({ children }: { children: string }) {
  return <Text style={styles.sectionKicker}>{children}</Text>;
}

// ────────────────────────────────────────────────────────────────────
// Primary scan CTA — dominant hero

function PrimaryScan({
  title,
  voiceLabel,
  barcodeLabel,
  onScan,
  onVoice,
  onBarcode,
}: {
  title: string;
  voiceLabel: string;
  barcodeLabel: string;
  onScan: () => void;
  onVoice: () => void;
  onBarcode: () => void;
}) {
  return (
    <View style={styles.primaryWrap}>
      <Pressable style={styles.primaryCard} onPress={onScan}>
        <View style={styles.primaryIconWrap}>
          <Ionicons name="camera" size={40} color={colors.bg} />
        </View>
        <Text style={styles.primaryTitle}>{title}</Text>
        <View style={styles.primaryHintRow}>
          <Pressable
            hitSlop={8}
            style={styles.primaryHint}
            onPress={(e) => {
              e.stopPropagation?.();
              onVoice();
            }}
          >
            <Ionicons name="mic" size={12} color={colors.dim} />
            <Text style={styles.primaryHintText}>{voiceLabel}</Text>
          </Pressable>
          <View style={styles.primaryHintDot} />
          <Pressable
            hitSlop={8}
            style={styles.primaryHint}
            onPress={(e) => {
              e.stopPropagation?.();
              onBarcode();
            }}
          >
            <Ionicons name="barcode" size={12} color={colors.dim} />
            <Text style={styles.primaryHintText}>{barcodeLabel}</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Compact log chip

function LogChip({
  icon,
  label,
  tint,
  proBadge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  proBadge?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.chip} onPress={onPress}>
      <View style={[styles.chipIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.chipLabel}>{label}</Text>
      {proBadge ? (
        <View style={styles.chipProBadge}>
          <Text style={styles.chipProText}>PRO</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────
// Ask-coach pair card

function PairCard({
  icon,
  title,
  subtitle,
  tint,
  proBadge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  tint: string;
  proBadge?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.pair} onPress={onPress}>
      <View style={[styles.pairIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.pairTitle}>{title}</Text>
      <Text style={styles.pairSub} numberOfLines={2}>
        {subtitle}
      </Text>
      {proBadge ? (
        <View style={styles.chipProBadge}>
          <Text style={styles.chipProText}>PRO</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────
// Styles

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.md,
  },
  // Header
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  headTitle: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 28,
  },
  headAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  // Section kicker
  sectionKicker: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    marginTop: spacing.sm,
    marginBottom: -spacing.xs,
  },
  // Primary scan CTA
  primaryWrap: {
    marginTop: spacing.sm,
  },
  primaryCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    shadowColor: colors.gold,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  primaryTitle: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 22,
    letterSpacing: 0.3,
  },
  primaryHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
  },
  primaryHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.panel2,
  },
  primaryHintText: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 11,
  },
  primaryHintDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.line,
  },
  // Chip row
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  chipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chipLabel: {
    color: colors.ink,
    fontFamily: font.bodyBold,
    fontSize: 12,
  },
  chipProBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  chipProText: {
    color: colors.bg,
    fontFamily: font.mono,
    fontSize: 8,
    letterSpacing: 1,
  },
  // Pair card
  pairRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pair: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
    minHeight: 108,
    position: "relative",
  },
  pairIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pairTitle: {
    color: colors.ink,
    fontFamily: font.bodyBold,
    fontSize: 14,
    marginTop: 2,
  },
  pairSub: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 11,
    lineHeight: 16,
  },
  // Today's log
  loadingRow: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  todayCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  todayHead: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 2,
  },
  todayKcal: {
    color: colors.gold,
    fontFamily: font.displayBold,
    fontSize: 20,
  },
  todayMeta: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 11,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumbPh: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPhText: {
    color: colors.dim,
    fontFamily: font.displayBold,
    fontSize: 16,
  },
  itemName: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 14,
  },
  itemMeta: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 11,
    marginTop: 2,
  },
  itemKcal: {
    color: colors.ink,
    fontFamily: font.mono,
    fontSize: 13,
  },
  itemKcalUnit: {
    color: colors.dim,
    fontSize: 10,
  },
  emptyCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 15,
    marginTop: 4,
  },
  emptyBody: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
});
