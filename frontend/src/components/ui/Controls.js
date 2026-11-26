import { memo, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from './Icon';
import { nativeDriver, Pop, PressableScale, useReducedMotion } from './Motion';

function ChipBase({ label, selected = false, onPress, color, disabled = false, testID }) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.93}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={[
        styles.chip,
        {
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.tint : colors.card,
          borderColor: selected ? colors.tint : colors.separator,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {selected ? (
        <Icon name="check" size={13} color={colors.onTint} strokeWidth={3} />
      ) : color ? (
        <View style={[styles.dot, { backgroundColor: color }]} />
      ) : null}
      <Text style={[styles.chipLabel, { color: selected ? colors.onTint : colors.text }]}>{label}</Text>
    </PressableScale>
  );
}
export const Chip = memo(ChipBase);

export function ChipGroup({ children, label }) {
  return (
    <View style={styles.chipGroup} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {children}
    </View>
  );
}

/** Segmented control with a thumb that slides to the chosen option. options: [{ value, label, disabled? }]. */
export function SegmentedControl({ options, value, onChange, label }) {
  const { colors, radius } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const [position] = useState(() => new Animated.Value(index));
  const segment = width ? (width - 6) / options.length : 0;

  useEffect(() => {
    if (reduced) position.setValue(index);
    else Animated.spring(position, { toValue: index, useNativeDriver: nativeDriver, speed: 22, bounciness: 6 }).start();
  }, [index, position, reduced]);

  return (
    <View
      style={[styles.segment, { backgroundColor: colors.fill, borderRadius: radius.md }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {segment ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: segment,
              borderRadius: radius.md - 3,
              backgroundColor: colors.card,
              boxShadow: colors.shadow,
              transform: [{ translateX: Animated.multiply(position, segment) }],
            },
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            disabled={option.disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: option.disabled }}
            style={[styles.segmentItem, !segment && selected && { backgroundColor: colors.card, borderRadius: radius.md - 3 }, option.disabled && { opacity: 0.4 }]}
          >
            <Text style={[styles.segmentLabel, { color: selected ? colors.text : colors.textSecondary, fontWeight: selected ? '700' : '500' }]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onValueChange, disabled = false, color }) {
  const { colors } = useTheme();
  return (
    <View style={styles.toggleRow}>
      {color ? <View style={[styles.dot, styles.bigDot, { backgroundColor: color }]} /> : null}
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.success, false: colors.fillStrong }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

/** A round tick box that pops when ticked. */
export function TickBox({ checked, color, size = 24 }) {
  const { colors } = useTheme();
  const fill = color ?? colors.tint;
  return (
    <Pop trigger={checked}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderColor: checked ? fill : colors.fillStrong,
          backgroundColor: checked ? fill : 'transparent',
        }}
      >
        {checked ? <Icon name="check" size={size * 0.58} color="#fff" strokeWidth={3.2} /> : null}
      </View>
    </Pop>
  );
}

function CheckRowBase({ label, checked, onToggle, children, disabled = false, testID }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.checkRow, { backgroundColor: pressed ? colors.fill : 'transparent' }]}
    >
      <TickBox checked={checked} size={22} />
      {children}
      <Text style={[styles.flex, styles.rowLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}
export const CheckRow = memo(CheckRowBase);

/** − value + control for small numeric choices. */
export function Stepper({ label, valueLabel, onDecrement, onIncrement }) {
  const { colors, radius } = useTheme();
  const button = (text, onPress, a11y) => (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} scaleTo={0.85} style={[styles.stepperButton, { backgroundColor: colors.card, borderRadius: radius.sm - 3 }]}>
      <Text style={[styles.stepperText, { color: colors.tintInk }]}>{text}</Text>
    </PressableScale>
  );
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.flex, styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.stepper, { backgroundColor: colors.fill, borderRadius: radius.sm }]}>
        {button('−', onDecrement, `Less ${label}`)}
        <Text style={[styles.stepperValue, { color: colors.text }]}>{valueLabel}</Text>
        {button('+', onIncrement, `More ${label}`)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 34, borderWidth: 1 },
  chipLabel: { fontSize: 13.5, fontWeight: '600' },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bigDot: { width: 10, height: 10, borderRadius: 5 },
  segment: { flexDirection: 'row', padding: 3 },
  thumb: { position: 'absolute', top: 3, bottom: 3, left: 3 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 34, paddingHorizontal: 4 },
  segmentLabel: { fontSize: 13.5 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 14, minHeight: 50 },
  rowLabel: { fontSize: 15 },
  hint: { fontSize: 12.5, marginTop: 1, lineHeight: 17 },
  flex: { flex: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, minHeight: 46 },
  stepper: { flexDirection: 'row', alignItems: 'center', padding: 3, gap: 2 },
  stepperButton: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 19, fontWeight: '700', lineHeight: 22 },
  stepperValue: { fontSize: 15, fontWeight: '700', minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
