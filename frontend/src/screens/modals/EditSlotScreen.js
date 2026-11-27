import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { SegmentedControl, Stepper } from '../../components/ui/Controls';
import { Card, Divider, Muted, Screen } from '../../components/ui/Layout';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { profileActions } from '../../services/actions';
import { useTheme } from '../../theme/ThemeProvider';
import { clockTime, duration, longDate, minutesToTime, timeToMinutes } from '../../utils/format';

const STEP = 15;
/** Lengths offered for each kind of slot. Night revision keeps its own length (what the day covered). */
const LENGTHS = {
  meal: [15, 20, 30, 45, 60],
  break: [15, 30, 45, 60],
  habit: [5, 10, 15, 30, 45, 60],
  homework: [30, 45, 60, 90],
};

/**
 * Moves, resizes or removes one slot or routine block from the calendar, for one day or every
 * day. Opened with `{ date, key, label, kind, start, end, edited }`; `kind` is 'meal', 'break',
 * 'habit', 'homework', 'study' or 'night'.
 */
export function EditSlotScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { date, key, label, kind, start: startAt, end: endAt, edited } = route.params;
  const [scope, setScope] = useState(edited === 'always' ? 'always' : 'day');
  const [start, setStart] = useState(clockTime(startAt));
  const lengths = LENGTHS[kind] ?? null;
  const [mins, setMins] = useState(() => {
    const current = endAt - startAt;
    return lengths ? (lengths.includes(current) ? current : lengths.reduce((best, value) => (Math.abs(value - current) < Math.abs(best - current) ? value : best), lengths[0])) : null;
  });
  const movable = kind !== 'study';
  const forWhen = scope === 'day' ? 'this day' : 'every day';
  const done = () => navigation.goBack();

  const save = useAsyncAction(async () => {
    const body = { key, date, scope, start, ...(mins ? { mins } : {}) };
    if (await profileActions.editSlot(body, `${label} moved to ${start} for ${forWhen}.`)) done();
  });
  const remove = useAsyncAction(async () => {
    if (await profileActions.editSlot({ key, date, scope, removed: true }, `${label} removed for ${forWhen}.`)) done();
  });
  const reset = useAsyncAction(async () => {
    if (await profileActions.resetSlot({ key, date, scope: edited }, `${label} is back as usual.`)) done();
  });
  const busy = save.pending || remove.pending || reset.pending;

  return (
    <Screen testID="edit-slot-screen">
      <View style={styles.stack}>
        <View>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {label}
          </Text>
          <Muted>
            {longDate(date)} · now {clockTime(startAt)}–{clockTime(endAt)}
            {edited ? ` · changed for ${edited === 'always' ? 'every day' : 'this day'}` : ''}
          </Muted>
        </View>

        <SegmentedControl
          label="Change it for"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'day', label: 'This day' },
            { value: 'always', label: 'Every day' },
          ]}
        />

        {movable ? (
          <Card flush>
            <Stepper label="Starts at" valueLabel={start} onDecrement={() => setStart(minutesToTime(timeToMinutes(start) - STEP))} onIncrement={() => setStart(minutesToTime(timeToMinutes(start) + STEP))} />
            {lengths ? (
              <>
                <Divider />
                <View style={styles.padded}>
                  <Muted small>How long</Muted>
                  <SegmentedControl label="How long" value={mins} onChange={setMins} options={lengths.map((value) => ({ value, label: duration(value) }))} />
                </View>
              </>
            ) : null}
          </Card>
        ) : (
          <Muted small>Self study is all the free time left after your other slots. Move those, or remove self study for {forWhen} to keep the time free.</Muted>
        )}

        {movable ? <Button title={`Save for ${forWhen}`} icon="check" variant="primary" block onPress={save.execute} loading={save.pending} disabled={busy} testID="save-slot" /> : null}
        <Button title={`Remove for ${forWhen}`} icon="trash" variant="danger" block onPress={remove.execute} loading={remove.pending} disabled={busy} testID="remove-slot" />
        {edited ? <Button title="Back to usual" block onPress={reset.execute} loading={reset.pending} disabled={busy} testID="reset-slot" /> : null}
        <Muted small>If the new time is taken, the slot uses the free part of it. Tasks keep their day; the plan for that day is laid out again.</Muted>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  padded: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
});
