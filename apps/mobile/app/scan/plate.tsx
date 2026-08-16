import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { ConfidencePill } from "@/components/Pill";
import { api, apiUpload } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";
import type {
  MealSlot,
  PlateItem,
  PlateScanResponse,
} from "@/types";

type Phase = "idle" | "analyzing" | "review" | "saving";

export default function PlateScan() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [items, setItems] = useState<PlateItem[]>([]);
  const [confidence, setConfidence] = useState<"low" | "medium" | "high">("medium");
  const [invisible, setInvisible] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [slot, setSlot] = useState<MealSlot>(slotForNow());

  const pickAndAnalyze = async (source: "camera" | "library") => {
    setErr("");
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission denied", "Enable access in Settings to scan.");
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
    const asset = r.assets[0];
    const resized = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    setPreviewUri(resized.uri);
    await analyze(resized.uri);
  };

  const analyze = async (uri: string) => {
    setPhase("analyzing");
    try {
      const body = await apiUpload<PlateScanResponse>(
        "/api/scan/plate",
        "image",
        { uri, mimeType: "image/jpeg", fileName: "plate.jpg" }
      );
      setScanId(body.scan_id);
      setItems(body.result.items);
      setConfidence(body.result.confidence);
      setInvisible(body.result.invisible_costs ?? []);
      setSelected(new Set(body.result.items.map((_, i) => i)));
      setPhase("review");
    } catch (e) {
      setErr((e as Error).message || "Couldn't analyze the photo.");
      setPhase("idle");
    }
  };

  const totals = items.reduce(
    (acc, it, i) => {
      if (!selected.has(i)) return acc;
      acc.kcal_low += it.kcal_low;
      acc.kcal_high += it.kcal_high;
      acc.protein_g_low += it.protein_g_low;
      acc.protein_g_high += it.protein_g_high;
      acc.carb_g_low += it.carb_g_low;
      acc.carb_g_high += it.carb_g_high;
      acc.fat_g_low += it.fat_g_low;
      acc.fat_g_high += it.fat_g_high;
      return acc;
    },
    {
      kcal_low: 0,
      kcal_high: 0,
      protein_g_low: 0,
      protein_g_high: 0,
      carb_g_low: 0,
      carb_g_high: 0,
      fat_g_low: 0,
      fat_g_high: 0,
    }
  );

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const save = async () => {
    if (!scanId) return;
    const picked = items.filter((_, i) => selected.has(i));
    if (picked.length === 0) {
      setErr("Pick at least one item to log.");
      return;
    }
    setPhase("saving");
    setErr("");
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          scan_id: scanId,
          source: "plate_scan",
          meal_slot: slot,
          items: picked.map((it) => ({ ...it, confidence })),
        }),
      });
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || "Couldn't save — try again.");
      setPhase("review");
    }
  };

  const reset = () => {
    setPhase("idle");
    setPreviewUri(null);
    setScanId(null);
    setItems([]);
    setInvisible([]);
    setSelected(new Set());
    setErr("");
  };

  const footer =
    phase === "review" || phase === "saving" ? (
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
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
        <Btn
          label={
            phase === "saving"
              ? "Saving…"
              : selected.size === 0
                ? "Pick at least one item"
                : `Add to ${slot}`
          }
          onPress={save}
          loading={phase === "saving"}
          disabled={selected.size === 0}
        />
        <Btn
          label="Discard"
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
      <Text style={styles.kicker}>PLATE SCAN</Text>
      <Text style={styles.h1}>What did you eat?</Text>
      <Text style={styles.sub}>
        Snap a photo of your meal. Honest ranges for calories and macros —
        not point values.
      </Text>

      {phase === "idle" && (
        <View style={styles.uploadCard}>
          <Btn label="Take a photo" onPress={() => pickAndAnalyze("camera")} />
          <View style={{ height: spacing.sm }} />
          <Btn label="Pick from library" variant="ghost" onPress={() => pickAndAnalyze("library")} />
          {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>
      )}

      {phase === "analyzing" && (
        <View style={styles.uploadCard}>
          {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
          <Text style={styles.busy}>Analyzing your plate…</Text>
        </View>
      )}

      {(phase === "review" || phase === "saving") && (
        <>
          <View style={styles.reviewHead}>
            {previewUri && (
              <Image source={{ uri: previewUri }} style={styles.thumb} />
            )}
            <ConfidencePill level={confidence} />
          </View>
          <Text style={styles.sectionTitle}>What we see</Text>
          <Text style={styles.sub}>
            Uncheck anything you didn{"’"}t eat. Ranges are honest; high
            end is the cap.
          </Text>
          {items.map((it, i) => {
            const on = selected.has(i);
            return (
              <Pressable
                key={i}
                onPress={() => toggle(i)}
                style={[styles.item, on && styles.itemOn]}
              >
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <View style={styles.itemContent}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  {!!it.portion_estimate && (
                    <Text style={styles.itemPortion}>{it.portion_estimate}</Text>
                  )}
                  <Text style={styles.itemKcal}>
                    {it.kcal_low}–{it.kcal_high}
                    <Text style={styles.itemKcalUnit}> kcal</Text>
                  </Text>
                  <Text style={styles.itemMacros}>
                    P {fmt(it.protein_g_low)}–{fmt(it.protein_g_high)} · C{" "}
                    {fmt(it.carb_g_low)}–{fmt(it.carb_g_high)} · F{" "}
                    {fmt(it.fat_g_low)}–{fmt(it.fat_g_high)}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          {selected.size > 0 && (
            <View style={styles.total}>
              <Text style={styles.totalKicker}>
                PLATE TOTAL
                {selected.size < items.length
                  ? ` · ${selected.size} OF ${items.length}`
                  : ""}
              </Text>
              <Text style={styles.totalKcal}>
                {totals.kcal_low}–{totals.kcal_high}
                <Text style={styles.totalKcalUnit}> kcal</Text>
              </Text>
              <Text style={styles.totalMacros}>
                P {fmt(totals.protein_g_low)}–{fmt(totals.protein_g_high)} · C{" "}
                {fmt(totals.carb_g_low)}–{fmt(totals.carb_g_high)} · F{" "}
                {fmt(totals.fat_g_low)}–{fmt(totals.fat_g_high)}
              </Text>
            </View>
          )}

          {invisible.length > 0 && (
            <View style={styles.invisible}>
              <Text style={styles.kicker}>HIDDEN COSTS ACCOUNTED FOR</Text>
              {invisible.map((c, i) => (
                <Text key={i} style={styles.invisibleItem}>
                  · {c}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
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
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
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
  sectionTitle: { fontFamily: font.displayBold, fontSize: 18, color: colors.ink },
  item: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  itemOn: { borderColor: colors.goldDim, backgroundColor: "rgba(246,183,60,0.04)" },
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
  itemContent: { flex: 1, gap: 2 },
  itemName: { fontFamily: font.body, fontSize: 15, color: colors.ink },
  itemPortion: { fontFamily: font.mono, fontSize: 11, color: colors.dim },
  itemKcal: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 4,
  },
  itemKcalUnit: { fontFamily: font.mono, fontSize: 11, color: colors.dim },
  itemMacros: { fontFamily: font.mono, fontSize: 11, color: colors.dim },
  total: {
    backgroundColor: "rgba(246,183,60,0.06)",
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  totalKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  totalKcal: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
    marginTop: 2,
  },
  totalKcalUnit: { fontFamily: font.mono, fontSize: 12, color: colors.dim },
  totalMacros: { fontFamily: font.mono, fontSize: 12, color: colors.dim },
  invisible: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  invisibleItem: { fontFamily: font.body, fontSize: 13, color: colors.dim, lineHeight: 20, marginTop: 4 },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: spacing.sm,
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
