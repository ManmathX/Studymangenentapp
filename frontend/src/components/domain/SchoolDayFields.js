import { StyleSheet, Text, View } from 'react-native';
import { MAX_TUITIONS } from '../../data/core/engine';
import { useTheme } from '../../theme/ThemeProvider';
import { minutesToTime, timeToMinutes } from '../../utils/format';
import { newTuition } from '../../utils/tuitions';
import { Button } from '../ui/Button';
import { Chip, ChipGroup, Stepper } from '../ui/Controls';
import { Input } from '../ui/Field';
import { Card, Divider, Muted } from '../ui/Layout';

const WEEKDAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
];
const STEP_MINUTES = 15;

/**
 * School hours and the student's tuitions, each with its own name, days and times.
 * `value` is `{ schoolStart, schoolEnd, tuitions: [{ key, name, days, start, end }] }` with
 * "HH:MM" times; `onChange` gets only the fields that changed. Used at setup and in Profile.
 */
export function SchoolDayFields({ value, onChange }) {
  const shiftSchool = (field, delta) => onChange({ [field]: minutesToTime(timeToMinutes(value[field]) + delta) });
  const setTuitions = (tuitions) => onChange({ tuitions });
  const editTuition = (key, patch) => setTuitions(value.tuitions.map((tuition) => (tuition.key === key ? { ...tuition, ...patch } : tuition)));
  const addTuition = () => {
    const last = value.tuitions.at(-1);
    setTuitions([...value.tuitions, newTuition(last ? { start: last.end } : {})]);
  };

  return (
    <View style={styles.stack}>
      <Card flush>
        <Stepper label="School starts" valueLabel={value.schoolStart} onDecrement={() => shiftSchool('schoolStart', -STEP_MINUTES)} onIncrement={() => shiftSchool('schoolStart', STEP_MINUTES)} />
        <Divider />
        <Stepper label="School ends" valueLabel={value.schoolEnd} onDecrement={() => shiftSchool('schoolEnd', -STEP_MINUTES)} onIncrement={() => shiftSchool('schoolEnd', STEP_MINUTES)} />
      </Card>

      {value.tuitions.map((tuition, index) => (
        <TuitionCard
          key={tuition.key}
          tuition={tuition}
          index={index}
          onChange={(patch) => editTuition(tuition.key, patch)}
          onRemove={() => setTuitions(value.tuitions.filter((item) => item.key !== tuition.key))}
        />
      ))}
      {value.tuitions.length ? null : <Muted small>No tuition added. Add one for each tuition or coaching class you go to.</Muted>}
      {value.tuitions.length < MAX_TUITIONS ? (
        <Button title={value.tuitions.length ? 'Add another tuition' : 'Add tuition'} icon="plus" onPress={addTuition} testID="add-tuition" />
      ) : (
        <Muted small>You can add up to {MAX_TUITIONS} tuitions.</Muted>
      )}
    </View>
  );
}

function TuitionCard({ tuition, index, onChange, onRemove }) {
  const { colors } = useTheme();
  const label = tuition.name.trim() || `Tuition ${index + 1}`;
  const shift = (field, delta) => onChange({ [field]: minutesToTime(timeToMinutes(tuition[field]) + delta) });
  const toggleDay = (day) =>
    onChange({ days: tuition.days.includes(day) ? tuition.days.filter((item) => item !== day) : [...tuition.days, day].sort((a, b) => a - b) });

  return (
    <Card flush>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Button title="Remove" icon="trash" size="sm" variant="ghost" onPress={onRemove} testID={`remove-tuition-${index}`} />
      </View>
      <View style={styles.body}>
        <Input label="Name (optional)" value={tuition.name} onChangeText={(name) => onChange({ name })} placeholder="e.g. Maths tuition" maxLength={40} testID={`tuition-${index}-name`} />
        <ChipGroup label={`${label} days`}>
          {WEEKDAYS.map(({ day, label: dayLabel }) => (
            <Chip key={day} label={dayLabel} selected={tuition.days.includes(day)} onPress={() => toggleDay(day)} testID={`tuition-${index}-day-${day}`} />
          ))}
        </ChipGroup>
      </View>
      <Divider />
      <Stepper label={`${label} starts`} valueLabel={tuition.start} onDecrement={() => shift('start', -STEP_MINUTES)} onIncrement={() => shift('start', STEP_MINUTES)} />
      <Divider />
      <Stepper label={`${label} ends`} valueLabel={tuition.end} onDecrement={() => shift('end', -STEP_MINUTES)} onIncrement={() => shift('end', STEP_MINUTES)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8, paddingTop: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
});
