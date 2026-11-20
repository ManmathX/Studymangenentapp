import { memo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from './Icon';

function ChipBase({ label, selected = false, onPress, color, disabled = false, testID }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        { borderRadius: radius.pill, backgroundColor: selected ? colors.text : colors.card, borderColor: colors.separator, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipLabel, { color: selected ? colors.background : colors.text }]}>{label}</Text>
    </Pressable>
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

/** iOS-style segmented control. options: [{ value, label, disabled? }]. */
export function SegmentedControl({ options, value, onChange, label }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: colors.fill, borderRadius: radius.sm }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            disabled={option.disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: option.disabled }}
            style={[styles.segmentItem, { borderRadius: radius.sm - 2 }, selected && { backgroundColor: colors.card }, option.disabled && { opacity: 0.4 }]}
          >
            <Text style={[styles.segmentLabel, { color: colors.text, fontWeight: selected ? '600' : '400' }]} numberOfLines={1}>
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
        <Text style={{ color: colors.text, fontSize: 16 }}>{label}</Text>
        {hint ? <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} accessibilityLabel={label} trackColor={{ true: colors.success }} />
    </View>
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
      style={({ pressed }) => [styles.checkRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.box, { borderColor: checked ? colors.tint : colors.fillStrong, backgroundColor: checked ? colors.tint : 'transparent' }]}>
        {checked ? <Icon name="check" size={14} color={colors.onTint} strokeWidth={3} /> : null}
      </View>
      {children}
      <Text style={[styles.flex, { color: colors.text, fontSize: 16 }]}>{label}</Text>
    </Pressable>
  );
}
export const CheckRow = memo(CheckRowBase);

/** − value + control for small numeric choices. */
export function Stepper({ label, valueLabel, onDecrement, onIncrement }) {
  const { colors, radius } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.flex, { color: colors.text, fontSize: 16 }]}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 16, minWidth: 54, textAlign: 'right' }}>{valueLabel}</Text>
      <View style={[styles.stepper, { backgroundColor: colors.fill, borderRadius: radius.sm }]}>
        <Pressable onPress={onDecrement} accessibilityRole="button" accessibilityLabel={`Less ${label}`} style={styles.stepperButton}>
          <Text style={[styles.stepperText, { color: colors.text }]}>−</Text>
        </Pressable>
        <Pressable onPress={onIncrement} accessibilityRole="button" accessibilityLabel={`More ${label}`} style={styles.stepperButton}>
          <Text style={[styles.stepperText, { color: colors.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 34, borderWidth: StyleSheet.hairlineWidth },
  chipLabel: { fontSize: 14, fontWeight: '500' },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bigDot: { width: 10, height: 10, borderRadius: 5 },
  segment: { flexDirection: 'row', padding: 2 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 32, paddingHorizontal: 4 },
  segmentLabel: { fontSize: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, minHeight: 50 },
  flex: { flex: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 16, minHeight: 46 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row' },
  stepperButton: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 20, fontWeight: '500' },
});
