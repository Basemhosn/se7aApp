import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

interface ActiveFast {
  id: number;
  started_at: string;
  target_hours: number;
  notes: string | null;
}

interface FastingResponse {
  active: ActiveFast | null;
  last: {
    id: number;
    started_at: string;
    ended_at: string;
    target_hours: number;
  } | null;
}

const PROTOCOLS: { hours: number; key: "12_12" | "14_10" | "16_8" | "18_6" | "20_4" | "24_0" }[] = [
  { hours: 12, key: "12_12" },
  { hours: 14, key: "14_10" },
  { hours: 16, key: "16_8" },
  { hours: 18, key: "18_6" },
  { hours: 20, key: "20_4" },
  { hours: 24, key: "24_0" },
];

export default function Fasting() {
  const { t } = useTranslation();
  const [data, setData] = useState<FastingResponse | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<FastingResponse>("/api/fasting/current");
      setData(res);
    } catch (e) {
      setErr((e as Error).message || t("fasting.couldnt_load"));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Tick every second while a fast is active so the timer updates.
  useEffect(() => {
    if (!data?.active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [data?.active]);

  const start = async (hours: number) => {
    setBusy(true);
    setErr("");
    try {
      await api("/api/fasting/start", {
        method: "POST",
        body: JSON.stringify({ target_hours: hours }),
      });
      await load();
    } catch (e) {
      setErr((e as Error).message || t("fasting.couldnt_start"));
    }
    setBusy(false);
  };

  const end = async () => {
    Alert.alert(t("fasting.end_confirm_title"), t("fasting.end_confirm_body"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("fasting.end_confirm_ok"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          setErr("");
          try {
            await api("/api/fasting/end", { method: "POST" });
            await load();
          } catch (e) {
            setErr((e as Error).message || t("fasting.couldnt_end"));
          }
          setBusy(false);
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>{t("fasting.kicker")}</Text>
      <Text style={styles.h1}>
        {data?.active ? t("fasting.active_title") : t("fasting.idle_title")}
      </Text>
      <Text style={styles.sub}>
        {data?.active ? t("fasting.active_sub") : t("fasting.idle_sub")}
      </Text>

      {data?.active && (
        <ActiveTimer
          fast={data.active}
          tick={tick}
          onEnd={end}
          busy={busy}
        />
      )}

      {!data?.active && (
        <View style={{ gap: spacing.sm }}>
          {PROTOCOLS.map((p) => (
            <Pressable
              key={p.hours}
              onPress={() => start(p.hours)}
              disabled={busy}
              style={styles.protoCard}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.protoLabel}>{t(`fasting.protocol.${p.key}`)}</Text>
                <Text style={styles.protoSub}>{t(`fasting.protocol.${p.key}_sub`)}</Text>
              </View>
              <Text style={styles.protoArrow}>→</Text>
            </Pressable>
          ))}
        </View>
      )}

      {data?.last && !data.active && (
        <View style={styles.card}>
          <Text style={styles.cardKicker}>{t("fasting.last_fast")}</Text>
          <Text style={styles.cardBody}>
            {t("fasting.hours_completed", { hours: hoursCompleted(data.last.started_at, data.last.ended_at) })} ·{" "}
            {t("fasting.hours_target", { hours: data.last.target_hours })}
          </Text>
          <Text style={styles.cardSub}>
            {new Date(data.last.started_at).toLocaleDateString()}
          </Text>
        </View>
      )}

      {!!err && <Text style={styles.err}>{err}</Text>}
    </Screen>
  );
}

function ActiveTimer({
  fast,
  onEnd,
  busy,
}: {
  fast: ActiveFast;
  tick: number;
  onEnd: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const startedMs = new Date(fast.started_at).getTime();
  const elapsedMs = Date.now() - startedMs;
  const targetMs = fast.target_hours * 60 * 60 * 1000;
  const pct = Math.min(1, elapsedMs / targetMs);
  const remaining = Math.max(0, targetMs - elapsedMs);

  const complete = elapsedMs >= targetMs;

  return (
    <View style={styles.timerCard}>
      <Text style={[styles.timerKicker, complete && { color: colors.mint }]}>
        {complete ? t("fasting.target_reached") : t("fasting.in_the_window")}
      </Text>
      <Text style={[styles.timerBig, complete && { color: colors.mint }]}>
        {formatDuration(elapsedMs)}
      </Text>
      <Text style={styles.timerSub}>
        {complete
          ? t("fasting.past_target", {
              target: fast.target_hours,
              time: formatDuration(elapsedMs - targetMs),
            })
          : t("fasting.left_and_pct", {
              time: formatDuration(remaining),
              pct: Math.round(pct * 100),
            })}
      </Text>

      <View style={styles.progress}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.round(pct * 100)}%`,
              backgroundColor: complete ? colors.mint : colors.gold,
            },
          ]}
        />
      </View>

      <View style={{ height: spacing.md }} />
      <Btn label={busy ? t("fasting.ending") : t("fasting.end_fast")} onPress={onEnd} loading={busy} />
    </View>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function hoursCompleted(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const hours = ms / (60 * 60 * 1000);
  return hours.toFixed(1);
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: {
    fontFamily: font.displayBold,
    fontSize: 28,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
  },
  timerCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
  },
  timerKicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  timerBig: {
    fontFamily: font.displayBold,
    fontSize: 44,
    color: colors.ink,
    marginTop: 4,
  },
  timerSub: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
  },
  progress: {
    height: 6,
    backgroundColor: colors.panel2,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: spacing.md,
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
  protoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  protoLabel: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
  },
  protoSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
  },
  protoArrow: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.dim,
  },
  card: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  cardKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  cardBody: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: 2,
  },
  cardSub: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  err: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 13,
  },
});
