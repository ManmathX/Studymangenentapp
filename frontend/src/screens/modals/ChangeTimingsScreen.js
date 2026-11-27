import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { SegmentedControl, Stepper, ToggleRow } from '../../components/ui/Controls';
import { Input } from '../../components/ui/Field';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { profileActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useTheme } from '../../theme/ThemeProvider';
import { clockTime, longDate, minutesToTime, timeToMinutes, weekdayOf } from '../../utils/format';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STEP = 15;
const SCOPE_WORDS = { day: 'this day', week: 'this week', month: 'this month', weekday: 'every', always: 'every school day' };

/**
 * Changes school (and, for one day, tuition) timings from the calendar: for one day, its week,
 * its month, every such weekday, or always. Opened with `{ date, scope? }`.
 */
export function ChangeTimingsScreen({ navigation, route }) {
  const { date, scope = 'day' } = route.params;
  const day = useResource(resources.planDay(date));
  const profile = useResource(resources.profile);
  return (
    <Screen testID="change-timings-screen">
      <AsyncBoundary resource={profile}>
        {(me) => <AsyncBoundary resource={day}>{(data) => <TimingsForm date={date} startScope={scope} day={data} profile={me} onDone={() => navigation.goBack()} />}</AsyncBoundary>}
      </AsyncBoundary>
    </Screen>
  );
}

function TimingsForm({ date, startScope, day, profile, onDone }) {
  const { colors } = useTheme();
  const weekdayName = WEEKDAYS[weekdayOf(date)];
  const school = day.rows.find((row) => row.type === 'fixed' && row.kind === 'school');
  const [scope, setScope] = useState(startScope);
  const [hasSchool, setHasSchool] = useState(Boolean(school) || startScope !== 'day');
  const [start, setStart] = useState(clockTime(school?.start ?? profile.schoolStart));
  const [end, setEnd] = useState(clockTime(school?.end ?? profile.schoolEnd));
  const [changeTuitions, setChangeTuitions] = useState(false);
  const [tuitions, setTuitions] = useState(() =>
    day.rows
      .filter((row) => row.type === 'fixed' && row.kind === 'tuition')
      .map((row, index) => ({ key: index, name: row.label === 'Tuition' ? '' : row.label, start: clockTime(row.start), end: clockTime(row.end) })),
  );
  const [error, setError] = useState(null);

  const shift = (setter, value, delta) => setter(minutesToTime(timeToMinutes(value) + delta));
  // A day without school (a Sunday, say) starts with school off; a change for more days starts
  // with school on, so cancelling school for a whole week or month is always a deliberate choice.
  const chooseScope = (next) => {
    setScope(next);
    if (!school && next !== 'day') setHasSchool(true);
  };
  const editTuition = (key, patch) => setTuitions((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const oneDay = scope === 'day';
  const scopeWords = scope === 'weekday' ? `every ${weekdayName}` : SCOPE_WORDS[scope];

  const save = useAsyncAction(async () => {
    if (hasSchool && timeToMinutes(end) <= timeToMinutes(start)) return setError('School has to end after it starts.');
    if (!hasSchool && scope === 'always') return setError('To have no school on every day, add a holiday instead.');
    setError(null);
    const body = { date, scope, school: hasSchool ? { start, end } : { off: true } };
    if (oneDay && changeTuitions) body.tuitions = tuitions.map(({ name, start: from, end: to }) => ({ name: name.trim(), start: from, end: to }));
    const message = hasSchool ? `School ${start}–${end} for ${scopeWords}.` : `No school ${scopeWords}.`;
    if (await profileActions.changeTimings(body, message)) onDone();
    return null;
  });

  return (
    <View style={styles.stack}>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {longDate(date)}
      </Text>
      <Section title="Change it for" icon="today" bare>
        <SegmentedControl
          label="Change it for"
          value={scope}
          onChange={chooseScope}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'weekday', label: `Every ${weekdayName.slice(0, 3)}` },
            { value: 'always', label: 'Always' },
          ]}
        />
        <Muted small style={styles.hint}>
          {scope === 'day' && 'Only this day changes.'}
          {scope === 'week' && 'Every school day from Monday to Sunday of this week changes.'}
          {scope === 'month' && 'Every school day of this month changes, for example winter or summer timings.'}
          {scope === 'weekday' && `Every ${weekdayName} from now on has these times.`}
          {scope === 'always' && 'Your normal school times change for every school day.'}
        </Muted>
      </Section>

      <Section title="School" icon="bag" bare>
        <Card flush>
          <ToggleRow label={oneDay ? 'School on this day' : 'School on these days'} value={hasSchool} onValueChange={setHasSchool} />
          {hasSchool ? (
            <>
              <Divider />
              <Stepper label="School starts" valueLabel={start} onDecrement={() => shift(setStart, start, -STEP)} onIncrement={() => shift(setStart, start, STEP)} />
              <Divider />
              <Stepper label="School ends" valueLabel={end} onDecrement={() => shift(setEnd, end, -STEP)} onIncrement={() => shift(setEnd, end, STEP)} />
            </>
          ) : null}
        </Card>
      </Section>

      {oneDay ? (
        <Section title="Tuition" icon="book" bare>
          <Card flush>
            <ToggleRow label="Change this day’s tuition" hint="Move, cancel or add a class just for this day." value={changeTuitions} onValueChange={setChangeTuitions} />
          </Card>
          {changeTuitions ? (
            <View style={styles.stack}>
              {tuitions.map((tuition) => (
                <Card key={tuition.key} flush>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Input value={tuition.name} onChangeText={(name) => editTuition(tuition.key, { name })} placeholder="Tuition name" maxLength={40} />
                    </View>
                    <Button title="Remove" icon="trash" size="sm" variant="ghost" onPress={() => setTuitions((list) => list.filter((item) => item.key !== tuition.key))} />
                  </View>
                  <Stepper label="Starts" valueLabel={tuition.start} onDecrement={() => editTuition(tuition.key, { start: minutesToTime(timeToMinutes(tuition.start) - STEP) })} onIncrement={() => editTuition(tuition.key, { start: minutesToTime(timeToMinutes(tuition.start) + STEP) })} />
                  <Stepper label="Ends" valueLabel={tuition.end} onDecrement={() => editTuition(tuition.key, { end: minutesToTime(timeToMinutes(tuition.end) - STEP) })} onIncrement={() => editTuition(tuition.key, { end: minutesToTime(timeToMinutes(tuition.end) + STEP) })} />
                </Card>
              ))}
              <Button title="Add a class this day" icon="plus" size="sm" onPress={() => setTuitions((list) => [...list, { key: Date.now(), name: '', start: '17:00', end: '18:00' }])} />
              {!tuitions.length ? <Muted small>No tuition this day.</Muted> : null}
            </View>
          ) : null}
        </Section>
      ) : null}

      {error ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button title="Save timings" icon="check" variant="primary" block onPress={save.execute} loading={save.pending} testID="save-change-timings" />
      <Muted small>The plan for those days is laid out again around the new times. Tasks keep their days.</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  hint: { marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 10 },
  flex: { flex: 1 },
});
