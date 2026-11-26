import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SubjectDot } from '../../components/domain/Badges';
import { StreakCalendar } from '../../components/domain/Charts';
import { Button } from '../../components/ui/Button';
import { SegmentedControl, Stepper } from '../../components/ui/Controls';
import { Icon } from '../../components/ui/Icon';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary, EmptyState, LoadingState } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { chapterActions, habitActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useTheme } from '../../theme/ThemeProvider';
import { dayName, hours, plural } from '../../utils/format';
import { FocusHistory } from './FocusHistory';
import { FocusTimer } from './FocusTimer';
import { Routines } from './Routines';

const SCREEN_OPTIONS = [
  { value: 'Under 1 h', label: 'Under 1 h' },
  { value: '1 to 2 h', label: '1–2 h' },
  { value: '2 to 3 h', label: '2–3 h' },
  { value: 'Over 3 h', label: '3 h +' },
];

export function HabitsScreen() {
  const habits = useResource(resources.habits);
  // A copy cached before an app update can miss newer fields; fetch a fresh one instead of crashing.
  const outdated = habits.data !== undefined && !habits.data.routine;
  const { refresh } = habits;
  useEffect(() => {
    if (outdated) refresh();
  }, [outdated, refresh]);
  return (
    <Screen refreshing={habits.isRefreshing} onRefresh={habits.refresh} testID="habits-screen">
      <AsyncBoundary resource={habits}>
        {(data) =>
          outdated ? (
            <LoadingState />
          ) : (
          <>
            <Overview data={data} />
            <FocusTimer subjects={data.subjects} todayMins={data.focusTodayMins} />
            <FocusHistory week={data.focusWeek} weekMins={data.focusWeekMins} sessions={data.focusSessions} today={data.today} todayMins={data.focusTodayMins} />
            <Routines routine={data.routine} today={data.today} key={data.today} />
            <CheckIn checkin={data.checkin} key={`${data.today}-${data.checkin.saved}`} />
            <Streak data={data} />
            <Nudges nudges={data.nudges} today={data.today} />
          </>
          )
        }
      </AsyncBoundary>
    </Screen>
  );
}

/** Today at a glance: the streak, focus time and routine steps. */
function Overview({ data }) {
  const { colors } = useTheme();
  const due = data.routine.habits.filter((habit) => habit.scheduledToday);
  const routineDone = due.filter((habit) => habit.done).length;
  return (
    <View style={styles.tiles}>
      <StatTile icon="habits" color={colors.warning} value={String(data.streak)} unit={data.streak === 1 ? 'day' : 'days'} label="Streak" sub={`Best ${data.bestStreak}`} />
      <StatTile
        icon="clock"
        color={colors.tint}
        value={data.focusTodayMins < 60 ? String(data.focusTodayMins) : hours(data.focusTodayMins)}
        unit={data.focusTodayMins < 60 ? 'min' : 'h'}
        label="Focus"
        a11yLabel="Focus today"
        sub={plural(data.focusSessions.length, 'session')}
      />
      <StatTile icon="check" color={colors.success} value={`${routineDone}/${due.length}`} label="Routines" sub="habits done" />
    </View>
  );
}

