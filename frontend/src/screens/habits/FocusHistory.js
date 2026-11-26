import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SubjectDot } from '../../components/domain/Badges';
import { Divider, Section } from '../../components/ui/Layout';
import { EmptyState } from '../../components/ui/States';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { duration, hours, plural, shortDate, shortWeekday } from '../../utils/format';

const BAR_HEIGHT = 72;

/** Focus minutes over the last seven days and today's sessions, newest last. */
export function FocusHistory({ week, weekMins, sessions, today, todayMins }) {
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  return (
    <Section title="Focus history" meta={`${duration(weekMins)} this week`} flush>
      <View style={styles.chart}>
        <FocusWeekBars days={week} today={today} />
      </View>
      <Divider />
      <View style={styles.todayHead}>
        <Text style={[styles.todayTitle, { color: colors.text }]}>Today</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{sessions.length ? `${plural(sessions.length, 'session')} · ${duration(todayMins)}` : 'No sessions yet'}</Text>
      </View>
      {sessions.length ? (
        sessions.map((session, index) => (
          <View key={session.id}>
            {index ? <Divider /> : null}
            <View style={styles.session} accessible accessibilityLabel={`${subjectOf(session.subject).name}, ${duration(session.mins)}${session.time ? `, logged at ${session.time}` : ''}`}>
              <SubjectDot subject={session.subject} size={10} />
              <Text style={[styles.flex, { color: colors.text, fontSize: 16 }]} numberOfLines={1}>
                {subjectOf(session.subject).name}
              </Text>
              {session.time ? <Text style={[styles.time, { color: colors.textTertiary }]}>{session.time}</Text> : null}
              <Text style={[styles.mins, { color: colors.text }]}>{duration(session.mins)}</Text>
            </View>
          </View>
        ))
      ) : (
        <EmptyState message="Finished sessions show up here. Even 15 minutes counts towards your streak." />
      )}
    </Section>
  );
}

const compact = (mins) => (mins >= 60 ? `${hours(mins)}h` : `${mins}m`);

const FocusWeekBars = memo(function FocusWeekBars({ days, today }) {
  const { colors } = useTheme();
  const max = Math.max(60, ...days.map((day) => day.mins));
  return (
    <View style={styles.bars} accessibilityRole="image" accessibilityLabel={`Focus time: ${days.map((day) => `${shortDate(day.date)} ${duration(day.mins)}`).join(', ')}`}>
      {days.map((day) => {
        const isToday = day.date === today;
        return (
          <View key={day.date} style={styles.barColumn}>
            <Text style={[styles.barValue, { color: isToday ? colors.text : colors.textSecondary }]}>{day.mins ? compact(day.mins) : ''}</Text>
            <View style={[styles.barTrack, { backgroundColor: colors.fill }]}>
              <View style={{ height: day.mins ? Math.max(6, (day.mins / max) * BAR_HEIGHT) : 0, borderRadius: 6, backgroundColor: isToday ? colors.tint : `${colors.tint}66` }} />
            </View>
            <Text style={[styles.barLabel, { color: isToday ? colors.text : colors.textSecondary, fontWeight: isToday ? '700' : '500' }]}>
              {isToday ? 'Today' : shortWeekday(day.date)}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chart: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  barColumn: { flex: 1, alignItems: 'center', gap: 5 },
  barValue: { fontSize: 11, height: 14, fontVariant: ['tabular-nums'] },
  barTrack: { height: BAR_HEIGHT, width: '58%', maxWidth: 28, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  barLabel: { fontSize: 11 },
  todayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  todayTitle: { fontSize: 15, fontWeight: '700' },
  session: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  time: { fontSize: 13, fontVariant: ['tabular-nums'] },
  mins: { fontSize: 15, fontWeight: '600', minWidth: 64, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
