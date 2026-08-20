import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { markDayDirty } from "@/lib/calendarCache";
import type { ExerciseSpec, Program, Session } from "@/lib/programs";
import { colors, font, radius, spacing } from "@/lib/theme";

type SetLog = { reps: string; weight: string };
type ExerciseLog = { name: string; sets: SetLog[] };

export default function Workout() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    program_id?: string;
    session_index?: string;
  }>();
  const programId = typeof params.program_id === "string" ? params.program_id : "";
  const sessionIndex = Number(params.session_index ?? "0");

  const [session, setSession] = useState<Session | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [startedAt] = useState(() => Date.now());
  const [notes, setNotes] = useState("");
  const [swapped, setSwapped] = useState<Record<number, string>>({});

  const swapExercise = (exIdx: number, spec: ExerciseSpec) => {
    const options = spec.substitutes ?? [];
    if (options.length === 0) {
      Alert.alert(
        spec.name,
        t("workout.swap_no_options")
      );
      return;
    }
    const buttons = [
      { text: t("common.cancel"), style: "cancel" as const },
      {
        text: t("workout.original_label", { name: spec.name }),
        onPress: () =>
          setSwapped((s) => {
            const n = { ...s };
            delete n[exIdx];
            return n;
          }),
      },
      ...options.map((name) => ({
        text: name,
        onPress: () => {
          setSwapped((s) => ({ ...s, [exIdx]: name }));
          setLogs((prev) =>
            prev.map((e, i) => (i === exIdx ? { ...e, name } : e))
          );
        },
      })),
    ];
    Alert.alert(t("workout.swap_title"), t("workout.swap_body", { name: spec.name }), buttons);
  };

  useEffect(() => {
    (async () => {
      try {
        const { programs } = await api<{ programs: Program[] }>(
          "/api/workouts/catalog"
        );
        const p = programs.find((x) => x.id === programId);
        if (!p) {
          setErr("Program not found.");
          setLoading(false);
          return;
        }
        const s = p.sessions[sessionIndex] ?? p.sessions[0];
        if (!s) {
          setErr("Session not found.");
          setLoading(false);
          return;
        }
        setProgram(p);
        setSession(s);
        setLogs(
          s.exercises.map((ex) => ({
            name: ex.name,
            sets: Array.from({ length: ex.sets }, () => ({ reps: "", weight: "" })),
          }))
        );
        setLoading(false);
      } catch (e) {
        setErr((e as Error).message || t("workout.couldnt_load"));
        setLoading(false);
      }
    })();
  }, [programId, sessionIndex, t]);

  const updateSet = (
    exIdx: number,
    setIdx: number,
    field: "reps" | "weight",
    value: string
  ) => {
    setLogs((prev) => {
      const next = prev.map((e, i) =>
        i === exIdx
          ? {
              ...e,
              sets: e.sets.map((s, j) =>
                j === setIdx ? { ...s, [field]: value } : s
              ),
            }
          : e
      );
      return next;
    });
  };

  const anyLogged = useMemo(
    () =>
      logs.some((e) =>
        e.sets.some((s) => Number(s.reps) > 0 || Number(s.weight) > 0)
      ),
    [logs]
  );

  const finish = async () => {
    if (!session || !anyLogged) return;
    setBusy(true);
    setErr("");
    try {
      const exercises = logs
        .map((e) => ({
          name: e.name,
          sets: e.sets
            .filter((s) => Number(s.reps) > 0)
            .map((s) => ({
              reps: Number(s.reps),
              weight_kg: s.weight ? Number(s.weight) : null,
            })),
        }))
        .filter((e) => e.sets.length > 0);
      if (exercises.length === 0) {
        setErr(t("workout.at_least_one_set_err"));
        setBusy(false);
        return;
      }
      const duration = Math.round((Date.now() - startedAt) / 60000);
      await api("/api/workouts/log", {
        method: "POST",
        body: JSON.stringify({
          program_id: programId || null,
          session_index: sessionIndex,
          session_name: session.name,
          exercises,
          duration_min: duration > 0 ? duration : null,
          notes: notes.trim() || null,
        }),
      });
      markDayDirty();
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || t("workout.couldnt_save"));
      setBusy(false);
    }
  };

  const footer = session ? (
    <>
      {!!err && <Text style={styles.err}>{err}</Text>}
      <Btn
        label={busy ? t("common.saving") : anyLogged ? t("workout.finish") : t("workout.need_a_set")}
        onPress={finish}
        loading={busy}
        disabled={!anyLogged || busy}
      />
      <Btn
        label={t("common.cancel")}
        variant="ghost"
        onPress={() => router.back()}
        disabled={busy}
      />
    </>
  ) : undefined;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (!session || !program) {
    return (
      <Screen>
        <View style={styles.head}>
          <BackButton />
        </View>
        <Text style={styles.h1}>{err || t("workout.session_not_available")}</Text>
      </Screen>
    );
  }

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>
        {program.name.toUpperCase()} · {t("workout.session_prefix")} {sessionIndex + 1}
      </Text>
      <Text style={styles.h1}>{session.name}</Text>
      <Text style={styles.sub}>{session.focus}</Text>

      {session.exercises.map((ex, exIdx) => (
        <ExerciseCard
          key={`${ex.name}-${exIdx}`}
          spec={ex}
          log={logs[exIdx]}
          displayName={swapped[exIdx] ?? ex.name}
          onSetChange={(setIdx, field, value) =>
            updateSet(exIdx, setIdx, field, value)
          }
          onSwap={() => swapExercise(exIdx, ex)}
        />
      ))}

      <View style={styles.notesCard}>
        <Text style={styles.label}>{t("workout.notes_label")}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t("workout.notes_placeholder")}
          placeholderTextColor={colors.dim}
          multiline
          style={styles.notesInput}
        />
      </View>
    </Screen>
  );
}

