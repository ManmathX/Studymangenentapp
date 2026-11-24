import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup, SegmentedControl } from '../../components/ui/Controls';
import { FormField } from '../../components/ui/Field';
import { Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { homeworkActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, duration } from '../../utils/format';
import { rules } from '../../utils/validation';

export const HOMEWORK_MINUTES = [15, 20, 30, 40, 45, 60, 90];

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
    <View style={{ gap: 16 }}>
      <FormField control={control} name="title" rules={rules.title('Write what the homework is, for example "Exercise 8.2".')} label="What to do" placeholder="e.g. Exercise 8.2" />
      <FormField control={control} name="note" rules={{ maxLength: { value: 500, message: 'Keep the note under 500 characters' } }} label="Teacher’s note (optional)" placeholder="Anything the teacher said" multiline />
      <Section title="Subject" bare>
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
      <Section title="Due" bare>
        <Controller control={control} name="due" render={({ field: { value, onChange } }) => <DayPicker days={days} value={value} onChange={onChange} today={today} />} />
      </Section>
      <Section title="Time needed" bare>
        <Controller
          control={control}
          name="mins"
          render={({ field: { value, onChange } }) => (
            <ChipGroup label="Time needed">
              {HOMEWORK_MINUTES.map((minutes) => (
                <Chip key={minutes} label={duration(minutes)} selected={value === minutes} onPress={() => onChange(minutes)} />
              ))}
            </ChipGroup>
          )}
        />
      </Section>
      <Section title="Difficulty" bare>
        <Controller
          control={control}
          name="difficulty"
          render={({ field: { value, onChange } }) => (
            <SegmentedControl label="Difficulty" value={value} onChange={onChange} options={[{ value: 1, label: 'Easy' }, { value: 2, label: 'Medium' }, { value: 3, label: 'Hard' }]} />
          )}
        />
      </Section>
      {errors.root ? <Text style={{ color: colors.danger }}>{errors.root.message}</Text> : null}
      <Muted small>The planner adds a task the day before it’s due. You can move it in Plan.</Muted>
      <Button title="Add homework" variant="primary" block onPress={onSubmit} loading={isSubmitting} testID="homework-submit" />
    </View>
  );
}
