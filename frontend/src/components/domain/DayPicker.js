import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { dayOfMonth, longDate, monthYear, shortMonth, shortWeekday } from '../../utils/format';
import { PressableScale } from '../ui/Motion';

const CHIP_WIDTH = 50;
const CHIP_GAP = 7;

const DayChip = memo(function DayChip({ day, selected, isToday, markers, onSelect }) {
  const { colors, radius } = useTheme();
  const exam = Boolean(markers?.exam);
  const fg = selected ? colors.onTint : exam ? colors.danger : colors.text;
  return (
    <PressableScale
      onPress={() => onSelect(day)}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${longDate(day)}${markers?.exam ? ', test day' : ''}${markers?.over ? ', overloaded' : ''}`}
      style={[
        styles.chip,
        {
          borderRadius: radius.md,
          backgroundColor: selected ? colors.tint : exam ? colors.dangerSoft : colors.card,
          borderColor: exam ? colors.danger : selected ? colors.tint : isToday ? `${colors.tint}66` : colors.separator,
        },
        exam && { borderWidth: 2 },
        selected && { boxShadow: `0px 4px 10px ${colors.tint}44` },
      ]}
    >
      <Text style={[styles.weekday, { color: selected ? colors.onTint : isToday ? colors.tint : colors.textSecondary }]}>{isToday ? 'Today' : shortWeekday(day)}</Text>
      <Text style={[styles.date, { color: fg }]}>{dayOfMonth(day)}</Text>
      {exam ? (
        <View style={[styles.testTag, { backgroundColor: selected ? colors.onTint : colors.danger }]}>
          <Text style={[styles.testText, { color: selected ? colors.danger : '#fff' }]}>TEST</Text>
        </View>
      ) : (
        <Text style={[styles.month, { color: selected ? colors.onTint : colors.textTertiary }]}>{shortMonth(day)}</Text>
      )}
      <View style={styles.marks}>
        {markers?.over ? <View style={[styles.mark, { backgroundColor: colors.warning }]} /> : null}
        {markers?.suggested ? <View style={[styles.mark, { backgroundColor: selected ? '#fff' : colors.tint }]} /> : null}
      </View>
    </PressableScale>
  );
});

function LegendItem({ color, label, square }) {
  const { colors } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.mark, { backgroundColor: color }, square && { borderRadius: 2 }]} />
      <Text style={[styles.legendText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

/**
 * Horizontal strip of day chips under the month and year of the chosen day. `days` are date keys;
 * `markers` maps key → { exam, over, suggested }. `legend` explains the coloured dots.
 */
export function DayPicker({ days, value, onChange, today, markers = {}, legend = false }) {
  const { colors } = useTheme();
  const renderItem = useCallback(
    ({ item }) => <DayChip day={item} selected={item === value} isToday={item === today} markers={markers[item]} onSelect={onChange} />,
    [markers, onChange, today, value],
  );
  const initialIndex = Math.max(0, days.indexOf(value));
  const shown = value ?? days[0];
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {shown ? <Text style={[styles.heading, { color: colors.text }]}>{monthYear(shown)}</Text> : null}
        {legend ? (
          <View style={styles.legend}>
            <LegendItem color={colors.danger} label="Test" square />
            <LegendItem color={colors.warning} label="Too busy" />
            <LegendItem color={colors.tint} label="Suggested" />
          </View>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={days}
        keyExtractor={(item) => item}
        renderItem={renderItem}
        extraData={value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        initialScrollIndex={initialIndex > 3 ? initialIndex - 2 : 0}
        getItemLayout={(_, index) => ({ length: CHIP_WIDTH + CHIP_GAP, offset: (CHIP_WIDTH + CHIP_GAP) * index, index })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingHorizontal: 2 },
  heading: { fontSize: 14.5, fontWeight: '800' },
  legend: { flexDirection: 'row', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 11.5, fontWeight: '600' },
  list: { gap: CHIP_GAP, paddingVertical: 4, paddingHorizontal: 1 },
  chip: { width: CHIP_WIDTH, paddingVertical: 7, alignItems: 'center', gap: 1, borderWidth: 1 },
  weekday: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 18, fontWeight: '800' },
  month: { fontSize: 10.5, fontWeight: '600' },
  marks: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  mark: { width: 6, height: 6, borderRadius: 3 },
  testTag: { borderRadius: 4, paddingHorizontal: 4, marginTop: 1 },
  testText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
});
