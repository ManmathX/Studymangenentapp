import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { chapterStatus } from '../../theme/tokens';
import { Hatch } from './Hatch';
import { useTheme } from '../../theme/ThemeProvider';
import { dayOfMonth, hours, monthRange, shortDate, shortMonth, shortWeekday, weekdayOf } from '../../utils/format';

/** Three concentric progress rings (tasks, focus, week), like the prototype summary. */
export const Rings = memo(function Rings({ values, size = 124 }) {
  const radii = [55, 40, 25];
  return (
    <Svg width={size} height={size} viewBox="0 0 124 124" aria-hidden>
      {values.map((ring, index) => {
        const r = radii[index];
        const circumference = 2 * Math.PI * r;
        const progress = Math.max(0, Math.min(1, ring.progress));
        return (
          <G key={ring.color}>
            <Circle cx="62" cy="62" r={r} stroke={ring.color} strokeOpacity={0.18} strokeWidth="11" fill="none" />
            {progress > 0 ? (
              <Circle
                cx="62"
                cy="62"
                r={r}
                stroke={ring.color}
                strokeWidth="11"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={circumference * (1 - progress)}
                transform="rotate(-90 62 62)"
              />
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
});

/** Stacked bar of chapter statuses. `counts` = { not, learning, revised, mastered }. */
export const CoverageBar = memo(function CoverageBar({ counts, total, height = 10 }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stack, { height, backgroundColor: colors.fill }]} accessible={false}>
      {['mastered', 'revised', 'learning'].map((status) =>
        counts[status] ? (
          <View
            key={status}
            style={{ width: `${(counts[status] / Math.max(1, total)) * 100}%`, backgroundColor: chapterStatus[status].hatch ? 'transparent' : chapterStatus[status].color, overflow: 'hidden' }}
          >
            {chapterStatus[status].hatch ? <Hatch gap={5} /> : null}
          </View>
        ) : null,
      )}
    </View>
  );
});

/** Hours studied on each of the last seven days, with the daily-goal line. */
export const WeekBars = memo(function WeekBars({ days, today, weeklyGoalMins }) {
  const { colors } = useTheme();
  const perDay = weeklyGoalMins / 7;
  const max = Math.max(180, ...days.map((day) => day.mins)) * 1.2;
  const chartHeight = 118;
  return (
    <View accessibilityRole="image" accessibilityLabel={`Hours studied: ${days.map((day) => `${shortDate(day.date)} ${hours(day.mins)} hours`).join(', ')}`}>
      <View style={[styles.bars, { height: chartHeight + 36 }]}>
        <View style={[styles.goal, { bottom: 22 + (perDay / max) * chartHeight, borderColor: colors.success }]}>
          <Text style={[styles.goalLabel, { color: colors.successInk, backgroundColor: colors.card }]}>Daily goal {hours(perDay)} h</Text>
        </View>
        {days.map((day) => {
          const isToday = day.date === today;
          return (
            <View key={day.date} style={styles.barColumn}>
              <Text style={[styles.barValue, { color: colors.textSecondary }]}>{day.mins ? hours(day.mins) : ''}</Text>
              <View style={{ height: chartHeight, justifyContent: 'flex-end', width: '60%' }}>
                <View style={{ height: day.mins ? Math.max(4, (day.mins / max) * chartHeight) : 0, borderRadius: 4, backgroundColor: isToday ? colors.tint : `${colors.tint}88` }} />
              </View>
              <Text style={[styles.barLabel, { color: isToday ? colors.text : colors.textSecondary, fontWeight: isToday ? '700' : '400' }]}>{isToday ? 'Today' : shortWeekday(day.date)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const STATE_LABEL = { study: 'studied', rest: 'rest day', exam: 'exam day', missed: 'missed' };

/** Four weeks of study, rest, exam and missed days, Monday first. */
export const StreakCalendar = memo(function StreakCalendar({ days, today }) {
  const { colors } = useTheme();
  const lead = days.length ? (weekdayOf(days[0].date) + 6) % 7 : 0;
  const fills = { study: colors.tint, rest: colors.rest, exam: 'transparent', missed: colors.fill };
  return (
    <View>
      {days.length ? (
        <Text style={[styles.calMonth, { color: colors.text }]} accessibilityRole="header">
          {monthRange(days[0].date, days[days.length - 1].date)}
        </Text>
      ) : null}
      <View style={styles.calRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => (
          <Text key={`${label}${index}`} style={[styles.calHead, { color: colors.textSecondary }]}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {Array.from({ length: lead }, (_, index) => (
          <View key={`lead${index}`} style={styles.calCell} />
        ))}
        {days.map((day) => {
          const fill = fills[day.state];
          const strong = day.state === 'study';
          const monthStart = dayOfMonth(day.date) === 1;
          return (
            <View key={day.date} style={styles.calCell} accessibilityLabel={`${shortDate(day.date)}: ${STATE_LABEL[day.state] ?? 'no entry yet'}`}>
              <View
                style={[
                  styles.calDay,
                  { backgroundColor: fill ?? 'transparent' },
                  day.state === 'exam' && { borderWidth: 1.5, borderColor: colors.text },
                  day.date === today && { borderWidth: 2, borderColor: strong ? colors.text : colors.tint },
                ]}
              >
                {monthStart ? (
                  <Text style={[styles.calMonthTag, { color: strong ? '#fff' : colors.tint }]}>{shortMonth(day.date)}</Text>
                ) : null}
                <Text style={{ fontSize: 13, color: strong ? '#fff' : colors.text }}>{dayOfMonth(day.date)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

/** Progress ring for the focus timer. `progress` is 0–1; `strokeWidth` is in the 190-unit viewBox. */
export const TimerRing = memo(function TimerRing({ progress, color, children, size = 190, strokeWidth = 10, trackColor }) {
  const { colors } = useTheme();
  const r = 95 - strokeWidth / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 190 190" style={StyleSheet.absoluteFill} aria-hidden>
        <Circle cx="95" cy="95" r={r} stroke={trackColor ?? colors.fill} strokeWidth={strokeWidth} fill="none" />
        {value > 0 ? (
          <Circle
            cx="95"
            cy="95"
            r={r}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={circumference * (1 - value)}
            transform="rotate(-90 95 95)"
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  stack: { flexDirection: 'row', borderRadius: 5, overflow: 'hidden' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', position: 'relative' },
  barColumn: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 11, height: 14 },
  barLabel: { fontSize: 12, height: 16 },
  goal: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  goalLabel: { position: 'absolute', right: 0, top: -9, fontSize: 11, paddingHorizontal: 4 },
  calMonth: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  calMonthTag: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginBottom: -1 },
  calRow: { flexDirection: 'row' },
  calHead: { flex: 1, textAlign: 'center', fontSize: 12, marginBottom: 6 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  calDay: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