function StatTile({ icon, color, value, unit, label, sub, a11yLabel = label }) {
  const { colors } = useTheme();
  // Three tiles share a row; on the narrowest phones the icons give their room to the text.
  const roomy = useWindowDimensions().width >= 375;
  return (
    <Card style={styles.tile}>
      <View accessible accessibilityLabel={`${a11yLabel}: ${value}${unit ? ` ${unit}` : ''}, ${sub}`}>
        <View style={styles.tileHead}>
          {roomy ? (
            <View style={[styles.tileIcon, { backgroundColor: `${color}22` }]}>
              <Icon name={icon} size={14} color={color} strokeWidth={2.4} />
            </View>
          ) : null}
          <Text style={[styles.tileLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Text style={[styles.tileValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {value}
          {unit ? <Text style={[styles.tileUnit, { color: colors.textSecondary }]}> {unit}</Text> : null}
        </Text>
        <Text style={[styles.tileSub, { color: colors.textTertiary }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Card>
  );
}

/** What today means for the streak, Streaks-style: only warn when today could still break it. */
function streakStatus(data, colors) {
  if (data.todayState === 'study') return { icon: 'check', color: colors.success, text: 'You studied today. Your streak is safe.' };
  if (data.todayState === 'rest') return { icon: 'moon', color: colors.rest, text: 'Rest day. Your streak is safe.' };
  if (data.todayState === 'exam') return { icon: 'check', color: colors.success, text: 'Exam day. Your streak is safe.' };
  if (data.streak > 0) {
    return { icon: 'habits', color: colors.warning, text: `Focus for a minute, finish a task or take a rest day to keep your ${plural(data.streak, 'day')} going.` };
  }
  return { icon: 'play', color: colors.tint, text: 'Finish one focus session or task today to start a streak.' };
}

function Streak({ data }) {
  const { colors } = useTheme();
  const rest = useAsyncAction(habitActions.takeRestDay);
  const status = streakStatus(data, colors);
  const restLimitReached = data.restDaysThisWeek >= data.maxRestDaysPerWeek;
  const showRestButton = !data.studiedToday && !data.restToday;
  return (
    <Section
      title="Streak"
      meta={`Best ${plural(data.bestStreak, 'day')}`}
      footer={`${data.restDaysThisWeek} of ${data.maxRestDaysPerWeek} rest days used this week. Study, rest and exam days keep the streak; only a missed day resets it.`}
    >
      <View style={styles.streakTop}>
        <Text style={[styles.streakNumber, { color: colors.text }]}>{data.streak}</Text>
        <View style={styles.flex}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>{data.streak === 1 ? 'day in a row' : 'days in a row'}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusIcon, { backgroundColor: `${status.color}26` }]}>
              <Icon name={status.icon} size={12} color={status.color} strokeWidth={2.6} />
            </View>
            <Muted small style={styles.flex}>
              {status.text}
            </Muted>
          </View>
        </View>
      </View>
      <StreakCalendar days={data.calendar} today={data.today} />
      <View style={styles.legend}>
        <LegendDot color={colors.tint} label="Studied" />
        <LegendDot color={colors.rest} label="Rest" />
        <LegendDot color="transparent" border={colors.text} label="Exam" />
        <LegendDot color={colors.fill} label="Missed" />
      </View>
      {showRestButton ? (
        <View style={styles.center}>
          <Button
            title="Take today as a rest day"
            icon="moon"
            size="sm"
            onPress={rest.execute}
            loading={rest.pending}
            disabled={!data.canRestToday}
            accessibilityLabel={restLimitReached ? 'Take today as a rest day. Both rest days are used this week.' : undefined}
          />
          {restLimitReached ? <Muted small style={styles.centerText}>Both rest days are used this week.</Muted> : null}
        </View>
      ) : null}
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

function CheckIn({ checkin }) {
  const { colors } = useTheme();
  const [values, setValues] = useState({ sleep: checkin.sleep, breaks: checkin.breaks, screen: checkin.screen });
  const save = useAsyncAction(() => habitActions.saveCheckin(values));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const changed = values.sleep !== checkin.sleep || values.breaks !== checkin.breaks || values.screen !== checkin.screen;
  return (
    <Section
      title="Check-in"
      meta={checkin.saved ? (changed ? 'Unsaved changes' : 'Saved today') : 'Not saved yet'}
      flush
      footer={values.sleep < 8 ? 'Teenagers need 8 to 10 hours of sleep. Tonight’s plan ends by 22:00 to help.' : 'Only you can see your check-ins.'}
    >
      <Stepper label="Sleep last night" valueLabel={`${values.sleep} h`} onDecrement={() => setValues((v) => ({ ...v, sleep: clamp(v.sleep - 0.5, 3, 12) }))} onIncrement={() => setValues((v) => ({ ...v, sleep: clamp(v.sleep + 0.5, 3, 12) }))} />
      <Divider />
      <Stepper label="Breaks today" valueLabel={String(values.breaks)} onDecrement={() => setValues((v) => ({ ...v, breaks: clamp(v.breaks - 1, 0, 12) }))} onIncrement={() => setValues((v) => ({ ...v, breaks: clamp(v.breaks + 1, 0, 12) }))} />
      <Divider />
      <View style={styles.padded}>
        <Text style={{ color: colors.text, fontSize: 16 }}>Screen time, not studying</Text>
        <SegmentedControl label="Screen time" options={SCREEN_OPTIONS} value={values.screen} onChange={(screen) => setValues((v) => ({ ...v, screen }))} />
        <View style={styles.buttons}>
          <Button
            title={checkin.saved ? (changed ? 'Update check-in' : 'Check-in saved') : 'Save check-in'}
            icon={checkin.saved && !changed ? 'check' : undefined}
            size="sm"
            variant={checkin.saved && !changed ? 'secondary' : 'primary'}
            onPress={save.execute}
            loading={save.pending}
            disabled={checkin.saved && !changed}
          />
        </View>
      </View>
    </Section>
  );
}

function Nudges({ nudges, today }) {
  const action = useAsyncAction((run, chapter) => run(chapter));
  return (
    <Section title="Revision nudges" meta={nudges.length ? `${nudges.length} due` : undefined} flush footer="Reminders come 1, 7 and 30 days after you learn a chapter.">
      {nudges.length ? (
        nudges.map((chapter, index) => (
          <View key={chapter.key}>
            {index ? <Divider /> : null}
            <NudgeRow chapter={chapter} today={today} busy={action.pending} onRevise={() => action.execute(chapterActions.addRevision, chapter)} onSnooze={() => action.execute(chapterActions.snooze, chapter)} />
          </View>
        ))
      ) : (
        <EmptyState message="No revision due today. Nice work." />
      )}
    </Section>
  );
}

function NudgeRow({ chapter, today, busy, onRevise, onSnooze }) {
  const { colors } = useTheme();
  return (
    <View style={styles.nudge}>
      <View style={styles.nudgeDot}>
        <SubjectDot subject={chapter.subject} size={10} />
      </View>
      <View style={styles.flex}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{chapter.name}</Text>
        <Muted small>
          {chapter.intervalDays}-day revision · learnt {dayName(chapter.learnedOn, today)}
        </Muted>
        <View style={styles.buttons}>
          <Button title="Add 15 min today" icon="plus" size="sm" variant="primary" onPress={onRevise} disabled={busy} />
          <Button title="Tomorrow" size="sm" variant="ghost" onPress={onSnooze} disabled={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 12 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  tileIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  tileValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tileUnit: { fontSize: 13, fontWeight: '500' },
  tileSub: { fontSize: 12, marginTop: 2 },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  streakNumber: { fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  statusIcon: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 0 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  center: { alignItems: 'center', marginTop: 14, gap: 6 },
  centerText: { textAlign: 'center' },
  padded: { padding: 16, gap: 10 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  nudge: { flexDirection: 'row', gap: 12, padding: 16 },
  nudgeDot: { paddingTop: 6 },
});
