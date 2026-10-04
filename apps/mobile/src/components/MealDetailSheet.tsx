import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
// StyleSheet.absoluteFillObject is used for the backdrop Pressable
// so it sits as a sibling under the sheet View, not as a parent
// wrapping it. The old parent-wrapping Pressable intercepted touch
// events before the ScrollView could claim them for scrolling —
// which is why the sheet rendered but refused to scroll down to
// the Delete button.
import { Ionicons } from "@expo/vector-icons";
import type { MealItemRow } from "@/types";
import * as haptics from "@/lib/haptics";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Bottom-sheet meal detail view. Renders the meal's photo (if any),
 * portion estimate, full macro breakdown (kcal + P/C/F + fiber/sugar/
 * sodium/sat-fat when present), source badge, and a Delete action.
 *
 * Delete is wrapped in a native confirm since it's irreversible.
 * The parent owns the DELETE fetch — we just call onDelete(id) after
 * the user confirms.
 */
export function MealDetailSheet({
  items,
  onClose,
  onDelete,
  isArabic,
}: {
  items: MealItemRow[] | null;
  onClose: () => void;
  onDelete: (ids: number[]) => Promise<void>;
  isArabic: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  // Guard against the open-and-close race: when the user taps the
  // meal row on Home, the modal mounts with a slide animation but
  // iOS still routes the touchEnd event from the originating tap to
  // whatever is now under the finger — which is this modal's
  // backdrop. The backdrop's onPress then fires onClose immediately
  // and the sheet appears to never open. 300ms ignore window lets
  // the slide-in finish before the backdrop becomes dismissive.
  const openedAt = useRef<number>(0);
  useEffect(() => {
    if (items && items.length > 0) openedAt.current = Date.now();
  }, [items]);
  const handleBackdropPress = () => {
    if (Date.now() - openedAt.current < 300) return;
    onClose();
  };

  const primary = items && items.length > 0 ? items[0]! : null;
  const multi = (items?.length ?? 0) > 1;

  const confirmDelete = () => {
    if (!items || items.length === 0) return;
    Alert.alert(
      multi
        ? isArabic
          ? `احذف الوجبة (${items.length} عناصر)؟`
          : `Delete this meal (${items.length} items)?`
        : isArabic
          ? "احذف الوجبة؟"
          : "Delete this meal?",
      isArabic
        ? "لا يمكن التراجع عن هذا الإجراء."
        : "This can't be undone.",
      [
        { text: isArabic ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isArabic ? "احذف" : "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete(items.map((it) => it.id));
              haptics.success();
              onClose();
            } catch (e) {
              haptics.errorHaptic();
              Alert.alert(
                isArabic ? "لم يتم الحذف" : "Delete failed",
                (e as Error).message
              );
            }
            setDeleting(false);
          },
        },
      ]
    );
  };

  const sourceLabel = (source: string): string => {
    switch (source) {
      case "plate_scan":
        return isArabic ? "مسح طبق" : "Plate scan";
      case "menu_scan":
        return isArabic ? "مسح قائمة" : "Menu scan";
      case "barcode":
        return isArabic ? "باركود" : "Barcode";
      case "manual":
      default:
        return isArabic ? "إدخال يدوي" : "Manual entry";
    }
  };

  // Summed macros across the whole group. For single-item taps this
  // is identical to the item's own numbers; for multi-item plate
  // scans it reflects the whole meal.
  const sumRange = (
    low: (it: MealItemRow) => number,
    high: (it: MealItemRow) => number
  ): { low: number; high: number } => {
    if (!items) return { low: 0, high: 0 };
    return items.reduce(
      (acc, it) => ({ low: acc.low + low(it), high: acc.high + high(it) }),
      { low: 0, high: 0 }
    );
  };
  const sumOpt = (
    low: (it: MealItemRow) => number | null | undefined,
    high: (it: MealItemRow) => number | null | undefined
  ): { low: number; high: number } | null => {
    if (!items || items.length === 0) return null;
    // Only emit a sum if at least one item has the field populated.
    const anyHas = items.some((it) => low(it) != null && high(it) != null);
    if (!anyHas) return null;
    return items.reduce(
      (acc, it) => ({
        low: acc.low + (low(it) ?? 0),
        high: acc.high + (high(it) ?? 0),
      }),
      { low: 0, high: 0 }
    );
  };

  const kcalSum = sumRange(
    (it) => it.kcal_low,
    (it) => it.kcal_high
  );
  const proteinSum = sumRange(
    (it) => it.protein_g_low,
    (it) => it.protein_g_high
  );
  const carbSum = sumRange(
    (it) => it.carb_g_low,
    (it) => it.carb_g_high
  );
  const fatSum = sumRange(
    (it) => it.fat_g_low,
    (it) => it.fat_g_high
  );
  const fiberSum = sumOpt(
    (it) => it.fiber_g_low,
    (it) => it.fiber_g_high
  );
  const sugarSum = sumOpt(
    (it) => it.sugar_g_low,
    (it) => it.sugar_g_high
  );
  const sodiumSum = sumOpt(
    (it) => it.sodium_mg_low,
    (it) => it.sodium_mg_high
  );
  const satFatSum = sumOpt(
    (it) => it.saturated_fat_g_low,
    (it) => it.saturated_fat_g_high
  );

  const midKcal = Math.round((kcalSum.low + kcalSum.high) / 2);
  const midProtein = Math.round((proteinSum.low + proteinSum.high) / 2);
  const midCarb = Math.round((carbSum.low + carbSum.high) / 2);
  const midFat = Math.round((fatSum.low + fatSum.high) / 2);
  const displayName = primary
    ? multi
      ? `${primary.name} + ${items!.length - 1} more`
      : primary.name
    : "";

  return (
    <Modal
      visible={!!primary}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Backdrop sits BENEATH the sheet so taps on the sheet
            don't bubble through to close, and the ScrollView
            inside the sheet owns its pan gestures cleanly. */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={handleBackdropPress}
        />
        <View style={styles.sheet}>
          {primary ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.grabber} />

              {primary.photo_url ? (
                <Image
                  source={{ uri: primary.photo_url }}
                  style={styles.hero}
                />
              ) : (
                <View style={[styles.hero, styles.heroPh]}>
                  <Ionicons name="restaurant" size={40} color={colors.dim} />
                </View>
              )}

              <Text style={styles.name}>{displayName}</Text>
              {!multi && primary.portion_estimate ? (
                <Text style={styles.portion}>{primary.portion_estimate}</Text>
              ) : null}
              {multi ? (
                <Text style={styles.portion}>
                  {isArabic
                    ? `مجموع ${items!.length} عناصر`
                    : `Combined across ${items!.length} items`}
                </Text>
              ) : null}

              <View style={styles.badges}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {sourceLabel(primary.source)}
                  </Text>
                </View>
                {primary.confidence ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {isArabic ? "دقة: " : "Confidence: "}
                      {primary.confidence}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.kcalBlock}>
                <Text style={styles.kcalValue}>{midKcal}</Text>
                <Text style={styles.kcalUnit}>kcal</Text>
                <Text style={styles.kcalRange}>
                  {kcalSum.low}–{kcalSum.high}
                </Text>
              </View>

              <View style={styles.macroRow}>
                <MacroPill
                  label={isArabic ? "بروتين" : "Protein"}
                  value={midProtein}
                  low={proteinSum.low}
                  high={proteinSum.high}
                  tint={colors.mint}
                />
                <MacroPill
                  label={isArabic ? "كارب" : "Carbs"}
                  value={midCarb}
                  low={carbSum.low}
                  high={carbSum.high}
                  tint={colors.gold}
                />
                <MacroPill
                  label={isArabic ? "دهون" : "Fat"}
                  value={midFat}
                  low={fatSum.low}
                  high={fatSum.high}
                  tint={colors.coral}
                />
              </View>

              {multi ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailHead}>
                    {(isArabic ? "عناصر" : "Items").toUpperCase()}
                  </Text>
                  {items!.map((it) => (
                    <View key={it.id} style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {it.name}
                      </Text>
                      <Text style={styles.itemKcal}>
                        {Math.round((it.kcal_low + it.kcal_high) / 2)} kcal
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {fiberSum || sugarSum || sodiumSum || satFatSum ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailHead}>
                    {isArabic ? "تفاصيل إضافية" : "More detail"}
                  </Text>
                  {fiberSum ? (
                    <DetailRow
                      label={isArabic ? "ألياف" : "Fiber"}
                      value={`${Math.round((fiberSum.low + fiberSum.high) / 2)}g`}
                    />
                  ) : null}
                  {sugarSum ? (
                    <DetailRow
                      label={isArabic ? "سكر" : "Sugar"}
                      value={`${Math.round((sugarSum.low + sugarSum.high) / 2)}g`}
                    />
                  ) : null}
                  {sodiumSum ? (
                    <DetailRow
                      label={isArabic ? "صوديوم" : "Sodium"}
                      value={`${Math.round((sodiumSum.low + sodiumSum.high) / 2)}mg`}
                    />
                  ) : null}
                  {satFatSum ? (
                    <DetailRow
                      label={isArabic ? "دهون مشبعة" : "Sat. fat"}
                      value={`${Math.round((satFatSum.low + satFatSum.high) / 2)}g`}
                    />
                  ) : null}
                </View>
              ) : null}

              <Pressable
                style={styles.deleteBtn}
                onPress={confirmDelete}
                disabled={deleting}
                accessibilityRole="button"
              >
                {deleting ? (
                  <ActivityIndicator color={colors.coral} />
                ) : (
                  <>
                    <Ionicons name="trash" size={16} color={colors.coral} />
                    <Text style={styles.deleteText}>
                      {multi
                        ? isArabic
                          ? `احذف الوجبة (${items!.length} عناصر)`
                          : `Delete this meal (${items!.length} items)`
                        : isArabic
                          ? "احذف هذه الوجبة"
                          : "Delete this meal"}
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function MacroPill({
  label,
  value,
  low,
  high,
  tint,
}: {
  label: string;
  value: number;
  low: number;
  high: number;
  tint: string;
}) {
  return (
    <View style={[styles.macroPill, { borderColor: tint + "44" }]}>
      <Text style={[styles.macroLabel, { color: tint }]}>{label}</Text>
      <Text style={styles.macroValue}>{value}g</Text>
      <Text style={styles.macroRange}>
        {Math.round(low)}–{Math.round(high)}
      </Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Container holds the backdrop (absolute, under) + the sheet
  // (flex child, bottom-aligned). This separation is what makes
  // the ScrollView inside the sheet scrollable — the old wrapping
  // Pressable captured pan gestures before ScrollView could.
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // Explicit height (not maxHeight) so the ScrollView inside has
    // something concrete to flex: 1 into. The earlier `maxHeight`
    // was just a cap — the sheet had no actual height, so a
    // flex-1 ScrollView collapsed to 0 and the user saw only the
    // dark backdrop.
    height: "88%",
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.sm,
  },
  hero: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: radius.md,
    backgroundColor: colors.panel2,
  },
  heroPh: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  name: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 22,
    marginTop: spacing.sm,
  },
  portion: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 13,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  badgeText: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  kcalBlock: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  kcalValue: {
    color: colors.gold,
    fontFamily: font.displayBold,
    fontSize: 36,
  },
  kcalUnit: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 13,
  },
  kcalRange: {
    marginLeft: "auto",
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 12,
  },
  macroRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  macroPill: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.panel,
    alignItems: "center",
    gap: 2,
  },
  macroLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  macroValue: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 18,
  },
  macroRange: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 10,
  },
  detailBlock: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  detailHead: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  detailLabel: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 13,
  },
  detailValue: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 13,
  },
  // Per-item rows inside the Items block for multi-item groups
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    gap: spacing.sm,
  },
  itemName: {
    flex: 1,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 13,
  },
  itemKcal: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 12,
  },
  deleteBtn: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.coral + "55",
    backgroundColor: colors.coral + "12",
  },
  deleteText: {
    color: colors.coral,
    fontFamily: font.bodyBold,
    fontSize: 14,
  },
});
