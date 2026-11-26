import { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { dayOfMonth, longDate, monthYear, shortMonth, shortWeekday } from '../../utils/format';

const DayChip = memo(function DayChip({ day, selected, isToday, markers, onSelect }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={() => onSelect(day)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${longDate(day)}${markers?.exam ? ', test day' : ''}${markers?.over ? ', overloaded' : ''}`}
      style={[styles.chip, { borderRadius: radius.md, backgroundColor: selected ? colors.text : colors.card }]}
    >
      <Text style={[styles.weekday, { color: selected ? colors.background : isToday ? colors.danger : colors.textSecondary }]}>{shortWeekday(day)}</Text>
      <Text style={[styles.date, { color: selected ? colors.background : colors.text }]}>{dayOfMonth(day)}</Text>
      <Text style={[styles.month, { color: selected ? colors.background : colors.textSecondary }]}>{shortMonth(day)}</Text>
      <View style={styles.marks}>
        {markers?.exam ? <View style={[styles.mark, { backgroundColor: colors.danger }]} /> : null}
        {markers?.over ? <View style={[styles.mark, { backgroundColor: colors.warning }]} /> : null}
        {markers?.suggested ? <View style={[styles.mark, { backgroundColor: colors.tint }]} /> : null}
      </View>
    </Pressable>
  );
});

/** Horizontal strip of day chips under the month and year of the chosen day. `days` are date keys; `markers` maps key → { exam, over, suggested }. */
export function DayPicker({ days, value, onChange, today, markers = {} }) {
  const { colors } = useTheme();
  const renderItem = useCallback(
    ({ item }) => <DayChip day={item} selected={item === value} isToday={item === today} markers={markers[item]} onSelect={onChange} />,
    [markers, onChange, today, value],
  );
  const initialIndex = Math.max(0, days.indexOf(value));
  const shown = value ?? days[0];
  return (
    <View style={styles.wrap}>
      {shown ? <Text style={[styles.heading, { color: colors.text }]}>{monthYear(shown)}</Text> : null}
      <FlatList
        horizontal
        data={days}
        keyExtractor={(item) => item}
        renderItem={renderItem}
        extraData={value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        initialScrollIndex={initialIndex > 3 ? initialIndex - 2 : 0}
        getItemLayout={(_, index) => ({ length: 58, offset: 58 * index, index })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  heading: { fontSize: 15, fontWeight: '600' },
  list: { gap: 8, paddingVertical: 2 },
  chip: { width: 50, paddingVertical: 8, alignItems: 'center', gap: 2 },
  weekday: { fontSize: 12, fontWeight: '600' },
  date: { fontSize: 18, fontWeight: '700' },
  month: { fontSize: 11, fontWeight: '500' },
  marks: { flexDirection: 'row', gap: 3, height: 6 },
  mark: { width: 5, height: 5, borderRadius: 3 },
});
