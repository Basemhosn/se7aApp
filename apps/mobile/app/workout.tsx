import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
import type { ExerciseSpec, Program, Session } from "@/lib/programs";
import { colors, font, radius, spacing } from "@/lib/theme";

type SetLog = { reps: string; weight: string };
type ExerciseLog = { name: string; sets: SetLog[] };

export default function Workout() {
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
        setErr((e as Error).message || "Couldn't load the session.");
        setLoading(false);
      }
    })();
  }, [programId, sessionIndex]);

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
        setErr("Log at least one set on one exercise.");
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
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || "Couldn't save the session.");
      setBusy(false);
    }
  };

  const footer = session ? (
    <>
      {!!err && <Text style={styles.err}>{err}</Text>}
      <Btn
        label={busy ? "Saving…" : anyLogged ? "Finish workout" : "Log at least one set"}
        onPress={finish}
        loading={busy}
        disabled={!anyLogged || busy}
      />
      <Btn
        label="Cancel"
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
          <Pressable onPress={() => router.back()}>
            <Wordmark size={20} />
          </Pressable>
        </View>
        <Text style={styles.h1}>{err || "Session not available."}</Text>
        <Btn label="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()}>
          <Wordmark size={20} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>
        {program.name.toUpperCase()} · SESSION {sessionIndex + 1}
      </Text>
      <Text style={styles.h1}>{session.name}</Text>
      <Text style={styles.sub}>{session.focus}</Text>

      {session.exercises.map((ex, exIdx) => (
        <ExerciseCard
          key={`${ex.name}-${exIdx}`}
          spec={ex}
          log={logs[exIdx]}
          onSetChange={(setIdx, field, value) =>
            updateSet(exIdx, setIdx, field, value)
          }
        />
      ))}

      <View style={styles.notesCard}>
        <Text style={styles.label}>SESSION NOTES (OPTIONAL)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="How did it feel? Any tweaks?"
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
  onSetChange,
}: {
  spec: ExerciseSpec;
  log: ExerciseLog | undefined;
  onSetChange: (setIdx: number, field: "reps" | "weight", value: string) => void;
}) {
  if (!log) return null;
  return (
    <View style={styles.exCard}>
      <Text style={styles.exName}>{spec.name}</Text>
      <Text style={styles.exTarget}>
        {spec.sets} × {spec.reps}
        {spec.rpe ? ` @ RPE ${spec.rpe}` : ""}
        {spec.rest_sec ? ` · ${spec.rest_sec}s rest` : ""}
      </Text>
      {spec.cue && <Text style={styles.exCue}>{spec.cue}</Text>}
      {spec.substitutes && spec.substitutes.length > 0 && (
        <Text style={styles.exSubs}>
          Substitutes: {spec.substitutes.join(", ")}
        </Text>
      )}

      <View style={styles.setHeader}>
        <Text style={[styles.setHeaderCell, { flex: 1 }]}>SET</Text>
        <Text style={[styles.setHeaderCell, { flex: 2 }]}>REPS</Text>
        <Text style={[styles.setHeaderCell, { flex: 2 }]}>WEIGHT (KG)</Text>
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
    </View>
  );
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
  exName: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
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
