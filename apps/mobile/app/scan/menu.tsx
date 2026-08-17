import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { ConfidencePill } from "@/components/Pill";
import { api, apiUpload, RateLimitedError, rateLimitMessage } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";
import type {
  MealSlot,
  MenuDish,
  MenuScanBudget,
  MenuScanResponse,
} from "@/types";

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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [slot, setSlot] = useState<MealSlot>(slotForNow());

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
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      setRestaurantGuess(body.result.restaurant_guess ?? null);
      setSelected(new Set());
      setPhase("result");
    } catch (e) {
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
    setSelected(new Set());
    setErr("");
  };

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
    if (picked.length === 0) return;
    setPhase("saving");
    setErr("");
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          scan_id: scanId,
          source: "menu_scan",
          meal_slot: slot,
          items: picked.map((d) => ({
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
        }),
      });
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
              : selected.size === 0
                ? t("scan.menu.cta_pick_dish")
                : t("scan.menu.cta_log_to", {
                    count: selected.size,
                    slot: t(`common.meal_slot.${slot}`),
                    low: totals.kcal_low,
                    high: totals.kcal_high,
                  })
          }
          onPress={save}
          loading={phase === "saving"}
          disabled={selected.size === 0}
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
              {restaurantGuess && (
                <Text style={[styles.dim, { marginTop: 4 }]}>{restaurantGuess}</Text>
              )}
            </View>
          </View>

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

function slotForNow(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
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
