import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, dayOfMonth, longDate, monthYear, weekdayOf } from '../../utils/format';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/Motion';
import { Hatch } from './Hatch';

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NO_SCHOOL = new Set(['noSchool', 'studyLeave']);

/** What a day is, in words, for screen readers. */
function describe(day) {
  const parts = [];
  if (day.tests.length) parts.push(day.tests.map((test) => test.name).join(', '));
  if (day.dayType === 'paper') parts.push('exam paper instead of school');
  else if (day.dayType === 'studyLeave') parts.push(`study leave for ${day.reason}`);
  else if (day.dayType === 'noSchool') parts.push(`no school, ${day.reason}`);
  else if (day.dayType === 'halfDay') parts.push('half day');
  if (day.prep === 'big') parts.push('half-yearly or final preparation');
  else if (day.prep === 'unit') parts.push('test preparation');
  if (day.overloaded) parts.push('too busy');
  if (day.rest) parts.push('rest day');
  if (day.changed) parts.push('timings changed');
  return parts.join(', ');
}

const DayCell = memo(function DayCell({ day, selected, isToday, onSelect }) {
  const { colors, radius } = useTheme();
  const hasTest = day.tests.length > 0;
  const off = NO_SCHOOL.has(day.dayType);
  const prepColor = day.prep === 'big' ? colors.tint : day.prep === 'unit' ? colors.warning : null;
  return (
    <PressableScale
      onPress={() => onSelect(day.date)}
      disabled={!day.viewable}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !day.viewable }}
      accessibilityLabel={`${longDate(day.date)}${describe(day) ? `, ${describe(day)}` : ''}`}
      testID={`month-day-${day.date}`}
      style={[
        styles.cell,
        {
          borderRadius: radius.sm,
          backgroundColor: selected ? colors.tint : day.dayType === 'paper' ? colors.dangerSoft : 'transparent',
          borderColor: hasTest ? colors.danger : isToday && !selected ? colors.tint : 'transparent',
          opacity: day.viewable ? 1 : 0.35,
        },
      ]}
    >
      {off && !selected ? (
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius.sm, overflow: 'hidden' }]}>
          <Hatch gap={5} />
        </View>
      ) : null}
      <Text style={[styles.date, { color: selected ? colors.onTint : hasTest ? colors.danger : off ? colors.textSecondary : colors.text }]}>{dayOfMonth(day.date)}</Text>
      {prepColor ? <View style={[styles.prep, { backgroundColor: selected ? colors.onTint : prepColor }]} /> : <View style={styles.prepSpace} />}
      {day.overloaded ? <View style={[styles.busy, { backgroundColor: colors.warning }]} /> : null}
      {day.rest ? <View style={[styles.rest, { backgroundColor: colors.success }]} /> : null}
    </PressableScale>
  );
});

function Legend() {
  const { colors } = useTheme();
  const item = (key, swatch, label) => (
    <View key={key} style={styles.legendItem}>
      {swatch}
      <Text style={[styles.legendText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
  return (
    <View style={styles.legend}>
      {item('test', <View style={[styles.swatch, { borderColor: colors.danger, borderWidth: 2 }]} />, 'Test or paper')}
      {item('unit', <View style={[styles.bar, { backgroundColor: colors.warning }]} />, 'Test prep')}
      {item('big', <View style={[styles.bar, { backgroundColor: colors.tint }]} />, 'Half-yearly / final prep')}
      {item(
        'off',
        <View style={[styles.swatch, { overflow: 'hidden' }]}>
          <Hatch gap={4} />
        </View>,
        'No school',
      )}
      {item('busy', <View style={[styles.dot, { backgroundColor: colors.warning }]} />, 'Too busy')}
      {item('rest', <View style={[styles.dot, { backgroundColor: colors.success }]} />, 'Rest day')}
    </View>
  );
}

/**
 * A month of the student's calendar, Monday first. `days` are `planMonth` rows for the month;
 * `value` is the chosen day. `onMonthChange(-1 | 1)` moves months when `canPrev` / `canNext`.
 */
export function MonthCalendar({ month, days, value, today, onChange, onMonthChange, canPrev = true, canNext = true }) {
  const { colors } = useTheme();
  const first = `${month}-01`;
  const blanks = (weekdayOf(first) + 6) % 7;
  const cells = [...Array.from({ length: blanks }, (_, index) => ({ blank: addDays(first, index - blanks) })), ...days];
  while (cells.length % 7) cells.push({ blank: `end-${cells.length}` });
  const arrow = (icon, label, delta, enabled) => (
    <PressableScale
      onPress={() => onMonthChange(delta)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`month-${delta < 0 ? 'prev' : 'next'}`}
      style={[styles.arrow, { backgroundColor: colors.fill, opacity: enabled ? 1 : 0.35 }]}
    >
      <Icon name={icon} size={16} color={colors.text} strokeWidth={2.4} />
    </PressableScale>
  );
  return (
    <View style={styles.wrap} testID="month-calendar">
      <View style={styles.head}>
        {arrow('back', 'Previous month', -1, canPrev)}
        <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">
          {monthYear(first)}
        </Text>
        {arrow('chevron', 'Next month', 1, canNext)}
      </View>
      <View style={styles.row}>
        {WEEK.map((letter, index) => (
          <Text key={index} style={[styles.weekday, { color: colors.textSecondary }]}>
            {letter}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.row}>
          {cells.slice(week * 7, week * 7 + 7).map((cell) =>
            cell.blank ? <View key={cell.blank} style={styles.cellSpace} /> : <DayCell key={cell.date} day={cell} selected={cell.date === value} isToday={cell.date === today} onSelect={onChange} />,
          )}
        </View>
      ))}
      <Legend />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 },
  heading: { fontSize: 15.5, fontWeight: '800' },
  arrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  cell: { flex: 1, aspectRatio: 1, maxHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 2, gap: 2 },
  cellSpace: { flex: 1, aspectRatio: 1, maxHeight: 52 },
  date: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  prep: { width: 16, height: 3, borderRadius: 2 },
  prepSpace: { height: 3 },
  busy: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3 },
  rest: { position: 'absolute', top: 4, left: 4, width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11.5, fontWeight: '600' },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  bar: { width: 14, height: 3, borderRadius: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
