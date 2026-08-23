import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Audio } from "expo-av";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import {
  api,
  apiUpload,
  RateLimitedError,
  rateLimitMessage,
} from "@/lib/api";
import { markDayDirty } from "@/lib/calendarCache";
import { colors, font, radius, spacing } from "@/lib/theme";
import type { MealSlot } from "@/types";
import { slotForNow } from "@/lib/slot";

interface VoiceLogItem {
  name: string;
  portion_estimate: string;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
  sodium_mg_low?: number;
  sodium_mg_high?: number;
  fiber_g_low?: number;
  fiber_g_high?: number;
  sugar_g_low?: number;
  sugar_g_high?: number;
  saturated_fat_g_low?: number;
  saturated_fat_g_high?: number;
  confidence?: "low" | "medium" | "high";
}

interface VoiceLogResponse {
  ok: boolean;
  transcript: string;
  result: {
    transcript_echo: string;
    items: VoiceLogItem[];
    notes?: string;
  };
}

type Phase = "idle" | "recording" | "transcribing" | "review" | "saving";

export default function VoiceLog() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const params = useLocalSearchParams<{ slot?: string }>();
  const initialSlot: MealSlot =
    params.slot && ["breakfast", "lunch", "dinner", "snack"].includes(
      params.slot
    )
      ? (params.slot as MealSlot)
      : slotForNow();

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [items, setItems] = useState<VoiceLogItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [err, setErr] = useState("");
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  // Pulse the mic while recording so the user knows it's live.
  useEffect(() => {
    if (phase !== "recording") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.15,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  const startRecording = useCallback(async () => {
    setErr("");
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          isArabic ? "أذن بالميكروفون" : "Microphone permission needed",
          isArabic
            ? "افتح الإعدادات لتفعيل الميكروفون لـ SE7A."
            : "Open Settings → SE7A to enable microphone access."
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      // High-quality preset produces m4a — Whisper handles it natively.
      await rec.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await rec.startAsync();
      recordingRef.current = rec;
      setPhase("recording");
    } catch (e) {
      setErr((e as Error).message ?? "Couldn't start recording.");
    }
  }, [isArabic]);

  const stopAndSend = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    setPhase("transcribing");
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error("No recording produced.");

      const res = await apiUpload<VoiceLogResponse>(
        "/api/voice-log",
        "audio",
        { uri, mimeType: "audio/m4a", fileName: "voice.m4a" }
      );
      setTranscript(res.transcript);
      setItems(res.result.items);
      setSelected(new Set(res.result.items.map((_, i) => i)));
      setPhase("review");
    } catch (e) {
      if (e instanceof RateLimitedError) {
        const { title, body } = rateLimitMessage(e);
        Alert.alert(title, body);
        setPhase("idle");
        return;
      }
      setErr((e as Error).message ?? "Couldn't process the recording.");
      setPhase("idle");
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    const rec = recordingRef.current;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        /* silent */
      }
      recordingRef.current = null;
    }
    setPhase("idle");
    setTranscript("");
    setItems([]);
    setSelected(new Set());
    setErr("");
  }, []);

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const save = async () => {
    const picked = items.filter((_, i) => selected.has(i));
    if (picked.length === 0) return;
    setPhase("saving");
    setErr("");
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          source: "voice",
          meal_slot: slot,
          items: picked.map((it) => ({ ...it })),
        }),
      });
      markDayDirty();
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message ?? "Couldn't save — try again.");
      setPhase("review");
    }
  };

  const totalKcal = items.reduce(
    (acc, it, i) => {
      if (!selected.has(i)) return acc;
      acc.low += it.kcal_low;
      acc.high += it.kcal_high;
      return acc;
    },
    { low: 0, high: 0 }
  );

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>{isArabic ? "سجّل بالصوت" : "VOICE LOG"}</Text>
      <Text style={styles.h1}>
        {isArabic ? "قل ماذا أكلت" : "Say what you ate"}
      </Text>
      <Text style={styles.sub}>
        {isArabic
          ? "مثال: «شاورما دجاج ولبن»"
          : "e.g. \"chicken shawarma and a laban\""}
      </Text>

      {phase === "idle" && (
        <View style={styles.centered}>
          <Pressable onPress={startRecording} style={styles.micWrap}>
            <View style={styles.micBig}>
              <Ionicons name="mic" size={44} color={colors.bg} />
            </View>
          </Pressable>
          <Text style={styles.hint}>
            {isArabic ? "اضغط للتسجيل" : "Tap to record"}
          </Text>
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>
      )}

      {phase === "recording" && (
        <View style={styles.centered}>
          <Pressable onPress={stopAndSend}>
            <Animated.View
              style={[styles.micBig, styles.micHot, { transform: [{ scale: pulse }] }]}
            >
              <Ionicons name="stop" size={44} color={colors.bg} />
            </Animated.View>
          </Pressable>
          <Text style={styles.hint}>
            {isArabic ? "اضغط للإيقاف والتحويل" : "Tap to stop and process"}
          </Text>
          <Btn
            label={isArabic ? "إلغاء" : "Cancel"}
            onPress={cancelRecording}
            variant="ghost"
          />
        </View>
      )}

      {phase === "transcribing" && (
        <View style={styles.centered}>
          <View style={styles.micBig}>
            <Ionicons name="hourglass" size={44} color={colors.bg} />
          </View>
          <Text style={styles.hint}>
            {isArabic ? "جاري القراءة…" : "Reading what you said…"}
          </Text>
        </View>
      )}

      {(phase === "review" || phase === "saving") && (
        <>
          {transcript.length > 0 && (
            <View style={styles.transcriptCard}>
              <Text style={styles.transcriptKicker}>
                {isArabic ? "ما سمعناه" : "WHAT WE HEARD"}
              </Text>
              <Text style={styles.transcriptText}>&ldquo;{transcript}&rdquo;</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>
            {isArabic ? "العناصر" : "Items"}
          </Text>
          {items.length === 0 && (
            <Text style={styles.emptyHint}>
              {isArabic
                ? "لم نتعرف على شيء — حاول مجدداً."
                : "We didn't catch any items — try again."}
            </Text>
          )}
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  <Text style={styles.itemPortion}>{it.portion_estimate}</Text>
                  <Text style={styles.itemKcal}>
                    {it.kcal_low}–{it.kcal_high}
                    <Text style={styles.itemKcalUnit}> kcal</Text>
                  </Text>
                </View>
              </Pressable>
            );
          })}

          {items.length > 0 && (
            <>
              <View style={styles.slotRow}>
                {(["breakfast", "lunch", "dinner", "snack"] as MealSlot[]).map(
                  (s) => (
                    <Pressable
                      key={s}
                      onPress={() => setSlot(s)}
                      style={[styles.chip, slot === s && styles.chipOn]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          slot === s && styles.chipTextOn,
                        ]}
                      >
                        {s}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
              {!!err && <Text style={styles.err}>{err}</Text>}
              <Btn
                label={
                  phase === "saving"
                    ? isArabic ? "جاري الحفظ…" : "Saving…"
                    : selected.size === 0
                      ? isArabic ? "اختر عنصر" : "Pick at least one item"
                      : `Log ${selected.size} to ${slot} · ${totalKcal.low}–${totalKcal.high} kcal`
                }
                onPress={save}
                loading={phase === "saving"}
                disabled={selected.size === 0}
              />
              <Btn
                label={isArabic ? "سجّل مرة أخرى" : "Record again"}
                variant="ghost"
                onPress={cancelRecording}
                disabled={phase === "saving"}
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}


const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.dim, lineHeight: 21 },
  centered: {
    alignItems: "center",
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  micWrap: {},
  micBig: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  micHot: {
    backgroundColor: colors.coral,
    shadowColor: colors.coral,
  },
  hint: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    letterSpacing: 1.2,
    marginTop: spacing.sm,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
  transcriptCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: 4,
  },
  transcriptKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  transcriptText: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
    fontStyle: "italic",
    lineHeight: 22,
  },
  sectionTitle: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
    marginTop: spacing.md,
  },
  emptyHint: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: spacing.sm,
  },
  item: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  itemOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.05)",
  },
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
  itemName: { fontFamily: font.body, fontSize: 15, color: colors.ink },
  itemPortion: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  itemKcal: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 2,
  },
  itemKcalUnit: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  slotRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  chipOn: { borderColor: colors.gold, backgroundColor: "rgba(246,183,60,0.10)" },
  chipText: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.ink,
    textTransform: "capitalize",
  },
  chipTextOn: { color: colors.gold },
});