function ExerciseCard({
  spec,
  log,
  displayName,
  onSetChange,
  onSwap,
}: {
  spec: ExerciseSpec;
  log: ExerciseLog | undefined;
  displayName: string;
  onSetChange: (setIdx: number, field: "reps" | "weight", value: string) => void;
  onSwap: () => void;
}) {
  const { t } = useTranslation();
  const [restLeft, setRestLeft] = useState<number | null>(null);

  useEffect(() => {
    if (restLeft == null) return;
    if (restLeft <= 0) {
      setRestLeft(null);
      return;
    }
    const id = setInterval(() => {
      setRestLeft((r) => (r == null || r <= 1 ? null : r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [restLeft]);

  if (!log) return null;
  const swapped = displayName !== spec.name;
  return (
    <View style={styles.exCard}>
      <Pressable onLongPress={onSwap} delayLongPress={400}>
        <View style={styles.exNameRow}>
          <Text style={styles.exName}>{displayName}</Text>
          {swapped && <Text style={styles.exSwapped}>{t("workout.swapped_badge")}</Text>}
        </View>
      </Pressable>
      <Text style={styles.exTarget}>
        {spec.sets} × {spec.reps}
        {spec.rpe ? ` @ RPE ${spec.rpe}` : ""}
        {spec.rest_sec ? ` · ${spec.rest_sec}s rest` : ""}
      </Text>
      {spec.cue && <Text style={styles.exCue}>{spec.cue}</Text>}
      {spec.substitutes && spec.substitutes.length > 0 && !swapped && (
        <Text style={styles.exSubs}>{t("workout.long_press_swap")}</Text>
      )}

      <View style={styles.setHeader}>
        <Text style={[styles.setHeaderCell, { flex: 1 }]}>{t("workout.sets_header")}</Text>
        <Text style={[styles.setHeaderCell, { flex: 2 }]}>{t("workout.reps_header")}</Text>
        <Text style={[styles.setHeaderCell, { flex: 2 }]}>{t("workout.weight_header")}</Text>
      </View>
      {log.sets.map((s, i) => (
        <View key={i} style={styles.setRow}>
          <Text style={[styles.setCell, { flex: 1, textAlign: "center" }]}>
            {i + 1}
          </Text>
          <TextInput
            value={s.reps}
            onChangeText={(v) => onSetChange(i, "reps", v)}
            keyboardType="numeric"
            placeholder="—"
            placeholderTextColor={colors.dim}
            style={[styles.setInput, { flex: 2 }]}
          />
          <TextInput
            value={s.weight}
            onChangeText={(v) => onSetChange(i, "weight", v)}
            keyboardType="numeric"
            placeholder="—"
            placeholderTextColor={colors.dim}
            style={[styles.setInput, { flex: 2 }]}
          />
        </View>
      ))}

      {spec.rest_sec ? (
        <Pressable
          onPress={() => setRestLeft(restLeft ? null : spec.rest_sec)}
          style={[styles.restBtn, restLeft ? styles.restBtnActive : null]}
        >
          <Text
            style={[styles.restLabel, restLeft ? styles.restLabelActive : null]}
          >
            {restLeft
              ? t("workout.resting", { time: formatMMSS(restLeft) })
              : t("workout.start_rest", { sec: spec.rest_sec })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  head: { marginTop: spacing.sm },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.mint,
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
  },
  exCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  exNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  exName: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
  },
  exSwapped: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.mint,
    letterSpacing: 1.2,
  },
  restBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    alignItems: "center",
  },
  restBtnActive: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  restLabel: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    letterSpacing: 1,
  },
  restLabelActive: {
    color: colors.gold,
  },
  exTarget: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.gold,
    marginTop: 2,
  },
  exCue: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 4,
    fontStyle: "italic",
  },
  exSubs: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  setHeader: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  setHeaderCell: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  setRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    paddingVertical: 6,
  },
  setCell: {
    fontFamily: font.mono,
    fontSize: 14,
    color: colors.dim,
  },
  setInput: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    color: colors.ink,
    fontFamily: font.mono,
    fontSize: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: "center",
  },
  notesCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  label: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  notesInput: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 14,
    padding: spacing.md,
    minHeight: 60,
  },
  err: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 13,
  },
});
