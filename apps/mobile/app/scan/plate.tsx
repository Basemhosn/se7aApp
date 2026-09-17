import { useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { ConfidencePill } from "@/components/Pill";
import { api, apiUpload, RateLimitedError, rateLimitMessage } from "@/lib/api";
import { markDayDirty, pushOptimisticLogItems } from "@/lib/calendarCache";
import {
  attachScanId,
  getScan,
  getScans,
  markFailed,
  reconcileFromServer,
  registerScan,
  removeScan,
} from "@/lib/scanStore";
import { computeFitScore, type FitBudget } from "@/lib/fitScore";
import { supabase } from "@/lib/supabase";
import { colors, font, radius, spacing } from "@/lib/theme";
import type { LedgerDayResponse, MealSlot, PlateItem } from "@/types";
import { slotForNow } from "@/lib/slot";

type Phase = "idle" | "analyzing" | "review" | "saving";

export default function PlateScan() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ resume?: string; scan_id?: string }>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [items, setItems] = useState<PlateItem[]>([]);
  const [confidence, setConfidence] = useState<"low" | "medium" | "high">("medium");
  const [invisible, setInvisible] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [slot, setSlot] = useState<MealSlot>(slotForNow());
  // Local ID from the scan store when this screen was reached via the
  // Home tab's pending-scan card. Null on a fresh scan.
  const [resumeLocalId, setResumeLocalId] = useState<string | null>(null);
  // Fit-score budget: user's daily targets and what's been logged so
  // far today. Fetched once when the review phase opens; null while
  // loading or when the profile isn't complete enough to compute.
  const [fitBudget, setFitBudget] = useState<FitBudget | null>(null);

  // Arrival paths that hydrate the review UI without forcing a re-pick:
  //   • ?resume=<localId>   — user tapped a pending-scan card on Home
  //   • ?scan_id=<uuid>     — user tapped the "scan ready" push
  //
  // scan_id lookup goes: local store first (fast + has previewUri) →
  // reconcile from server if the local entry is still analyzing → if
  // it's still not resolvable, hand the user back to camera.
  useEffect(() => {
    if (phase !== "idle") return;
    const resumeId = params.resume;
    const scanIdParam = params.scan_id;
    if (!resumeId && !scanIdParam) return;

    let stored = resumeId ? getScan(resumeId) : undefined;
    if (!stored && scanIdParam) {
      stored = getScans().find((s) => s.scanId === scanIdParam);
    }
    const hydrate = () => {
      const s = stored;
      if (!s || s.status !== "ready" || !s.items || !s.scanId) return;
      setResumeLocalId(s.localId);
      setPreviewUri(s.previewUri);
      setScanId(s.scanId);
      setItems(s.items);
      setConfidence(s.confidence ?? "medium");
      setInvisible(s.invisibleCosts ?? []);
      setSelected(new Set(s.items.map((_, i) => i)));
      setPhase("review");
    };
    if (stored && stored.status === "ready") {
      hydrate();
      return;
    }
    // Local entry not ready yet — reconcile against server, then retry.
    if (stored && scanIdParam) {
      void reconcileFromServer().then(() => {
        stored = getScans().find((s) => s.scanId === scanIdParam);
        hydrate();
      });
    }
  }, [params.resume, params.scan_id, phase]);

  // Load fit-score budget (daily targets + today's consumed) once we
  // enter review. Profile targets come straight from Supabase via RLS;
  // the ledger endpoint returns today's totals. Both silently fall
  // back to null on failure — the fit-score card just hides itself.
  useEffect(() => {
    if (phase !== "review" || fitBudget) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data: profile }, ledger] = await Promise.all([
          supabase
            .from("profiles")
            .select(
              "daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g"
            )
            .single(),
          api<LedgerDayResponse>(
            `/api/ledger/today?tz_offset_min=${-new Date().getTimezoneOffset()}`
          ).catch(() => null),
        ]);
        if (cancelled) return;
        if (
          !profile?.daily_kcal_target ||
          !profile.daily_protein_g ||
          !profile.daily_carb_g ||
          !profile.daily_fat_g
        ) {
          return;
        }
        const kcalMid = ledger
          ? (ledger.totals.kcal.low + ledger.totals.kcal.high) / 2
          : 0;
        const pMid = ledger
          ? (ledger.totals.protein_g.low + ledger.totals.protein_g.high) / 2
          : 0;
        const cMid = ledger
          ? (ledger.totals.carb_g.low + ledger.totals.carb_g.high) / 2
          : 0;
        const fMid = ledger
          ? (ledger.totals.fat_g.low + ledger.totals.fat_g.high) / 2
          : 0;
        setFitBudget({
          kcal_target: profile.daily_kcal_target,
          protein_target: profile.daily_protein_g,
          carb_target: profile.daily_carb_g,
          fat_target: profile.daily_fat_g,
          kcal_consumed: kcalMid,
          protein_consumed: pMid,
          carb_consumed: cMid,
          fat_consumed: fMid,
        });
      } catch {
        /* silent — hide the fit card */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, fitBudget]);
  // Per-item portion overrides. Scale of 1 = as-scanned. Label overrides
  // the portion_estimate string in both the UI and the ledger row so
  // the user's edit is what gets persisted.
  const [edits, setEdits] = useState<Record<number, { scale: number; label: string | null }>>({});

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
    const asset = r.assets[0];
    const resized = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    // Async plate scan (Cal.ai pattern): register a pending entry in
    // the store, navigate to Home immediately, and let the AI call
    // run in background. Home renders a card for each pending entry;
    // tapping a "ready" one hops back here with ?resume=<localId>.
    const localId = registerScan(resized.uri);
    router.replace("/");
    void runScanInBackground(localId, resized.uri);
  };

  /**
   * Upload the image and hand off to the server. Async plate scan v2
   * (2026-09-16): server runs the AI in a background task (waitUntil,
   * up to 300s) and pushes a notification when ready. This function
   * only needs to wait for the initial upload + scan_id acknowledge
   * — usually a few seconds regardless of AI complexity.
   *
   * When the user kills the app right after this call, the server keeps
   * working; on next launch scanStore.reconcileFromServer() pulls the
   * finished state by scanId.
   */
  const runScanInBackground = async (
    localId: string,
    uri: string
  ): Promise<void> => {
    try {
      const body = await apiUpload<{
        ok: boolean;
        scan_id: string;
        status: "queued";
        image_stored: boolean;
      }>("/api/scan/plate", "image", {
        uri,
        mimeType: "image/jpeg",
        fileName: "plate.jpg",
      });
      // Persist scan_id — this is what makes app-kill survivable.
      attachScanId(localId, body.scan_id);
      // No local scheduleNotification here: the server sends the
      // "your scan is ready" push via Expo Push API when the AI
      // completes. Local notif would race + duplicate.
    } catch (e) {
      if (e instanceof RateLimitedError) {
        const { body: msg } = rateLimitMessage(e);
        markFailed(localId, msg);
        return;
      }
      markFailed(
        localId,
        (e as Error).message || t("scan.plate.couldnt_analyze")
      );
    }
  };

  const scaled = (it: PlateItem, i: number): PlateItem => {
    const e = edits[i];
    if (!e || e.scale === 1) return it;
    const s = e.scale;
    return {
      ...it,
      portion_estimate: e.label ?? it.portion_estimate,
      kcal_low: Math.round(it.kcal_low * s),
      kcal_high: Math.round(it.kcal_high * s),
      protein_g_low: Math.round(it.protein_g_low * s * 10) / 10,
      protein_g_high: Math.round(it.protein_g_high * s * 10) / 10,
      carb_g_low: Math.round(it.carb_g_low * s * 10) / 10,
      carb_g_high: Math.round(it.carb_g_high * s * 10) / 10,
      fat_g_low: Math.round(it.fat_g_low * s * 10) / 10,
      fat_g_high: Math.round(it.fat_g_high * s * 10) / 10,
    };
  };

  const editPortion = (i: number) => {
    const it = items[i];
    if (!it) return;
    const parsed = parsePortionGrams(it.portion_estimate);
    const currentGrams = parsed !== null && edits[i]
      ? Math.round(parsed * edits[i]!.scale)
      : parsed;

    if (parsed !== null) {
      Alert.prompt(
        t("scan.plate.edit_portion_title"),
        t("scan.plate.edit_portion_grams_body", { g: parsed }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.save"),
            onPress: (val) => {
              const n = Number((val ?? "").trim());
              if (!Number.isFinite(n) || n <= 0) return;
              const scale = n / parsed;
              setEdits((prev) => ({
                ...prev,
                [i]: { scale, label: `${Math.round(n)}g` },
              }));
            },
          },
        ],
        "plain-text",
        String(currentGrams ?? parsed)
      );
    } else {
      Alert.prompt(
        t("scan.plate.edit_portion_title"),
        t("scan.plate.edit_portion_multiplier_body"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.apply"),
            onPress: (val) => {
              const n = Number((val ?? "").trim());
              if (!Number.isFinite(n) || n <= 0) return;
              setEdits((prev) => ({
                ...prev,
                [i]: { scale: n, label: null },
              }));
            },
          },
        ],
        "plain-text",
        String(edits[i]?.scale ?? 1)
      );
    }
  };

  const totals = items.reduce(
    (acc, it, i) => {
      if (!selected.has(i)) return acc;
      const s = scaled(it, i);
      acc.kcal_low += s.kcal_low;
      acc.kcal_high += s.kcal_high;
      acc.protein_g_low += s.protein_g_low;
      acc.protein_g_high += s.protein_g_high;
      acc.carb_g_low += s.carb_g_low;
      acc.carb_g_high += s.carb_g_high;
      acc.fat_g_low += s.fat_g_low;
      acc.fat_g_high += s.fat_g_high;
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
      setErr(t("scan.plate.pick_at_least_one_err"));
      return;
    }
    setPhase("saving");
    setErr("");
    try {
      // Persist the scaled items so the user's grammage edits stick.
      const scaledPicked = items
        .map((it, i) => ({ it: scaled(it, i), i }))
        .filter((x) => selected.has(x.i))
        .map((x) => ({ ...x.it, confidence }));
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          scan_id: scanId,
          source: "plate_scan",
          meal_slot: slot,
          items: scaledPicked,
        }),
      });
      markDayDirty();
      // Clean up the pending-scan card on Home now that the review
      // is committed to the ledger.
      if (resumeLocalId) removeScan(resumeLocalId);
      // Plate scan currently doesn't carry micronutrients in the
      // scaled review shape — the server extracts them from scan_id
      // instead. Optimistic merge just uses macros; the fresh fetch
      // will bring in sodium/fiber/sugar/sat_fat when it lands.
      pushOptimisticLogItems(
        scaledPicked.map((it) => ({
          name: it.name,
          portion_estimate: it.portion_estimate ?? null,
          source: "plate_scan",
          confidence: it.confidence ?? null,
          meal_slot: slot,
          kcal_low: it.kcal_low,
          kcal_high: it.kcal_high,
          protein_g_low: it.protein_g_low,
          protein_g_high: it.protein_g_high,
          carb_g_low: it.carb_g_low,
          carb_g_high: it.carb_g_high,
          fat_g_low: it.fat_g_low,
          fat_g_high: it.fat_g_high,
        }))
      );
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || t("scan.plate.couldnt_save"));
      setPhase("review");
    }
  };

  const reset = () => {
    if (resumeLocalId) {
      removeScan(resumeLocalId);
      setResumeLocalId(null);
    }
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
                ? t("scan.common.pick_at_least_one")
                : t("scan.common.add_to_slot", { slot: t(`common.meal_slot.${slot}`) })
          }
          onPress={save}
          loading={phase === "saving"}
          disabled={selected.size === 0}
        />
        <Btn
          label={t("scan.common.discard")}
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
      <Text style={styles.kicker}>{t("scan.plate.kicker")}</Text>
      <Text style={styles.h1}>{t("scan.plate.title")}</Text>
      <Text style={styles.sub}>
        {t("scan.plate.sub")}
      </Text>

      {phase === "idle" && (
        <View style={styles.uploadCard}>
          <Btn label={t("scan.common.take_photo")} onPress={() => pickAndAnalyze("camera")} />
          <View style={{ height: spacing.sm }} />
          <Btn label={t("scan.common.pick_from_library")} variant="ghost" onPress={() => pickAndAnalyze("library")} />
          {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>
      )}

      {phase === "analyzing" && (
        <View style={styles.uploadCard}>
          {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
          <Text style={styles.busy}>{t("scan.plate.analyzing")}</Text>
        </View>
      )}

      {(phase === "review" || phase === "saving") && (
        <>
          {previewUri && (
            <View style={styles.hero}>
              <Image source={{ uri: previewUri }} style={styles.heroImage} />
              <View style={styles.heroConfidence}>
                <ConfidencePill level={confidence} />
              </View>
            </View>
          )}

          {selected.size > 0 && (
            <View style={styles.macroCard}>
              <Text style={styles.macroKicker}>
                {selected.size < items.length
                  ? `${t("scan.plate.plate_total").toUpperCase()} · ${selected.size}/${items.length}`
                  : t("scan.plate.plate_total").toUpperCase()}
              </Text>
              <View style={styles.macroStrip}>
                <MacroCol
                  icon="flame"
                  value={`${totals.kcal_low}–${totals.kcal_high}`}
                  label={t("common.kcal")}
                />
                <View style={styles.macroDivider} />
                <MacroCol
                  letter="P"
                  value={`${fmt(totals.protein_g_low)}–${fmt(totals.protein_g_high)}`}
                  label="g"
                />
                <View style={styles.macroDivider} />
                <MacroCol
                  letter="C"
                  value={`${fmt(totals.carb_g_low)}–${fmt(totals.carb_g_high)}`}
                  label="g"
                />
                <View style={styles.macroDivider} />
                <MacroCol
                  letter="F"
                  value={`${fmt(totals.fat_g_low)}–${fmt(totals.fat_g_high)}`}
                  label="g"
                />
              </View>
            </View>
          )}

          {selected.size > 0 && fitBudget && (
            <FitScoreCard
              meal={{
                kcal: (totals.kcal_low + totals.kcal_high) / 2,
                protein:
                  (totals.protein_g_low + totals.protein_g_high) / 2,
                carbs: (totals.carb_g_low + totals.carb_g_high) / 2,
                fat: (totals.fat_g_low + totals.fat_g_high) / 2,
              }}
              budget={fitBudget}
            />
          )}

          <Text style={styles.sectionTitle}>{t("scan.plate.what_we_see")}</Text>
          <Text style={styles.sub}>
            {t("scan.plate.what_we_see_hint")}
          </Text>
          {items.map((raw, i) => {
            const on = selected.has(i);
            const it = scaled(raw, i);
            const isEdited = !!edits[i] && edits[i]!.scale !== 1;
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
                    <Pressable
                      onPress={() => editPortion(i)}
                      hitSlop={8}
                      style={styles.portionRow}
                    >
                      <Text style={styles.itemPortion}>
                        {it.portion_estimate}
                      </Text>
                      <Text
                        style={[
                          styles.portionEditHint,
                          isEdited && styles.portionEditHintActive,
                        ]}
                      >
                        {isEdited ? "✎ edited" : "✎ edit"}
                      </Text>
                    </Pressable>
                  )}
                  <Text style={styles.itemKcal}>
                    {it.kcal_low}–{it.kcal_high}
                    <Text style={styles.itemKcalUnit}> {t("common.kcal")}</Text>
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


          {invisible.length > 0 && (
            <View style={styles.invisible}>
              <Text style={styles.kicker}>{t("scan.plate.hidden_costs")}</Text>
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


/**
 * Extract a leading grams value from the AI's portion_estimate string
 * ("180g grilled chicken", "180 g", "180 grams", "1.5 kg"). Returns
 * null when the portion is described in cups/tbsp/pieces/servings —
 * those go through the multiplier prompt instead. kg is normalized
 * to g so the user always edits in grams.
 */
/**
 * Fit score card — 0-10 verdict on how this meal fits the user's
 * remaining day. Explicit non-goal: this is NOT a "healthiness"
 * score. Focused on YOUR budget so we avoid orthorexia framing.
 * Reasons list explains the number, so it never feels opaque.
 */
function FitScoreCard({
  meal,
  budget,
}: {
  meal: { kcal: number; protein: number; carbs: number; fat: number };
  budget: FitBudget;
}) {
  const result = computeFitScore(meal, budget);
  if (result.unavailable) return null;
  const tone =
    result.score >= 7
      ? colors.mint
      : result.score >= 5
        ? colors.gold
        : colors.coral;
  const barWidth = `${Math.max(4, result.score * 10)}%` as const;
  return (
    <View style={styles.fitCard}>
      <View style={styles.fitHead}>
        <Text style={styles.fitKicker}>FIT SCORE · YOUR DAY</Text>
        <Text style={[styles.fitScore, { color: tone }]}>
          {result.score}
          <Text style={styles.fitScoreDenom}>/10</Text>
        </Text>
      </View>
      <View style={styles.fitBarTrack}>
        <View
          style={[
            styles.fitBarFill,
            { width: barWidth, backgroundColor: tone },
          ]}
        />
      </View>
      <Text style={styles.fitVerdict}>{result.verdict}</Text>
      {result.reasons.slice(0, 2).map((r, i) => (
        <Text key={i} style={styles.fitReason}>
          · {r}
        </Text>
      ))}
    </View>
  );
}

/**
 * Single column in the top macro strip. Either an Ionicon (calories)
 * or a colored capital letter (P / C / F) heads the column so it's
 * scannable in a glance without reading labels.
 */
function MacroCol({
  icon,
  letter,
  value,
  label,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  letter?: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.macroCol}>
      <View style={styles.macroBadge}>
        {icon ? (
          <Ionicons name={icon} size={14} color={colors.gold} />
        ) : (
          <Text style={styles.macroBadgeLetter}>{letter}</Text>
        )}
      </View>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

function parsePortionGrams(portion: string): number | null {
  const trimmed = portion.trim();
  const m = /^(\d+(?:\.\d+)?)\s*(kg|g|grams?)\b/i.exec(trimmed);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return /^kg$/i.test(m[2]!) ? Math.round(n * 1000) : Math.round(n);
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
  // Full-width hero photo at the top of the review — replaces the
  // small thumbnail. Aspect 16:10 crops most food shots nicely and
  // keeps the whole card usable above the fold.
  hero: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroConfidence: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
  },
  // 4-column macro strip below the hero. Range values sit big; icon /
  // letter badge above; unit micro-label below. Scannable in a glance
  // without reading a legend.
  macroCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  macroKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  macroStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  macroCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  macroBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gold + "18",
    borderWidth: 1,
    borderColor: colors.gold + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  macroBadgeLetter: {
    fontFamily: font.displayBold,
    fontSize: 13,
    color: colors.gold,
    lineHeight: 15,
  },
  macroValue: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: 2,
  },
  macroLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 0.8,
  },
  macroDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.line,
  },
  // Fit score — verdict on how the meal fits YOUR day. Tone shifts
  // by score band; the reasons list prevents the number from feeling
  // opaque.
  fitCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  fitHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  fitKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  fitScore: {
    fontFamily: font.displayBold,
    fontSize: 26,
    lineHeight: 30,
  },
  fitScoreDenom: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  fitBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: "hidden",
    marginTop: 2,
  },
  fitBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  fitVerdict: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 4,
  },
  fitReason: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    lineHeight: 17,
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
  portionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  portionEditHint: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 0.6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  portionEditHintActive: {
    color: colors.gold,
    borderColor: colors.gold,
  },
  itemKcal: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 4,
  },
  itemKcalUnit: { fontFamily: font.mono, fontSize: 11, color: colors.dim },
  itemMacros: { fontFamily: font.mono, fontSize: 11, color: colors.dim },
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
