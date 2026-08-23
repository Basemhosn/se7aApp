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
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/api";
import { markDayDirty } from "@/lib/calendarCache";
import { useEntitlement } from "@/lib/EntitlementContext";
import type { LedgerDayResponse } from "@/types";
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
  const { t } = useTranslation();
  const { ent } = useEntitlement();
  const [ledger, setLedger] = useState<LedgerDayResponse | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [relogBusy, setRelogBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [today, rec] = await Promise.all([
        api<LedgerDayResponse>("/api/ledger/today"),
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
      markDayDirty();
      await load();
    } catch (e) {
      Alert.alert(t("log.couldnt_log"), (e as Error).message);
    }
    setRelogBusy(null);
  };

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.title}>{t("log.title")}</Text>
        <Text style={styles.sub}>{t("log.sub")}</Text>
      </View>

      <HeroCta
        icon="camera"
        title={t("log.cta_plate_title")}
        subtitle={t("log.cta_plate_sub")}
        onPress={() => router.push("/scan/plate")}
      />

      <Text style={styles.sectionKicker}>QUICK LOG</Text>
      <View style={styles.rowGrid}>
        <TileCta
          icon="restaurant-outline"
          label="Menu"
          tint={colors.mint}
          proBadge={!ent.is_pro}
          onPress={() => router.push("/scan/menu")}
        />
        <TileCta
          icon="barcode-outline"
          label="Barcode"
          tint={colors.gold}
          onPress={() => router.push("/scan/barcode")}
        />
        <TileCta
          icon="create-outline"
          label="Manual"
          tint={colors.ink}
          onPress={() => router.push("/manual-meal")}
        />
      </View>

      <Text style={styles.sectionKicker}>ASK SE7A</Text>
      <View style={styles.pairGrid}>
        <PairCta
          icon="sparkles"
          kicker="WHAT TO EAT?"
          title="Suggest a meal"
          subtitle="3 dishes that fit your day."
          tint={colors.gold}
          onPress={() => router.push("/meals-suggest")}
        />
        <PairCta
          icon="calendar"
          kicker="PLAN THE WEEK"
          title="7-day plan"
          subtitle="Auto shopping list."
          tint={colors.gold}
          proBadge={!ent.is_pro}
          onPress={() => router.push("/meal-plan")}
        />
      </View>

      <Text style={styles.sectionKicker}>BROWSE</Text>
      <BrowseCta
        icon="book-outline"
        title="Gulf recipes"
        subtitle="Machboos, kabsa, shawarma — with macros. Tap to log."
        onPress={() => router.push("/recipes")}
      />

      {recent.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("log.recent_title")}</Text>
          <Text style={styles.cardSub}>{t("log.recent_sub")}</Text>
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
                    {it.photo_url ? (
                      <Image
                        source={{ uri: it.photo_url }}
                        style={styles.recentImg}
                      />
                    ) : (
                      <View style={[styles.recentImg, styles.recentImgPh]}>
                        <Ionicons
                          name="restaurant-outline"
                          size={20}
                          color={colors.dim}
                        />
                      </View>
                    )}
                    <Text style={styles.recentName} numberOfLines={1}>
                      {it.name}
                    </Text>
                    <Text style={styles.recentKcal}>
                      {it.kcal_low}–{it.kcal_high} kcal
                    </Text>
                    {it.times_logged > 1 && (
                      <Text style={styles.recentTimes}>
                        {t("log.recent_times", { count: it.times_logged })}
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
          <Text style={styles.cardTitle}>{t("log.todays_log_title")}</Text>
          <Text style={styles.cardSub}>
            {t("log.todays_log_sub", {
              items: ledger.totals.items.length,
              low: ledger.totals.kcal.low,
              high: ledger.totals.kcal.high,
            })}
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
                {it.kcal_low}–{it.kcal_high} {t("common.kcal")}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>{t("log.empty_title")}</Text>
          <Text style={styles.emptyBody}>{t("log.empty_body")}</Text>
        </View>
      )}
    </Screen>
  );
}

function HeroCta({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.hero}>
      <View style={styles.heroIcon}>
        <Ionicons name={icon} size={30} color={colors.bg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.heroKicker}>SNAP A PLATE</Text>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSub}>{subtitle}</Text>
      </View>
      <Text style={styles.heroArrow}>→</Text>
    </Pressable>
  );
}

function TileCta({
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
    <Pressable onPress={onPress} style={styles.tile}>
      <View style={[styles.tileIcon, { borderColor: tint }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      {proBadge && (
        <View style={styles.tileProBadge}>
          <Text style={styles.proBadgeText}>PRO</Text>
        </View>
      )}
    </Pressable>
  );
}

function PairCta({
  icon,
  kicker,
  title,
  subtitle,
  tint,
  proBadge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  kicker: string;
  title: string;
  subtitle: string;
  tint: string;
  proBadge?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.pair}>
      <View style={styles.pairIconRow}>
        <Ionicons name={icon} size={20} color={tint} />
        <Text style={[styles.pairKicker, { color: tint }]}>{kicker}</Text>
      </View>
      <Text style={styles.pairTitle}>{title}</Text>
      <Text style={styles.pairSub}>{subtitle}</Text>
      {proBadge && (
        <View style={styles.tileProBadge}>
          <Text style={styles.proBadgeText}>PRO</Text>
        </View>
      )}
    </Pressable>
  );
}

function BrowseCta({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.browse}>
      <View style={styles.browseIcon}>
        <Ionicons name={icon} size={22} color={colors.mint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.browseTitle}>{title}</Text>
        <Text style={styles.browseSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.dim} />
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
  sectionKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: spacing.md,
    marginBottom: 2,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.gold,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  heroKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  heroTitle: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
    marginTop: 2,
  },
  heroSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
    lineHeight: 19,
  },
  heroArrow: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.gold,
  },
  rowGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.sm,
    gap: 8,
    position: "relative",
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panel2,
  },
  tileLabel: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.ink,
    letterSpacing: 0.3,
  },
  tileProBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  pairGrid: {
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
    gap: 2,
    position: "relative",
  },
  pairIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pairKicker: {
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  pairTitle: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: 4,
  },
  pairSub: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
    lineHeight: 17,
  },
  browse: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  browseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.mint,
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
  },
  browseTitle: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
  },
  browseSub: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
    lineHeight: 17,
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
  proBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  proBadgeText: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.bg,
    letterSpacing: 1.2,
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
    width: 140,
    padding: spacing.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    gap: 4,
  },
  recentImg: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    marginBottom: 2,
  },
  recentImgPh: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
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
