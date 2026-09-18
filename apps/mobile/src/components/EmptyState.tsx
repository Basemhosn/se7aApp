import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Btn } from "./Btn";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * SE7A shared empty-state card. Consistent pattern across the app:
 * icon → headline → one-line body → optional primary CTA.
 *
 * Modeled after the meal-plan reference implementation (the "gold
 * standard" per the 2026-09-19 empty-states audit). Keeping this
 * component narrow so screens with special empty needs (e.g. Progress
 * body tab with inline form) don't feel forced into it.
 */
export function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
  ctaLoading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
  ctaLoading?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={40} color={colors.gold} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {ctaLabel && onCta ? (
        <>
          <View style={{ height: spacing.md }} />
          <Btn label={ctaLabel} onPress={onCta} loading={ctaLoading} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(246,183,60,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  body: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
    textAlign: "center",
  },
});
