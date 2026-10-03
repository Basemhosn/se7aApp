import { useState } from "react";
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
  item,
  onClose,
  onDelete,
  isArabic,
}: {
  item: MealItemRow | null;
  onClose: () => void;
  onDelete: (id: number) => Promise<void>;
  isArabic: boolean;
}) {
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = () => {
    if (!item) return;
    Alert.alert(
      isArabic ? "احذف الوجبة؟" : "Delete this meal?",
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
              await onDelete(item.id);
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

  const midKcal = item ? Math.round((item.kcal_low + item.kcal_high) / 2) : 0;
  const midProtein = item
    ? Math.round((item.protein_g_low + item.protein_g_high) / 2)
    : 0;
  const midCarb = item
    ? Math.round((item.carb_g_low + item.carb_g_high) / 2)
    : 0;
  const midFat = item
    ? Math.round((item.fat_g_low + item.fat_g_high) / 2)
    : 0;

  return (
    <Modal
      visible={!!item}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {item ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.grabber} />

              {item.photo_url ? (
                <Image source={{ uri: item.photo_url }} style={styles.hero} />
              ) : (
                <View style={[styles.hero, styles.heroPh]}>
                  <Ionicons
                    name="restaurant"
                    size={40}
                    color={colors.dim}
                  />
                </View>
              )}

              <Text style={styles.name}>{item.name}</Text>
              {item.portion_estimate ? (
                <Text style={styles.portion}>{item.portion_estimate}</Text>
              ) : null}

              <View style={styles.badges}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{sourceLabel(item.source)}</Text>
                </View>
                {item.confidence ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {isArabic ? "دقة: " : "Confidence: "}
                      {item.confidence}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.kcalBlock}>
                <Text style={styles.kcalValue}>{midKcal}</Text>
                <Text style={styles.kcalUnit}>kcal</Text>
                <Text style={styles.kcalRange}>
                  {item.kcal_low}–{item.kcal_high}
                </Text>
              </View>

              <View style={styles.macroRow}>
                <MacroPill
                  label={isArabic ? "بروتين" : "Protein"}
                  value={midProtein}
                  low={item.protein_g_low}
                  high={item.protein_g_high}
                  tint={colors.mint}
                />
                <MacroPill
                  label={isArabic ? "كارب" : "Carbs"}
                  value={midCarb}
                  low={item.carb_g_low}
                  high={item.carb_g_high}
                  tint={colors.gold}
                />
                <MacroPill
                  label={isArabic ? "دهون" : "Fat"}
                  value={midFat}
                  low={item.fat_g_low}
                  high={item.fat_g_high}
                  tint={colors.coral}
                />
              </View>

              {item.fiber_g_low != null ||
              item.sugar_g_low != null ||
              item.sodium_mg_low != null ||
              item.saturated_fat_g_low != null ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailHead}>
                    {isArabic ? "تفاصيل إضافية" : "More detail"}
                  </Text>
                  {item.fiber_g_low != null && item.fiber_g_high != null ? (
                    <DetailRow
                      label={isArabic ? "ألياف" : "Fiber"}
                      value={`${Math.round((item.fiber_g_low + item.fiber_g_high) / 2)}g`}
                    />
                  ) : null}
                  {item.sugar_g_low != null && item.sugar_g_high != null ? (
                    <DetailRow
                      label={isArabic ? "سكر" : "Sugar"}
                      value={`${Math.round((item.sugar_g_low + item.sugar_g_high) / 2)}g`}
                    />
                  ) : null}
                  {item.sodium_mg_low != null &&
                  item.sodium_mg_high != null ? (
                    <DetailRow
                      label={isArabic ? "صوديوم" : "Sodium"}
                      value={`${Math.round((item.sodium_mg_low + item.sodium_mg_high) / 2)}mg`}
                    />
                  ) : null}
                  {item.saturated_fat_g_low != null &&
                  item.saturated_fat_g_high != null ? (
                    <DetailRow
                      label={isArabic ? "دهون مشبعة" : "Sat. fat"}
                      value={`${Math.round((item.saturated_fat_g_low + item.saturated_fat_g_high) / 2)}g`}
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
                      {isArabic ? "احذف هذه الوجبة" : "Delete this meal"}
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          ) : null}
        </Pressable>
      </Pressable>
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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "88%",
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
