import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
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

export default function Chat() {
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
      setErr((e as Error).message || "Couldn't load history.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Scroll to bottom whenever messages change.
    if (messages.length > 0) {
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true })
      );
    }
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setErr("");
    // Optimistic user turn — will get its real id when server reflects it,
    // but that's fine because we don't reference id anywhere critical.
    const optimistic: Message = {
      id: Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setBusy(true);
    try {
      const res = await api<{ reply: string }>("/api/chat/send", {
        method: "POST",
        body: JSON.stringify({ content: text }),
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
      setErr((e as Error).message || "Coach couldn't respond. Try again.");
    }
    setBusy(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()}>
          <Wordmark size={20} />
        </Pressable>
        <Text style={styles.kicker}>COACH</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.transcript}
          contentContainerStyle={styles.transcriptContent}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
          ) : messages.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ask anything.</Text>
              <Text style={styles.emptyBody}>
                What&apos;s a good pre-workout meal? Is shawarma OK tonight?
                How do I train around a knee issue? I know your profile
                already — I&apos;ll factor it in.
              </Text>
            </View>
          ) : (
            messages.map((m) => <Bubble key={m.id} msg={m} />)
          )}
          {busy && (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <ActivityIndicator color={colors.gold} />
            </View>
          )}
          {!!err && <Text style={styles.err}>{err}</Text>}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask the coach…"
            placeholderTextColor={colors.dim}
            style={styles.input}
            multiline
            maxLength={2000}
            editable={!busy}
          />
          <Pressable
            onPress={send}
            disabled={!input.trim() || busy}
            style={[
              styles.sendBtn,
              (!input.trim() || busy) && styles.sendBtnDisabled,
            ]}
          >
            <Text style={styles.sendLabel}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <View
      style={[
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleAssistant,
      ]}
    >
      <Text style={isUser ? styles.userText : styles.assistantText}>
        {msg.content}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  transcript: { flex: 1 },
  transcriptContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  empty: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: font.displayBold,
    fontSize: 24,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
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
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sendBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendLabel: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.bg,
  },
  err: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 13,
    marginTop: spacing.sm,
  },
});
