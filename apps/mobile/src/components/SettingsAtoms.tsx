import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Shared atoms for the Settings page and its sub-screens. Previously
 * each of these was defined inline in settings.tsx. Extracted so the
 * per-category sub-screens (/account, /subscription, /connections,
 * /notifications-settings, /legal, /follow-us) can share the visual
 * language without duplicating code or importing from settings.tsx
 * (which would create a brittle module graph).
 *
 * Atoms:
 *   Section    — panel group with mono-styled kicker
 *   Info       — read-only label + value row
 *   PrefRow    — label + hint + switch
 *   RowLink    — tappable row with chevron (internal) or open-icon (external)
 *   MenuRow    — top-level Settings menu entry with icon + label + chevron
 */

export function Section({
  title,
  tint,
  children,
}: {
  title: string;
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.sectionH, tint ? { color: tint } : null]}>
        {title.toUpperCase()}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function PrefRow({
  label,
  hint,
  value,
  onChange,
  last,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View
      style={[styles.row, last && { borderBottomWidth: 0 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.gold, false: colors.line }}
        thumbColor={colors.ink}
      />
    </View>
  );
}

export function RowLink({
  label,
  value,
  onPress,
  external,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  external?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole={external ? "link" : "button"}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={external ? "Opens in your browser" : undefined}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        <Ionicons
          name={external ? "open-outline" : "chevron-forward"}
          size={16}
          color={colors.dim}
        />
      </View>
    </Pressable>
  );
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * Top-level Settings menu row. Used only on the main Settings screen
 * to navigate into a category sub-screen. Icon-forward layout + larger
 * row height to signal "this is a destination, not a toggle."
 */
export function MenuRow({
  icon,
  label,
  value,
  onPress,
  tint,
  last,
}: {
  icon: IoniconName;
  label: string;
  value?: string;
  onPress: () => void;
  tint?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.menuRow, last && { borderBottomWidth: 0 }]}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      <View style={styles.menuIcon}>
        <Ionicons
          name={icon}
          size={18}
          color={tint ?? colors.gold}
        />
      </View>
      <Text style={[styles.menuLabel, tint ? { color: tint } : null]}>
        {label}
      </Text>
      <View style={{ flex: 1 }} />
      {value && <Text style={styles.menuValue}>{value}</Text>}
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.dim}
        style={{ marginLeft: 6 }}
      />
    </Pressable>
  );
}

export const settingsStyles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  title: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionH: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  menuGroup: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
});

const styles = StyleSheet.create({
  sectionH: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  rowValue: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  menuIcon: {
    width: 32,
    alignItems: "flex-start",
  },
  menuLabel: {
    fontFamily: font.body,
    fontSize: 16,
    color: colors.ink,
  },
  menuValue: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 0.4,
  },
});
