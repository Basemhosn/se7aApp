import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Onboarding visual system (2026-09-02).
 *
 * One-question-per-screen layout used across all onboarding steps.
 * Everything you see comes from three pieces:
 *   • OnboardingShell — page frame with progress bar + back + big
 *     centered content slot + anchored primary button
 *   • SelectCard — the icon + label + radio row for single-select
 *     answers; renders selected state via border + filled radio
 *   • MultiSelectCard — same visual language but for multi-select
 *
 * SE7A brand: dark warm palette + gold accent for selection state.
 */

// ── Shell ───────────────────────────────────────────────────────────

export function OnboardingShell({
  progress,
  onBack,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  secondaryLabel,
  onSecondary,
}: {
  /** 0..1 — fraction of the flow complete */
  progress: number;
  onBack?: () => void;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <SafeAreaView style={styles.shell} edges={["top", "bottom"]}>
      <View style={styles.headerRow}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(0, Math.min(1, progress)) * 100}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.body}>{children}</View>

      <View style={styles.footer}>
        <Pressable
          onPress={onPrimary}
          disabled={primaryDisabled || primaryLoading}
          style={[
            styles.primaryBtn,
            (primaryDisabled || primaryLoading) && styles.primaryBtnDisabled,
          ]}
        >
          {primaryLoading ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.primaryBtnLabel}>{primaryLabel}</Text>
          )}
        </Pressable>
        {secondaryLabel && onSecondary ? (
          <Pressable onPress={onSecondary} hitSlop={8} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnLabel}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// ── Question head (title + subtitle) ────────────────────────────────

export function QuestionHead({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.qHead}>
      <Text style={styles.qTitle}>{title}</Text>
      {subtitle ? <Text style={styles.qSub}>{subtitle}</Text> : null}
    </View>
  );
}

// ── Select cards ────────────────────────────────────────────────────

export function SelectCard({
  icon,
  label,
  sublabel,
  selected,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
    >
      {icon ? (
        <View style={[styles.cardIcon, selected && styles.cardIconSelected]}>
          <Ionicons
            name={icon}
            size={18}
            color={selected ? colors.gold : colors.dim}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={styles.cardSublabel}>{sublabel}</Text>
        ) : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? (
          <View style={styles.radioDot} />
        ) : null}
      </View>
    </Pressable>
  );
}

export function MultiSelectCard({
  icon,
  label,
  sublabel,
  selected,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
    >
      {icon ? (
        <View style={[styles.cardIcon, selected && styles.cardIconSelected]}>
          <Ionicons
            name={icon}
            size={18}
            color={selected ? colors.gold : colors.dim}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={styles.cardSublabel}>{sublabel}</Text>
        ) : null}
      </View>
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected ? (
          <Ionicons name="checkmark" size={14} color={colors.bg} />
        ) : null}
      </View>
    </Pressable>
  );
}

// ── Unit toggle (metric ↔ imperial) ─────────────────────────────────

