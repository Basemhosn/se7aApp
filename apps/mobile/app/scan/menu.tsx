import { useCallback, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { ConfidencePill } from "@/components/Pill";
import {
  api,
  apiUpload,
  ProRequiredError,
  RateLimitedError,
  rateLimitMessage,
} from "@/lib/api";
import { markDayDirty } from "@/lib/calendarCache";
import { colors, font, radius, spacing } from "@/lib/theme";
import type {
  MealSlot,
  MenuDish,
  MenuScanBudget,
  MenuScanResponse,
} from "@/types";
import { slotForNow } from "@/lib/slot";

interface PastDish {
  name: string;
  portion_estimate: string | null;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
  times_logged: number;
  last_logged_at: string;
}

interface PastDishesResponse {
  restaurant: string | null;
  dishes: PastDish[];
  total_visits?: number;
}

type Phase = "idle" | "analyzing" | "result" | "saving";

export default function MenuScan() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [dishes, setDishes] = useState<MenuDish[]>([]);
  const [confidence, setConfidence] = useState<"low" | "medium" | "high">("medium");
  const [budget, setBudget] = useState<MenuScanBudget | null>(null);
  const [targetsKnown, setTargetsKnown] = useState(true);
  const [restaurantGuess, setRestaurantGuess] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [pastDishes, setPastDishes] = useState<PastDish[]>([]);
  const [pastVisits, setPastVisits] = useState<number>(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Past-dish selections (keyed on the dish name, since past dishes
  // don't share an index space with the AI's ranked dishes). Included
  // in the same save.
  const [pastSelected, setPastSelected] = useState<Set<string>>(new Set());
  const [slot, setSlot] = useState<MealSlot>(slotForNow());

  const loadPastDishes = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setPastDishes([]);
      setPastVisits(0);
      return;
    }
    try {
      const res = await api<PastDishesResponse>(
        `/api/restaurants/dishes?name=${encodeURIComponent(trimmed)}&limit=6`
      );
      setPastDishes(res.dishes);
      setPastVisits(res.total_visits ?? 0);
    } catch {
      setPastDishes([]);
      setPastVisits(0);
    }
  }, []);

  const pickAndAnalyze = async (source: "camera" | "library") => {
    setErr("");
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("scan.common.permission_denied"), t("scan.common.permission_denied_body"));
      return;
    }
    const r =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.9,
          });
    if (r.canceled || !r.assets?.[0]) return;
    const resized = await ImageManipulator.manipulateAsync(
      r.assets[0].uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    setPreviewUri(resized.uri);
    setPhase("analyzing");
    try {
      const body = await apiUpload<MenuScanResponse>(
        "/api/scan/menu",
        "image",
        { uri: resized.uri, mimeType: "image/jpeg", fileName: "menu.jpg" }
      );
      setScanId(body.scan_id);
      setDishes(body.result.dishes);
      setConfidence(body.result.confidence);
      setBudget(body.budget);
      setTargetsKnown(body.targets_known);
      const guess = body.result.restaurant_guess ?? null;
      setRestaurantGuess(guess);
      setRestaurantName(guess);
      setSelected(new Set());
      setPastSelected(new Set());
      setPhase("result");
      // Fire-and-forget: if the AI guessed a restaurant, look up past
      // dishes so the "you liked here last time" section renders as
      // soon as the review appears.
      if (guess) loadPastDishes(guess);
    } catch (e) {
      if (e instanceof ProRequiredError) {
        router.push({
          pathname: "/paywall",
          params: { feature: "menu_scan" },
        });
        setPhase("idle");
        return;
      }
      if (e instanceof RateLimitedError) {
        const { title, body } = rateLimitMessage(e);
        Alert.alert(title, body);
        setPhase("idle");
        return;
      }
      setErr((e as Error).message || t("scan.menu.couldnt_read"));
      setPhase("idle");
    }
  };

  const reset = () => {
    setPhase("idle");
    setPreviewUri(null);
    setScanId(null);
    setDishes([]);
    setBudget(null);
    setRestaurantGuess(null);
    setRestaurantName(null);
    setPastDishes([]);
    setPastVisits(0);
    setSelected(new Set());
    setPastSelected(new Set());
    setErr("");
  };

  const editRestaurantName = () => {
    Alert.prompt(
      t("scan.menu.restaurant_prompt_title"),
      t("scan.menu.restaurant_prompt_body"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.save"),
          onPress: (val) => {
            const v = (val ?? "").trim();
            const next = v.length > 0 ? v : null;
            setRestaurantName(next);
            if (next) loadPastDishes(next);
            else {
              setPastDishes([]);
              setPastVisits(0);
            }
          },
        },
      ],
      "plain-text",
      restaurantName ?? ""
    );
  };

  const togglePast = (name: string) =>
    setPastSelected((s) => {
      const n = new Set(s);
      const key = name.toLowerCase();
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const save = async () => {
    if (!scanId) return;
    const picked = dishes.filter((_, i) => selected.has(i));
    const pickedPast = pastDishes.filter((d) =>
      pastSelected.has(d.name.toLowerCase())
    );
    const totalPicked = picked.length + pickedPast.length;
    if (totalPicked === 0) return;
    setPhase("saving");
    setErr("");
    try {
      const items = [
        ...picked.map((d) => ({
          name: d.name,
          portion_estimate: d.description ?? null,
          kcal_low: d.kcal_low,
          kcal_high: d.kcal_high,
          protein_g_low: d.protein_g_low,
          protein_g_high: d.protein_g_high,
          carb_g_low: d.carb_g_low,
          carb_g_high: d.carb_g_high,
          fat_g_low: d.fat_g_low,
          fat_g_high: d.fat_g_high,
          confidence,
        })),
        ...pickedPast.map((d) => ({
          name: d.name,
          portion_estimate: d.portion_estimate,
          kcal_low: d.kcal_low,
          kcal_high: d.kcal_high,
          protein_g_low: d.protein_g_low,
          protein_g_high: d.protein_g_high,
          carb_g_low: d.carb_g_low,
          carb_g_high: d.carb_g_high,
          fat_g_low: d.fat_g_low,
          fat_g_high: d.fat_g_high,
          confidence: "medium" as const,
        })),
      ];
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          scan_id: scanId,
          source: "menu_scan",
          meal_slot: slot,
          restaurant_name: restaurantName ?? null,
          items,
        }),
      });
      markDayDirty();
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || t("scan.menu.couldnt_save"));
      setPhase("result");
    }
  };

  const totals = dishes.reduce(
    (acc, d, i) => {
      if (!selected.has(i)) return acc;
      acc.kcal_low += d.kcal_low;
      acc.kcal_high += d.kcal_high;
      return acc;
    },
    { kcal_low: 0, kcal_high: 0 }
  );
  for (const d of pastDishes) {
    if (pastSelected.has(d.name.toLowerCase())) {
      totals.kcal_low += d.kcal_low;
      totals.kcal_high += d.kcal_high;
    }
  }
  const totalSelected = selected.size + pastSelected.size;

  const orders = dishes.map((d, i) => ({ d, i })).filter((x) => x.d.verdict === "order");
  const considers = dishes.map((d, i) => ({ d, i })).filter((x) => x.d.verdict === "consider");
  const skips = dishes.map((d, i) => ({ d, i })).filter((x) => x.d.verdict === "skip");

  const footer =
    phase === "result" || phase === "saving" ? (
      <>
        {!!err && <Text style={styles.err}>{err}</Text>}
        <View style={styles.slotRow}>
          {(["breakfast", "lunch", "dinner", "snack"] as MealSlot[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSlot(s)}
              style={[styles.chip, slot === s && styles.chipOn]}
            >
              <Text style={[styles.chipText, slot === s && styles.chipTextOn]}>
                {t(`common.meal_slot.${s}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Btn
          label={
            phase === "saving"
              ? t("common.saving")
              : totalSelected === 0
                ? t("scan.menu.cta_pick_dish")
                : t("scan.menu.cta_log_to", {
                    count: totalSelected,
                    slot: t(`common.meal_slot.${slot}`),
                    low: totals.kcal_low,
                    high: totals.kcal_high,
                  })
          }
          onPress={save}
          loading={phase === "saving"}
          disabled={totalSelected === 0}
        />
        <Btn
          label={t("scan.menu.cta_scan_another")}
          variant="ghost"
          onPress={reset}
          disabled={phase === "saving"}
        />
      </>
    ) : undefined;

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>{t("scan.menu.kicker")}</Text>
      <Text style={styles.h1}>{t("scan.menu.title")}</Text>
      <Text style={styles.sub}>
        {t("scan.menu.sub")}
      </Text>

      {phase === "idle" && (
        <View style={styles.uploadCard}>
          <Btn label={t("scan.common.photo_menu")} onPress={() => pickAndAnalyze("camera")} />
          <View style={{ height: spacing.sm }} />
          <Btn label={t("scan.common.pick_from_library")} variant="ghost" onPress={() => pickAndAnalyze("library")} />
          {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>
      )}

      {phase === "analyzing" && (
        <View style={styles.uploadCard}>
          {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
          <Text style={styles.busy}>{t("scan.menu.reading")}</Text>
        </View>
      )}

      {(phase === "result" || phase === "saving") && budget && (
        <>
          <View style={styles.reviewHead}>
            {previewUri && (
              <Image source={{ uri: previewUri }} style={styles.thumb} />
            )}
            <View style={{ flex: 1 }}>
              <ConfidencePill level={confidence} />
              <Pressable
                onPress={editRestaurantName}
                hitSlop={6}
                style={styles.restaurantRow}
              >
                <Ionicons name="storefront" size={12} color={colors.dim} />
                <Text style={styles.dim} numberOfLines={1}>
                  {restaurantName ?? t("scan.menu.tap_to_name")}
                </Text>
                <Text style={styles.restaurantEditHint}>✎</Text>
              </Pressable>
            </View>
          </View>

          {pastDishes.length > 0 && (
            <View style={styles.pastCard}>
              <Text style={styles.pastKicker}>
                {t("scan.menu.past_dishes_kicker", { count: pastVisits })}
              </Text>
              <Text style={styles.pastSub}>
                {t("scan.menu.past_dishes_sub")}
              </Text>
              {pastDishes.map((d) => {
                const key = d.name.toLowerCase();
                const on = pastSelected.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => togglePast(d.name)}
                    style={[styles.dish, on && styles.dishOn]}
                  >
                    <View
                      style={[styles.checkbox, on && styles.checkboxOn]}
                    >
                      {on && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.dishName}>{d.name}</Text>
                      <Text style={styles.dishKcal}>
                        {d.kcal_low}–{d.kcal_high}
                        <Text style={styles.dishKcalUnit}>
                          {" "}
                          {t("common.kcal")}
                        </Text>
                      </Text>
                      <Text style={styles.dishReason}>
                        {t("scan.menu.past_meta", {
                          count: d.times_logged,
                          when: formatRelativeDate(d.last_logged_at),
                        })}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.budget}>
            <Text style={styles.kicker}>
              {targetsKnown ? t("scan.menu.your_budget") : t("scan.menu.default_budget")}
            </Text>
            <Text style={styles.budgetMain}>
              {Math.round(budget.kcal_low)}–{Math.round(budget.kcal_high)} {t("common.kcal")}
            </Text>
            <Text style={styles.budgetMacros}>
              P {Math.round(budget.protein_g_low)}–{Math.round(budget.protein_g_high)} · C {Math.round(budget.carb_g_low)}–{Math.round(budget.carb_g_high)} · F {Math.round(budget.fat_g_low)}–{Math.round(budget.fat_g_high)}
            </Text>
          </View>

          <DishSection
            title={t("scan.menu.verdict_order")}
            tint={colors.mint}
            rows={orders}
            selected={selected}
            onToggle={toggle}
          />
          <DishSection
            title={t("scan.menu.verdict_consider")}
            tint={colors.gold}
            rows={considers}
            selected={selected}
            onToggle={toggle}
          />
          <DishSection
            title={t("scan.menu.verdict_skip")}
            tint={colors.dim}
            rows={skips}
            selected={selected}
            onToggle={toggle}
            skipped
          />
        </>
      )}
    </Screen>
  );
}

function DishSection({
  title,
  tint,
  rows,
  selected,
  onToggle,
  skipped,
}: {
  title: string;
  tint: string;
  rows: { d: MenuDish; i: number }[];
  selected: Set<number>;
  onToggle: (i: number) => void;
  skipped?: boolean;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[styles.sectionH, { color: tint }]}>
        {title}
        <Text style={styles.sectionCount}> {rows.length}</Text>
      </Text>
      {rows.map(({ d, i }) => {
        const on = selected.has(i);
        return (
          <Pressable
            key={i}
            onPress={() => onToggle(i)}
            style={[
              styles.dish,
              { borderLeftColor: tint, borderLeftWidth: 3 },
              on && styles.dishOn,
              skipped && !on && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.checkbox, on && styles.checkboxOn]}>
              {on && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.dishName}>{d.name}</Text>
              <Text style={styles.dishKcal}>
                {d.kcal_low}–{d.kcal_high}
                <Text style={styles.dishKcalUnit}> {t("common.kcal")}</Text>
              </Text>
              <Text style={styles.dishReason}>{d.reason}</Text>
              <Text style={styles.dishMacros}>
                P {fmt(d.protein_g_low)}–{fmt(d.protein_g_high)} · C {fmt(d.carb_g_low)}–{fmt(d.carb_g_high)} · F {fmt(d.fat_g_low)}–{fmt(d.fat_g_high)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}


function formatRelativeDate(iso: string): string {
  const now = new Date();
  const then = new Date(iso);
  const diffDays = Math.floor(
    (now.getTime() - then.getTime()) / 86_400_000
  );
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function fmt(n: number): string {
  if (n >= 100) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: { fontFamily: font.mono, fontSize: 11, color: colors.gold, letterSpacing: 1.4 },
  h1: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.dim, lineHeight: 21 },
  dim: { fontFamily: font.body, fontSize: 13, color: colors.dim },
  uploadCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  preview: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    resizeMode: "cover",
  },
  reviewHead: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  busy: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink, marginTop: spacing.md },
  budget: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  budgetMain: { fontFamily: font.displayBold, fontSize: 22, color: colors.gold, marginTop: 4 },
  budgetMacros: { fontFamily: font.mono, fontSize: 12, color: colors.dim },
  restaurantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    flexShrink: 1,
  },
  restaurantEditHint: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    marginLeft: 4,
  },
  pastCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pastKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  pastSub: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginBottom: 4,
  },
  sectionH: { fontFamily: font.displayBold, fontSize: 17 },
  sectionCount: { fontFamily: font.mono, fontSize: 12, color: colors.dim },
  dish: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  dishOn: { borderColor: colors.goldDim, backgroundColor: "rgba(246,183,60,0.04)" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxOn: { borderColor: colors.gold, backgroundColor: colors.gold },
  checkMark: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.panel,
    lineHeight: 16,
  },
  dishName: { fontFamily: font.body, fontSize: 15, color: colors.ink },
  dishKcal: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  dishKcalUnit: { fontFamily: font.mono, fontSize: 11, color: colors.dim },
  dishReason: { fontFamily: font.body, fontSize: 13, color: colors.ink, lineHeight: 19, marginTop: 2 },
  dishMacros: { fontFamily: font.mono, fontSize: 11, color: colors.dim, marginTop: 2 },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  chipOn: { borderColor: colors.gold, backgroundColor: "rgba(246,183,60,0.10)" },
  chipText: { fontFamily: font.body, fontSize: 12, color: colors.ink, textTransform: "capitalize" },
  chipTextOn: { color: colors.gold },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
