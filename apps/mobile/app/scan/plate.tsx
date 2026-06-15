import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
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
      router.replace("/dashboard");
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

  return (
    <Screen>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()}>
          <Wordmark size={20} />
        </Pressable>
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
          {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
          <ConfidencePill level={confidence} />
          <Text style={styles.sectionTitle}>What we see</Text>
          <Text style={styles.sub}>
            Uncheck anything you didn{"’"}t eat. Ranges are honest; high
            end is the cap.
          </Text>
          {items.map((it, i) => (
            <Pressable
              key={i}
              onPress={() => toggle(i)}
              style={[styles.item, selected.has(i) && styles.itemOn]}
            >
              <View style={styles.itemHead}>
                <Text style={styles.itemName}>{it.name}</Text>
                <Text style={styles.itemPortion}>{it.portion_estimate}</Text>
              </View>
              <Text style={styles.itemMacros}>
                {it.kcal_low}–{it.kcal_high} kcal · P {fmt(it.protein_g_low)}–
                {fmt(it.protein_g_high)} · C {fmt(it.carb_g_low)}–
                {fmt(it.carb_g_high)} · F {fmt(it.fat_g_low)}–
                {fmt(it.fat_g_high)}
              </Text>
              <Text style={styles.itemCheck}>
                {selected.has(i) ? "✓ included" : "tap to include"}
              </Text>
            </Pressable>
          ))}

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

          {!!err && <Text style={styles.err}>{err}</Text>}

          <Btn
            label={phase === "saving" ? "Saving…" : "Add to today"}
            onPress={save}
            loading={phase === "saving"}
          />
          <Btn label="Discard" variant="ghost" onPress={reset} disabled={phase === "saving"} />
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
  busy: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink, marginTop: spacing.md },
  sectionTitle: { fontFamily: font.displayBold, fontSize: 18, color: colors.ink },
  item: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  itemOn: { borderColor: colors.goldDim, backgroundColor: "rgba(246,183,60,0.04)" },
  itemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  itemName: { fontFamily: font.body, fontSize: 15, color: colors.ink },
  itemPortion: { fontFamily: font.mono, fontSize: 11, color: colors.dim },
  itemMacros: { fontFamily: font.mono, fontSize: 12, color: colors.ink, marginTop: 4 },
  itemCheck: { fontFamily: font.mono, fontSize: 10, color: colors.dim, marginTop: 4 },
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
