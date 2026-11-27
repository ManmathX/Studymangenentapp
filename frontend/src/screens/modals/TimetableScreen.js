import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup } from '../../components/ui/Controls';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { profileActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, clockTime, shortDate, weekdayOf } from '../../utils/format';

/** Monday first, as students read a timetable. */
const WEEK = [
  { day: 1, name: 'Monday' },
  { day: 2, name: 'Tuesday' },
  { day: 3, name: 'Wednesday' },
  { day: 4, name: 'Thursday' },
  { day: 5, name: 'Friday' },
  { day: 6, name: 'Saturday' },
  { day: 0, name: 'Sunday' },
];
const MAX_PERIODS = 10;
const SCOPE_LABEL = { day: 'Day', week: 'Week', month: 'Month' };

/** The normal school times on a weekday: its own times, or the usual ones (Saturdays follow their setting). */
function weekdayHours(profile, day) {
  const own = profile.schoolWeek?.[day];
  if (own) return { own: true, text: own.off ? 'No school' : `${clockTime(own.start)}–${clockTime(own.end)}` };
  if (day === 0) return { own: false, text: 'No school' };
  if (day !== 6) return { own: false, text: `${clockTime(profile.schoolStart)}–${clockTime(profile.schoolEnd)}` };
  const mode = profile.saturday ?? 'half';
  if (mode === 'off') return { own: false, text: 'No school' };
  if (mode === 'full') return { own: false, text: `${clockTime(profile.schoolStart)}–${clockTime(profile.schoolEnd)}` };
  const end = Math.min(profile.schoolEnd, profile.schoolStart + 285);
  return { own: false, text: `${clockTime(profile.schoolStart)}–${clockTime(end)}${mode === 'alternate' ? ' (2nd and 4th off)' : ' (half day)'}` };
}

