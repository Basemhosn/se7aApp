import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
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

const PROTOCOLS: { hours: number; label: string; sub: string }[] = [
  { hours: 12, label: "12:12", sub: "Beginner. Overnight fast." },
  { hours: 14, label: "14:10", sub: "Approachable. Skip breakfast." },
  { hours: 16, label: "16:8", sub: "Standard IF. Most common." },
  { hours: 18, label: "18:6", sub: "Aggressive. Later first meal." },
  { hours: 20, label: "20:4", sub: "Warrior. One main meal." },
  { hours: 24, label: "24:0", sub: "Full day. Rare, advanced." },
];

export default function Fasting() {
  const [data, setData] = useState<FastingResponse | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<FastingResponse>("/api/fasting/current");
      setData(res);
    } catch (e) {
      setErr((e as Error).message || "Couldn't load.");
    }
  }, []);

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
      setErr((e as Error).message || "Couldn't start.");
    }
    setBusy(false);
  };

  const end = async () => {
    Alert.alert("End fast?", "This will stop the timer and record the duration.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End it",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          setErr("");
          try {
            await api("/api/fasting/end", { method: "POST" });
            await load();
          } catch (e) {
            setErr((e as Error).message || "Couldn't end.");
          }
          setBusy(false);
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()}>
          <Wordmark size={20} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>FASTING</Text>
      <Text style={styles.h1}>
        {data?.active ? "You're fasting." : "Start a fast."}
      </Text>
      <Text style={styles.sub}>
        {data?.active
          ? "The timer updates live. End it when you eat."
          : "Pick a protocol. We track the window and log completion."}
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
                <Text style={styles.protoLabel}>{p.label}</Text>
                <Text style={styles.protoSub}>{p.sub}</Text>
              </View>
              <Text style={styles.protoArrow}>→</Text>
            </Pressable>
          ))}
        </View>
      )}

      {data?.last && !data.active && (
        <View style={styles.card}>
          <Text style={styles.cardKicker}>LAST FAST</Text>
          <Text style={styles.cardBody}>
            {niceDuration(data.last.started_at, data.last.ended_at)} · target{" "}
            {data.last.target_hours}h
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
  const startedMs = new Date(fast.started_at).getTime();
  const elapsedMs = Date.now() - startedMs;
  const targetMs = fast.target_hours * 60 * 60 * 1000;
  const pct = Math.min(1, elapsedMs / targetMs);
  const remaining = Math.max(0, targetMs - elapsedMs);

  const complete = elapsedMs >= targetMs;

  return (
    <View style={styles.timerCard}>
      <Text style={[styles.timerKicker, complete && { color: colors.mint }]}>
        {complete ? "TARGET REACHED" : "IN THE WINDOW"}
      </Text>
      <Text style={[styles.timerBig, complete && { color: colors.mint }]}>
        {formatDuration(elapsedMs)}
      </Text>
      <Text style={styles.timerSub}>
        {complete
          ? `Past ${fast.target_hours}h target by ${formatDuration(elapsedMs - targetMs)}`
          : `${formatDuration(remaining)} left · ${Math.round(pct * 100)}% there`}
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
      <Btn label={busy ? "Ending…" : "End fast"} onPress={onEnd} loading={busy} />
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

function niceDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const hours = ms / (60 * 60 * 1000);
  return `${hours.toFixed(1)} hours`;
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
