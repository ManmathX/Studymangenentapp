import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup } from '../../components/ui/Controls';
import { Input } from '../../components/ui/Field';
import { Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { profileActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, diffDays, plural, shortDate } from '../../utils/format';

const DAYS_AHEAD = 365;
/** Matches the planner: one break is at most 92 days. */
const MAX_LENGTH_DAYS = 92;
const IDEAS = ['Diwali break', 'Winter break', 'Summer vacation', 'Holi', 'Dussehra', 'Exam prep leave', 'School trip'];

/** Adds a holiday or break: a name, its first day and its last day. */
export function AddHolidayScreen({ navigation }) {
  const profile = useResource(resources.profile);
  return (
    <Screen testID="add-holiday-screen">
      <AsyncBoundary resource={profile}>{(me) => <HolidayForm today={me.today} onDone={() => navigation.goBack()} />}</AsyncBoundary>
    </Screen>
  );
}

function HolidayForm({ today, onDone }) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [error, setError] = useState(null);
  const firstDays = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, index) => addDays(today, index)), [today]);
  const lastDays = useMemo(() => Array.from({ length: MAX_LENGTH_DAYS }, (_, index) => addDays(from, index)), [from]);
  const length = diffDays(from, to) + 1;

  const save = useAsyncAction(async () => {
    if (!name.trim()) {
      setError('Name the holiday, for example "Diwali break".');
      return;
    }
    setError(null);
    if (await profileActions.addHoliday({ name: name.trim(), from, to })) onDone();
  });

  return (
    <View style={styles.stack}>
      <Section title="Which holiday?" icon="sun" iconColor={colors.warning} bare>
        <View style={styles.stack}>
          <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Diwali break" maxLength={40} testID="holiday-name" />
          <ChipGroup label="Ideas">
            {IDEAS.map((idea) => (
              <Chip key={idea} label={idea} selected={name === idea} onPress={() => setName(idea)} />
            ))}
          </ChipGroup>
        </View>
      </Section>
      <Section title="First day" icon="today" bare>
        <DayPicker
          days={firstDays}
          value={from}
          today={today}
          onChange={(date) => {
            setFrom(date);
            if (to < date || diffDays(date, to) >= MAX_LENGTH_DAYS) setTo(date);
          }}
        />
      </Section>
      <Section title="Last day" icon="today" bare>
        <DayPicker key={from} days={lastDays} value={to} today={today} onChange={setTo} />
      </Section>
      <Muted small>
        {length === 1 ? `No school on ${shortDate(from)}.` : `No school for ${plural(length, 'day')}, ${shortDate(from)} to ${shortDate(to)}.`} Those days are planned like a Sunday, with more time to study.
      </Muted>
      {error ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button title="Add holiday" icon="check" variant="primary" block onPress={save.execute} loading={save.pending} testID="holiday-save" />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
});
