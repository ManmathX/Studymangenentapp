import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SubjectDot } from '../../components/domain/Badges';
import { StreakCalendar } from '../../components/domain/Charts';
import { Button } from '../../components/ui/Button';
import { CheckRow, SegmentedControl, Stepper } from '../../components/ui/Controls';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary, EmptyState } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { chapterActions, habitActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { dayName, duration } from '../../utils/format';
import { FocusTimer } from './FocusTimer';

const SCREEN_OPTIONS = [
  { value: 'Under 1 h', label: 'Under 1 h' },
  { value: '1 to 2 h', label: '1–2 h' },
  { value: '2 to 3 h', label: '2–3 h' },
  { value: 'Over 3 h', label: '3 h +' },
];

export function HabitsScreen() {
  const habits = useResource(resources.habits);
  return (
    <Screen refreshing={habits.isRefreshing} onRefresh={habits.refresh} testID="habits-screen">
      <AsyncBoundary resource={habits}>
        {(data) => (
          <>
            <Streak data={data} />
            <FocusTimer subjects={data.subjects} />
            {data.focusSessions.length ? <FocusSessions sessions={data.focusSessions} /> : null}
            <CheckIn checkin={data.checkin} key={`${data.today}-${data.checkin.saved}`} />
            <Routines routines={data.routines} key={routinesKey(data)} />
            <Nudges nudges={data.nudges} today={data.today} />
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function Streak({ data }) {
  const { colors } = useTheme();
  const rest = useAsyncAction(habitActions.takeRestDay);
  return (
    <Section title="Streak" footer={`${data.restDaysThisWeek} of ${data.maxRestDaysPerWeek} rest days used this week.`}>
      <View style={styles.streakTop}>
        <Text style={[styles.streakNumber, { color: colors.text }]}>{data.streak}</Text>
        <View style={styles.flex}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>days in a row</Text>
          <Muted small>Rest days and exam days keep it going. Only a missed day resets it.</Muted>
        </View>
      </View>
      <StreakCalendar days={data.calendar} today={data.today} />
      <View style={styles.legend}>
        <LegendDot color={colors.tint} label="Studied" />
        <LegendDot color={colors.rest} label="Rest" />
        <LegendDot color="transparent" border={colors.text} label="Exam" />
        <LegendDot color={colors.fill} label="Missed" />
      </View>
      <View style={styles.center}>
        <Button title="Take today as a rest day" icon="moon" size="sm" onPress={rest.execute} loading={rest.pending} disabled={!data.canRestToday} />
      </View>
    </Section>
  );
}

function LegendDot({ color, border, label }) {
  const { colors } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, borderWidth: border ? 1.5 : 0, borderColor: border }} />
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function FocusSessions({ sessions }) {
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  return (
    <Card flush>
      {sessions.map((session, index) => (
        <View key={session.id}>
          {index ? <Divider /> : null}
          <View style={styles.session}>
            <SubjectDot subject={session.subject} size={10} />
            <Text style={[styles.flex, { color: colors.text }]}>{subjectOf(session.subject).name}</Text>
            <Muted small>{duration(session.mins)}</Muted>
          </View>
        </View>
      ))}
    </Card>
  );
}

function CheckIn({ checkin }) {
  const [values, setValues] = useState({ sleep: checkin.sleep, breaks: checkin.breaks, screen: checkin.screen });
  const save = useAsyncAction(() => habitActions.saveCheckin(values));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  return (
    <Section
      title="Check-in"
      meta={checkin.saved ? 'Saved' : undefined}
      flush
      footer={values.sleep < 8 ? 'Teenagers need 8 to 10 hours of sleep. Tonight’s plan ends by 22:00 to help.' : 'Only you can see your check-ins.'}
    >
      <Stepper label="Sleep last night" valueLabel={`${values.sleep} h`} onDecrement={() => setValues((v) => ({ ...v, sleep: clamp(v.sleep - 0.5, 3, 12) }))} onIncrement={() => setValues((v) => ({ ...v, sleep: clamp(v.sleep + 0.5, 3, 12) }))} />
      <Divider />
      <Stepper label="Breaks today" valueLabel={String(values.breaks)} onDecrement={() => setValues((v) => ({ ...v, breaks: clamp(v.breaks - 1, 0, 12) }))} onIncrement={() => setValues((v) => ({ ...v, breaks: clamp(v.breaks + 1, 0, 12) }))} />
      <Divider />
      <View style={styles.padded}>
        <Muted small>Screen time, not studying</Muted>
        <SegmentedControl label="Screen time" options={SCREEN_OPTIONS} value={values.screen} onChange={(screen) => setValues((v) => ({ ...v, screen }))} />
        <View style={styles.buttons}>
          <Button title={checkin.saved ? 'Update check-in' : 'Save check-in'} size="sm" variant="primary" onPress={save.execute} loading={save.pending} />
        </View>
      </View>
    </Section>
  );
}

/** Remounts the routines card when the saved ticks (or the day) change. */
function routinesKey(data) {
  const ticks = (list) => list.map((item) => (item.done ? 1 : 0)).join('');
  return `${data.today}-${ticks(data.routines.morning)}-${ticks(data.routines.evening)}`;
}

function Routines({ routines }) {
  const { colors } = useTheme();
  const [ticks, setTicks] = useState({ morning: routines.morning.map((item) => item.done), evening: routines.evening.map((item) => item.done) });

  const toggle = (part, index) => {
    const next = { ...ticks, [part]: ticks[part].map((value, i) => (i === index ? !value : value)) };
    setTicks(next);
    habitActions.saveRoutines(next);
  };

  return (
    <Section title="Routines" flush>
      {[
        ['morning', 'Morning review'],
        ['evening', 'Evening recap'],
      ].map(([part, heading]) => (
        <View key={part}>
          <Text style={[styles.routineHeading, { color: colors.textSecondary }]}>{heading}</Text>
          {routines[part].map((item, index) => (
            <CheckRow key={item.label} label={item.label} checked={ticks[part][index]} onToggle={() => toggle(part, index)} />
          ))}
        </View>
      ))}
    </Section>
  );
}

function Nudges({ nudges, today }) {
  const action = useAsyncAction((run, chapter) => run(chapter));
  return (
    <Section title="Revision nudges" flush footer="Reminders come 1, 7 and 30 days after you learn a chapter.">
      {nudges.length ? (
        nudges.map((chapter, index) => (
          <View key={chapter.key}>
            {index ? <Divider /> : null}
            <NudgeRow chapter={chapter} today={today} busy={action.pending} onRevise={() => action.execute(chapterActions.addRevision, chapter)} onSnooze={() => action.execute(chapterActions.snooze, chapter)} />
          </View>
        ))
      ) : (
        <EmptyState message="No revision due today." />
      )}
    </Section>
  );
}

function NudgeRow({ chapter, today, busy, onRevise, onSnooze }) {
  const { colors } = useTheme();
  return (
    <View style={styles.nudge}>
      <SubjectDot subject={chapter.subject} size={10} />
      <View style={styles.flex}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{chapter.name}</Text>
        <Muted small>
          {chapter.intervalDays}-day revision, learnt {dayName(chapter.learnedOn, today)}
        </Muted>
        <View style={styles.buttons}>
          <Button title="Add 15 min today" size="sm" variant="primary" onPress={onRevise} disabled={busy} />
          <Button title="Tomorrow" size="sm" variant="ghost" onPress={onSnooze} disabled={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  streakNumber: { fontSize: 48, fontWeight: '800' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  center: { alignItems: 'center', marginTop: 12 },
  session: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  padded: { padding: 16, gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  routineHeading: { fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 14 },
  nudge: { flexDirection: 'row', gap: 12, padding: 14 },
});
