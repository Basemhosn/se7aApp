import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api, ProRequiredError } from "@/lib/api";
import { Btn } from "@/components/Btn";
import { useEntitlement } from "@/lib/EntitlementContext";
import { colors, font, radius, spacing } from "@/lib/theme";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface HistoryResponse {
  messages: Message[];
}

interface Suggestion {
  icon: keyof typeof Ionicons.glyphMap;
  en: string;
  ar: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: "restaurant-outline",
    en: "What should I eat right now?",
    ar: "شنو آكل هالحين؟",
  },
  {
    icon: "trending-up-outline",
    en: "How's my week going?",
    ar: "كيف أسبوعي؟",
  },
  {
    icon: "fitness-outline",
    en: "How do I hit my next PR?",
    ar: "كيف أكسر الPR القادم؟",
  },
  {
    icon: "flame-outline",
    en: "Am I eating enough protein?",
    ar: "أكل بروتين كافي؟",
  },
];

export default function Coach() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const { ent, loading: entLoading } = useEntitlement();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<HistoryResponse>("/api/chat/history?limit=50");
      setMessages(res.messages);
    } catch (e) {
      setErr((e as Error).message || t("coach.error_load"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true })
      );
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    setInput("");
    setErr("");
    const optimistic: Message = {
      id: Date.now(),
      role: "user",
      content: clean,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setBusy(true);
    try {
      const res = await api<{ reply: string }>("/api/chat/send", {
        method: "POST",
        body: JSON.stringify({ content: clean }),
      });
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: res.reply,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      if (e instanceof ProRequiredError) {
        router.push({ pathname: "/paywall", params: { feature: "ai_coach" } });
      } else {
        setErr((e as Error).message || t("coach.error_send"));
      }
    }
    setBusy(false);
  };

  if (!entLoading && !ent.is_pro) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.head}>
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={20} color={colors.gold} />
          </View>
          <View>
            <Text style={styles.title}>SE7A Coach</Text>
            <Text style={styles.sub}>{t("coach.sub")}</Text>
          </View>
        </View>
        <View style={styles.gate}>
          <Text style={styles.gateKicker}>PRO</Text>
          <Text style={styles.gateH}>
            {isArabic ? "الكوتش على Pro" : "Coach is a Pro feature"}
          </Text>
          <Text style={styles.gateBody}>
            {isArabic
              ? "دردشة مع كوتش يعرف سجلك، أهدافك، وPR اللي كسرتها هالأسبوع."
              : "Chat with an AI dietitian that knows your logs, goals, and the PRs you broke this week."}
          </Text>
          <View style={{ height: spacing.md }} />
          <Btn
            label={isArabic ? "افتح Pro" : "Unlock Pro"}
            onPress={() =>
              router.push({
                pathname: "/paywall",
                params: { feature: "ai_coach" },
              })
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  const canSend = !!input.trim() && !busy;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text style={styles.avatarMark}>C</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>SE7A Coach</Text>
          <Text style={styles.sub}>
            {busy
              ? isArabic
                ? "يفكر…"
                : "Thinking…"
              : isArabic
                ? "كوتشك الشخصي"
                : "Your AI dietitian"}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.transcript}
          contentContainerStyle={styles.transcriptContent}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={{ marginTop: spacing.xl, alignItems: "center" }}>
              <TypingDots />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyKicker}>COACH</Text>
              <View style={styles.emptyRule} />
              <Text style={styles.emptyTitle}>
                {isArabic ? "أهلاً — أنا كوتشك." : "Hey — I'm your coach."}
              </Text>
              <Text style={styles.emptyBody}>
                {isArabic
                  ? "اسألني عن الأكل، التمرين، أو تقدمك. أعرف سجلك."
                  : "Ask about your food, workouts, or progress. I've got your logs."}
              </Text>
              <View style={styles.suggestGrid}>
                {SUGGESTIONS.map((s) => {
                  const text = isArabic ? s.ar : s.en;
                  return (
                    <Pressable
                      key={s.en}
                      onPress={() => sendMessage(text)}
                      style={styles.suggestChip}
                    >
                      <Ionicons name={s.icon} size={14} color={colors.gold} />
                      <Text style={styles.suggestText}>{text}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              const groupWithPrev = prev && prev.role === m.role;
              return <Bubble key={m.id} msg={m} groupWithPrev={groupWithPrev} />;
            })
          )}
          {busy && (
            <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
              <TypingDots />
            </View>
          )}
          {!!err && <Text style={styles.err}>{err}</Text>}
        </ScrollView>

        <View style={styles.inputBar}>
          <View style={[styles.inputPill, busy && { opacity: 0.6 }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={
                isArabic ? "اكتب رسالتك…" : "Message SE7A Coach…"
              }
              placeholderTextColor={colors.dim}
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!busy}
            />
            <Pressable
              onPress={() => sendMessage(input)}
              disabled={!canSend}
              style={[
                styles.sendBtn,
                !canSend && styles.sendBtnDisabled,
              ]}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={canSend ? colors.bg : colors.dim}
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({
  msg,
  groupWithPrev,
}: {
  msg: Message;
  groupWithPrev?: boolean;
}) {
  const isUser = msg.role === "user";
  return (
    <View
      style={[
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleAssistant,
        groupWithPrev && { marginTop: 2 },
        // Sharpen the tail-side corner when it's the first of a group.
        !groupWithPrev &&
          (isUser
            ? { borderBottomRightRadius: 4 }
            : { borderBottomLeftRadius: 4 }),
      ]}
    >
      <Text style={isUser ? styles.userText : styles.assistantText}>
        {msg.content}
      </Text>
    </View>
  );
}

function TypingDots() {
  const [a] = useState(new Animated.Value(0));
  const [b] = useState(new Animated.Value(0));
  const [c] = useState(new Animated.Value(0));

  useEffect(() => {
    const cycle = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 320,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 320,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
    const A = cycle(a, 0);
    const B = cycle(b, 150);
    const C = cycle(c, 300);
    A.start();
    B.start();
    C.start();
    return () => {
      A.stop();
      B.stop();
      C.stop();
    };
  }, [a, b, c]);

  const dotStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      {
        translateY: v.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -3],
        }),
      },
    ],
  });

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, dotStyle(a)]} />
      <Animated.View style={[styles.dot, dotStyle(b)]} />
      <Animated.View style={[styles.dot, dotStyle(c)]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  head: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMark: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.gold,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 1,
    letterSpacing: 0.5,
  },
  gate: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.xs,
    justifyContent: "center",
  },
  gateKicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  gateH: {
    fontFamily: font.displayBold,
    fontSize: 28,
    color: colors.ink,
  },
  gateBody: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.dim,
    lineHeight: 22,
    marginTop: 4,
  },
  transcript: { flex: 1 },
  transcriptContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  empty: {
    marginTop: spacing.xl,
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  emptyKicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.8,
  },
  emptyRule: {
    width: 40,
    height: 1,
    backgroundColor: colors.gold,
    marginVertical: spacing.md,
  },
  emptyTitle: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  suggestGrid: {
    marginTop: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  suggestText: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
  },
  bubble: {
    padding: spacing.md,
    borderRadius: radius.lg,
    maxWidth: "88%",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: colors.gold,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  userText: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.bg,
    lineHeight: 22,
  },
  assistantText: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.gold,
  },
  inputBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  inputPill: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 26,
    paddingLeft: spacing.md,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    minHeight: 32,
    maxHeight: 120,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.line,
  },
  err: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 13,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