/** The student's timetable: school times per weekday, changes for a day, week or month, and the class periods. */
export function TimetableScreen({ navigation }) {
  const profile = useResource(resources.profile);
  return (
    <Screen refreshing={profile.isRefreshing} onRefresh={profile.refresh} testID="timetable-screen">
      <AsyncBoundary resource={profile}>
        {(me) => (
          <>
            <WeeklyTimes profile={me} navigation={navigation} />
            <Changes profile={me} navigation={navigation} />
            <ClassPeriods key={JSON.stringify(me.periods)} profile={me} />
          </>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function WeeklyTimes({ profile, navigation }) {
  const { colors } = useTheme();
  const reset = useAsyncAction(profileActions.resetSchoolDay);
  // The next date with this weekday, from today.
  const nextDate = (day) => addDays(profile.today, (day - weekdayOf(profile.today) + 7) % 7);
  return (
    <Section title="School each weekday" icon="bag" iconColor="#06B6D4" flush footer="Change a weekday to give it its own times every week. Reset brings back your usual times.">
      {WEEK.map(({ day, name }, index) => {
        const hours = weekdayHours(profile, day);
        return (
          <View key={day} testID={`weekday-${day}`}>
            {index ? <Divider /> : null}
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{name}</Text>
                <Muted small>
                  {hours.text}
                  {hours.own ? ' · its own times' : ''}
                </Muted>
              </View>
              {hours.own ? <Button title="Reset" size="sm" variant="ghost" onPress={() => reset.execute(day, name)} loading={reset.pending} /> : null}
              <Button title="Change" icon="pencil" size="sm" onPress={() => navigation.navigate('ChangeTimings', { date: nextDate(day), scope: 'weekday' })} testID={`change-weekday-${day}`} />
            </View>
          </View>
        );
      })}
    </Section>
  );
}

function Changes({ profile, navigation }) {
  const { colors } = useTheme();
  const remove = useAsyncAction(profileActions.removeTimingChange);
  const changes = profile.timingChanges ?? [];
  return (
    <Section
      title="Changes for a day, week or month"
      icon="clock"
      bare
      footer="Summer or winter timings, an exam week, a short day: change them from any day in the Plan calendar."
    >
      <View style={styles.list}>
        {changes.map((change) => (
          <Card key={change.id} style={styles.change}>
            <View style={styles.flex}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {SCOPE_LABEL[change.scope] ?? 'Change'} · {change.from === change.to ? shortDate(change.from) : `${shortDate(change.from)} to ${shortDate(change.to)}`}
              </Text>
              <Muted small>
                {change.school ? (change.school.off ? 'No school' : `School ${clockTime(change.school.start)}–${clockTime(change.school.end)}`) : 'School as usual'}
                {change.tuitions ? ` · tuition: ${change.tuitions.length ? change.tuitions.map((tuition) => `${tuition.name || 'Tuition'} ${clockTime(tuition.start)}`).join(', ') : 'none'}` : ''}
              </Muted>
            </View>
            <Button title="Remove" icon="trash" size="sm" variant="ghost" onPress={() => remove.execute(change)} disabled={remove.pending} />
          </Card>
        ))}
        {changes.length ? null : <Muted small>No changes coming up.</Muted>}
        <Button title="Change a day from the calendar" icon="today" size="sm" onPress={() => navigation.navigate('Main', { screen: 'Plan', params: { section: 'plan' } })} />
      </View>
    </Section>
  );
}

/** Which subjects are taught in each period on each weekday. Used for the school bag and for night revision. */
function ClassPeriods({ profile }) {
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  const [periods, setPeriods] = useState(() => ({ ...(profile.periods ?? {}) }));
  const [editing, setEditing] = useState(null);
  const changed = JSON.stringify(periods) !== JSON.stringify(profile.periods ?? {});
  const save = useAsyncAction(() => profileActions.update({ periods }, 'Class timetable saved. Your bag and night revision follow it.'));
  const add = (day, subject) => setPeriods((current) => ({ ...current, [day]: [...(current[day] ?? []), subject].slice(0, MAX_PERIODS) }));
  const removeAt = (day, index) => setPeriods((current) => ({ ...current, [day]: (current[day] ?? []).filter((_, at) => at !== index) }));
  return (
    <Section title="Class timetable" icon="list" bare footer="Tap a subject to add a period; tap a period to remove it. Night revision then says which lessons to go over, and the bag lists their books.">
      <View style={styles.list}>
        {WEEK.slice(0, 6).map(({ day, name }) => {
          const list = periods[day] ?? [];
          return (
            <Card key={day} style={styles.periodCard} testID={`periods-${day}`}>
              <View style={styles.periodHead}>
                <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{name}</Text>
                <Button title={editing === day ? 'Done' : 'Add period'} icon={editing === day ? 'check' : 'plus'} size="sm" variant="ghost" onPress={() => setEditing(editing === day ? null : day)} />
              </View>
              <ChipGroup label={`${name} periods`}>
                {list.map((subject, index) => (
                  <Chip key={`${subject}-${index}`} label={`${index + 1}. ${subjectOf(subject).name}`} color={subjectOf(subject).color} onPress={() => removeAt(day, index)} />
                ))}
              </ChipGroup>
              {list.length ? null : <Muted small>No periods yet.</Muted>}
              {editing === day ? (
                <View style={styles.picker}>
                  <Muted small>Add a period:</Muted>
                  <ChipGroup label="Subjects">
                    {profile.subjects.map((subject) => (
                      <Chip key={subject} label={subjectOf(subject).name} color={subjectOf(subject).color} onPress={() => add(day, subject)} disabled={list.length >= MAX_PERIODS} />
                    ))}
                  </ChipGroup>
                </View>
              ) : null}
            </Card>
          );
        })}
        {changed ? <Button title="Save class timetable" icon="check" variant="primary" onPress={save.execute} loading={save.pending} testID="save-periods" /> : null}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  list: { gap: 8 },
  change: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  periodCard: { gap: 8 },
  periodHead: { flexDirection: 'row', alignItems: 'center' },
  picker: { gap: 6 },
});
