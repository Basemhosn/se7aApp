import { StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { colors, font, radius, spacing } from "@/lib/theme";

export function Card({
  kicker,
  title,
  children,
  tone = "default",
  style,
}: {
  kicker?: string;
  title?: string;
  children?: ReactNode;
  tone?: "default" | "soft" | "ok" | "warn" | "info";
  style?: object;
}) {
  return (
    <View
      style={[
        styles.card,
        tone === "soft" && { backgroundColor: colors.panel2 },
        style,
      ]}
    >
      {kicker && (
        <Text style={[styles.kicker, tonalKickerColor(tone)]}>{kicker}</Text>
      )}
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
}

function tonalKickerColor(tone: "default" | "soft" | "ok" | "warn" | "info") {
  if (tone === "ok") return { color: colors.mint };
  if (tone === "warn") return { color: colors.coral };
  if (tone === "info") return { color: colors.gold };
  return { color: colors.gold };
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
  },
});