export function UnitToggle<TUnit extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: TUnit; label: string }[];
  value: TUnit;
  onChange: (v: TUnit) => void;
}) {
  return (
    <View style={styles.unitToggle}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.unitBtn, active && styles.unitBtnActive]}
          >
            <Text
              style={[styles.unitLabel, active && styles.unitLabelActive]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Wheel picker (iOS UIPickerView native wrap) ────────────────────
//
// Wrapper around @react-native-picker/picker which on iOS renders as
// the native UIPickerView 3-D wheel — the exact iOS Settings look.
// Compose multiple side-by-side for multi-column pickers (birthdate
// month/day/year, height ft/in).

export function Wheel({
  values,
  selected,
  onChange,
  width = 90,
  formatLabel,
}: {
  values: number[];
  selected: number;
  onChange: (v: number) => void;
  width?: number;
  formatLabel?: (v: number) => string;
}) {
  return (
    <View style={{ width }}>
      <Picker
        selectedValue={selected}
        onValueChange={(v) => onChange(Number(v))}
        itemStyle={styles.wheelItem}
      >
        {values.map((v) => (
          <Picker.Item
            key={v}
            label={formatLabel ? formatLabel(v) : String(v)}
            value={v}
            color={colors.ink}
          />
        ))}
      </Picker>
    </View>
  );
}

// ── Ruler scrubber (weight entry) ──────────────────────────────────
//
// Horizontal scrollable ruler with tick marks. Center of the visible
// area = currently-selected value, shown big above the ruler. Common
// in health apps (Apple Health, Withings, Cronometer). Snaps to
// nearest tick as the user releases the drag.
//
// Uses FlatList virtualization so we only ever render ~30 visible
// ticks even if the range has 1700+ steps — critical for smooth
// scroll on iOS. The big value readout updates continuously during
// drag via an Animated scroll listener + imperative TextInput setter
// so there are zero React re-renders during scroll.

const TICK_WIDTH = 8;
const MAJOR_EVERY = 5;

interface TickItemProps {
  isMajor: boolean;
}
const TickItem = ({ isMajor }: TickItemProps) => (
  <View
    style={[
      styles.rulerTick,
      { width: TICK_WIDTH, height: isMajor ? 26 : 14 },
    ]}
  />
);

export function RulerScrubber({
  min,
  max,
  step = 0.1,
  value,
  onChange,
  unit,
  label,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  label: string;
}) {
  const tickCount = Math.round((max - min) / step) + 1;
  const ticks = useMemo(() => {
    // Just an index array — actual value derived from position.
    const arr = new Array(tickCount);
    for (let i = 0; i < tickCount; i++) arr[i] = i;
    return arr;
  }, [tickCount]);
  const screenW = Dimensions.get("window").width;
  const sidePad = screenW / 2;
  const listRef = useRef<FlatList<number> | null>(null);
  const suppress = useRef(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState<string>(value.toFixed(1));
  const lastEmitted = useRef(value);

  // Sync scroll position when value changes externally (e.g. unit toggle
  // fed us a converted value). Not during our own drag.
  useEffect(() => {
    const idx = Math.round((value - min) / step);
    const x = idx * TICK_WIDTH;
    suppress.current = true;
    listRef.current?.scrollToOffset({ offset: x, animated: false });
    setDisplay(value.toFixed(1));
    const t = setTimeout(() => {
      suppress.current = false;
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Live-update the big number as the user drags. State update is
  // cheap (single string), but we throttle further via requestAnim
  // to avoid unnecessary renders on high-Hz devices.
  useEffect(() => {
    let raf = 0;
    let pending: string | null = null;
    const id = scrollX.addListener(({ value: x }) => {
      const idx = Math.max(0, Math.min(tickCount - 1, Math.round(x / TICK_WIDTH)));
      const next = min + idx * step;
      const rounded = Math.round(next * 10) / 10;
      const s = rounded.toFixed(1);
      pending = s;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (pending !== null) setDisplay(pending);
        });
      }
    });
    return () => {
      scrollX.removeListener(id);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [min, step, tickCount, scrollX]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (suppress.current) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.max(0, Math.min(tickCount - 1, Math.round(x / TICK_WIDTH)));
    const next = min + idx * step;
    const rounded = Math.round(next * 10) / 10;
    if (rounded !== lastEmitted.current) {
      lastEmitted.current = rounded;
      onChange(rounded);
    }
  };

  const getItemLayout = (_: unknown, index: number) => ({
    length: TICK_WIDTH,
    offset: TICK_WIDTH * index,
    index,
  });

  return (
    <View style={styles.rulerWrap}>
      <Text style={styles.rulerLabel}>{label}</Text>
      <View style={styles.rulerBigRow}>
        <Text style={styles.rulerBigValue}>{display}</Text>
        <Text style={styles.rulerBigUnit}>{unit}</Text>
      </View>
      <View style={styles.rulerTrackWrap}>
        <Animated.FlatList
          ref={listRef as never}
          data={ticks}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={TICK_WIDTH}
          decelerationRate="fast"
          scrollEventThrottle={16}
          getItemLayout={getItemLayout}
          keyExtractor={(i) => String(i)}
          initialNumToRender={80}
          maxToRenderPerBatch={40}
          windowSize={5}
          removeClippedSubviews
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={onScrollEnd}
          contentContainerStyle={{
            paddingHorizontal: sidePad,
            alignItems: "flex-end",
          }}
          renderItem={({ index }) => (
            <TickItem isMajor={index % MAJOR_EVERY === 0} />
          )}
        />
        <View pointerEvents="none" style={styles.rulerCenterMark} />
      </View>
    </View>
  );
}

// ── Number stepper (kg/cm/days entry) ───────────────────────────────

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <View style={styles.stepperRow}>
      <Pressable onPress={dec} style={styles.stepBtn} hitSlop={8}>
        <Ionicons name="remove" size={22} color={colors.gold} />
      </Pressable>
      <View style={styles.stepValueWrap}>
        <Text style={styles.stepValue}>{value}</Text>
        {unit ? <Text style={styles.stepUnit}>{unit}</Text> : null}
      </View>
      <Pressable onPress={inc} style={styles.stepBtn} hitSlop={8}>
        <Ionicons name="add" size={22} color={colors.gold} />
      </Pressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gold,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: {
    backgroundColor: colors.panel2,
  },
  primaryBtnLabel: {
    fontFamily: font.bodyBold,
    fontSize: 15,
    color: colors.bg,
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  secondaryBtnLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.2,
  },

  qHead: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  qTitle: {
    fontFamily: font.displayBold,
    fontSize: 30,
    color: colors.ink,
    lineHeight: 34,
  },
  qSub: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.dim,
    lineHeight: 21,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
  },
  cardSelected: {
    borderColor: colors.gold,
    borderWidth: 2,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
  },
  cardIconSelected: {
    backgroundColor: colors.goldDim,
  },
  cardLabel: {
    fontFamily: font.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  cardLabelSelected: {
    color: colors.ink,
  },
  cardSublabel: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
    lineHeight: 17,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.gold,
    backgroundColor: colors.gold,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    borderColor: colors.gold,
    backgroundColor: colors.gold,
  },

  // Unit toggle
  unitToggle: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: colors.panel2,
    borderRadius: 24,
    padding: 3,
    marginBottom: spacing.md,
  },
  unitBtn: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 22,
  },
  unitBtnActive: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  unitLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
  },
  unitLabelActive: {
    color: colors.ink,
    fontFamily: font.bodyBold,
  },

  // Wheel picker
  wheelItem: {
    fontFamily: font.body,
    fontSize: 22,
    color: colors.ink,
    height: 160,
  },

  // Ruler scrubber (weight)
  rulerWrap: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  rulerLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    marginBottom: 4,
  },
  rulerBigRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    marginBottom: spacing.md,
  },
  rulerBigValue: {
    fontFamily: font.displayBold,
    fontSize: 44,
    color: colors.ink,
    lineHeight: 48,
  },
  rulerBigUnit: {
    fontFamily: font.mono,
    fontSize: 14,
    color: colors.dim,
    marginBottom: 8,
  },
  rulerTrackWrap: {
    height: 60,
    justifyContent: "center",
    width: "100%",
  },
  rulerTick: {
    marginHorizontal: 0,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    alignSelf: "flex-end",
  },
  rulerCenterMark: {
    position: "absolute",
    left: "50%",
    marginLeft: -1,
    width: 2,
    height: 40,
    backgroundColor: colors.gold,
    top: 10,
  },

  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panel,
  },
  stepValueWrap: {
    minWidth: 140,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  stepValue: {
    fontFamily: font.displayBold,
    fontSize: 56,
    color: colors.ink,
    lineHeight: 62,
  },
  stepUnit: {
    fontFamily: font.mono,
    fontSize: 14,
    color: colors.dim,
    letterSpacing: 1.2,
  },
});
