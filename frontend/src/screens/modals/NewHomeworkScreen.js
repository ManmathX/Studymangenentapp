import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup, SegmentedControl, Stepper } from '../../components/ui/Controls';
import { FormField } from '../../components/ui/Field';
import { BLOCK_GAP, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { DEFAULT_HOMEWORK_MINS, MAX_HOMEWORK_MINS, splitHomework } from '../../data/core/engine';
import { useResource } from '../../hooks/useResource';
import { homeworkActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, dayName, duration } from '../../utils/format';
import { rules } from '../../utils/validation';

export const HOMEWORK_MINUTES = [15, 30, 45, 60, 90, 120];
const CUSTOM_STEP = 15;

export function NewHomeworkScreen({ navigation }) {
  const profile = useResource(resources.profile);
  return (
    <Screen>
      <AsyncBoundary resource={profile}>{(data) => <HomeworkForm profile={data} onDone={() => navigation.goBack()} />}</AsyncBoundary>
    </Screen>
  );
}

export function HomeworkForm({ profile, onDone, submit = homeworkActions.create }) {
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  const today = profile.today;
  const [custom, setCustom] = useState(false);
  const days = useMemo(() => Array.from({ length: 31 }, (_, index) => addDays(today, index)), [today]);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm({ defaultValues: { title: '', note: '', subject: profile.subjects[0], due: addDays(today, 2), mins: 30, difficulty: 2 } });

  const onSubmit = handleSubmit(async (values) => {
    const result = await submit({ ...values, title: values.title.trim(), note: values.note.trim() }, today);
    if (result) onDone();
  });

  return (
    <View style={{ gap: BLOCK_GAP }}>
      <FormField control={control} name="title" rules={rules.title('Write what the homework is, for example "Exercise 8.2".')} label="What to do" placeholder="e.g. Exercise 8.2" />
      <FormField control={control} name="note" rules={{ maxLength: { value: 500, message: 'Keep the note under 500 characters' } }} label="Teacher’s note (optional)" placeholder="Anything the teacher said" multiline />
      <Section title="Subject" icon="book" bare>
        <Controller
          control={control}
          name="subject"
          render={({ field: { value, onChange } }) => (
            <ChipGroup label="Subject">
              {profile.subjects.map((id) => (
                <Chip key={id} label={subjectOf(id).name} color={subjectOf(id).color} selected={value === id} onPress={() => onChange(id)} />
              ))}
            </ChipGroup>
          )}
        />
      </Section>
      <Section title="When is it due?" icon="today" bare>
        <Controller control={control} name="due" render={({ field: { value, onChange } }) => <DayPicker days={days} value={value} onChange={onChange} today={today} />} />
      </Section>
      <Section title="How long will it take?" icon="clock" bare>
        <Controller
          control={control}
          name="mins"
          render={({ field: { value, onChange } }) => (
            <TimeNeeded value={value} onChange={onChange} custom={custom} setCustom={setCustom} />
          )}
        />
        <SplitPreview control={control} today={today} slot={profile.homeworkMins ?? DEFAULT_HOMEWORK_MINS} />
      </Section>
      <Section title="How hard is it?" icon="bolt" bare>
        <Controller
          control={control}
          name="difficulty"
          render={({ field: { value, onChange } }) => (
            <SegmentedControl label="Difficulty" value={value} onChange={onChange} options={[{ value: 1, label: 'Easy' }, { value: 2, label: 'Medium' }, { value: 3, label: 'Hard' }]} />
          )}
        />
      </Section>
      {errors.root ? <Text style={{ color: colors.danger }}>{errors.root.message}</Text> : null}
      <Muted small>You can move or change any of these tasks in Plan.</Muted>
      <Button title="Add homework" icon="plus" variant="primary" block onPress={onSubmit} loading={isSubmitting} testID="homework-submit" />
    </View>
  );
}

/** Preset lengths, or "Custom" with a stepper in 15-minute steps up to 10 hours. */
function TimeNeeded({ value, onChange, custom, setCustom }) {
  const step = (delta) => onChange(Math.min(MAX_HOMEWORK_MINS, Math.max(CUSTOM_STEP, Math.round((value + delta) / CUSTOM_STEP) * CUSTOM_STEP)));
  return (
    <View style={{ gap: 10 }}>
      <ChipGroup label="Time needed">
        {HOMEWORK_MINUTES.map((minutes) => (
          <Chip
            key={minutes}
            label={duration(minutes)}
            selected={!custom && value === minutes}
            onPress={() => {
              setCustom(false);
              onChange(minutes);
            }}
          />
        ))}
        <Chip label="Custom" selected={custom} onPress={() => setCustom(true)} testID="homework-custom-time" />
      </ChipGroup>
      {custom ? <Stepper label="Time needed" valueLabel={duration(value)} onDecrement={() => step(-CUSTOM_STEP)} onIncrement={() => step(CUSTOM_STEP)} /> : null}
    </View>
  );
}

/** Says whether the homework fits one day's Homework slot or how it will be spread before the due date. */
function SplitPreview({ control, today, slot }) {
  const [mins, due] = useWatch({ control, name: ['mins', 'due'] });
  const last = due > today ? addDays(due, -1) : today;
  const days = [];
  for (let date = today; date <= last; date = addDays(date, 1)) days.push(date);
  const parts = splitHomework(mins, days, () => slot);
  if (parts.length <= 1) {
    return <Muted small>{mins > slot ? `More than your ${duration(slot)} homework time, but it’s due soon, so it’s all planned for ${dayName(last, today)}.` : `Planned for ${dayName(parts[0]?.date ?? last, today)}.`}</Muted>;
  }
  return (
    <Muted small>
      {`Longer than your ${duration(slot)} daily homework time, so it’s split over ${parts.length} days: `}
      {parts.map((part) => `${dayName(part.date, today)} ${duration(part.mins)}`).join(', ')}.
    </Muted>
  );
}
