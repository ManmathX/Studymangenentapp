import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup } from '../../components/ui/Controls';
import { FormField } from '../../components/ui/Field';
import { BLOCK_GAP, Card, Muted, Screen, Section } from '../../components/ui/Layout';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { taskActions } from '../../services/actions';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, duration } from '../../utils/format';
import { confirmAction } from '../../utils/confirm';
import { rules } from '../../utils/validation';

const LENGTHS = [10, 15, 20, 30, 45, 60, 90, 120];
/** Same window the planner works in: today and the next 13 days. */
const DAYS_AHEAD = 13;

/**
 * Edits one task in the plan (opened with `{ task, today }`), whether the planner suggested it or the
 * student added it: what it is, how long, and which day. Saving a suggested block keeps it.
 */
export function EditTaskScreen({ navigation, route }) {
  const { task, today } = route.params;
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  const days = useMemo(() => {
    const list = Array.from({ length: DAYS_AHEAD + 1 }, (_, index) => addDays(today, index));
    return list.includes(task.date) || task.date < today ? list : [...list, task.date];
  }, [today, task.date]);
  const lengths = LENGTHS.includes(task.mins) ? LENGTHS : [...LENGTHS, task.mins].sort((a, b) => a - b);
  const suggested = task.status === 'suggested';

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({ defaultValues: { title: task.title, mins: task.mins, date: task.date < today ? today : task.date } });

  const onSubmit = handleSubmit(async (values) => {
    const saved = await taskActions.edit(task, { title: values.title.trim(), mins: values.mins, date: values.date }, today);
    if (saved) navigation.goBack();
  });

  const remove = useAsyncAction(async () => {
    const ok = await confirmAction({ title: 'Delete this task?', message: `“${task.title}” will be taken out of your plan.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    const removed = await taskActions.remove(task);
    if (removed) navigation.goBack();
  });

  return (
    <Screen>
      <View style={{ gap: BLOCK_GAP }}>
        <Card style={{ gap: 4 }}>
          <Text style={{ color: subjectOf(task.subject).color, fontWeight: '700' }}>{subjectOf(task.subject).name}</Text>
          <Muted small>{suggested ? 'Suggested by the planner. Saving your changes keeps it in your plan.' : 'In your plan.'}</Muted>
        </Card>
        <FormField control={control} name="title" rules={rules.title('Write what the task is.')} label="What to do" placeholder="Revision: key points" />
        <Section title="How long" icon="clock" bare>
          <Controller
            control={control}
            name="mins"
            render={({ field: { value, onChange } }) => (
              <ChipGroup label="Length">
                {lengths.map((mins) => (
                  <Chip key={mins} label={duration(mins)} selected={value === mins} onPress={() => onChange(mins)} />
                ))}
              </ChipGroup>
            )}
          />
        </Section>
        <Section title="Day" icon="today" bare>
          <Controller control={control} name="date" render={({ field: { value, onChange } }) => <DayPicker days={days} value={value} onChange={onChange} today={today} />} />
        </Section>
        <Button title="Save changes" variant="primary" block onPress={onSubmit} loading={isSubmitting} disabled={remove.pending} testID="task-save" />
        <Button title="Delete task" icon="trash" variant="danger" block onPress={remove.execute} loading={remove.pending} disabled={isSubmitting} testID="task-delete" />
        <Text style={{ color: colors.textTertiary, fontSize: 12, textAlign: 'center' }}>Changes only affect this task.</Text>
      </View>
    </Screen>
  );
}
