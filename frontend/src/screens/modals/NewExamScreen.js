import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { Button } from '../../components/ui/Button';
import { CheckRow, Chip, ChipGroup } from '../../components/ui/Controls';
import { FormField } from '../../components/ui/Field';
import { Card, Divider, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { examActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { subjects as subjectInfo } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays } from '../../utils/format';
import { rules } from '../../utils/validation';

const WEIGHTS = [5, 10, 20, 30, 50, 80];

export function NewExamScreen({ navigation }) {
  const profile = useResource(resources.profile);
  return (
    <Screen>
      <AsyncBoundary resource={profile}>{(data) => <ExamForm profile={data} onDone={() => navigation.goBack()} />}</AsyncBoundary>
    </Screen>
  );
}

export function ExamForm({ profile, onDone, submit = examActions.create }) {
  const { colors } = useTheme();
  const today = profile.today;
  const days = useMemo(() => Array.from({ length: 60 }, (_, index) => addDays(today, index + 1)), [today]);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm({ defaultValues: { name: '', subject: profile.subjects[0], date: addDays(today, 10), weight: 20, chapterKeys: [] } });
  const subject = watch('subject');
  const chapters = useResource(resources.chapters(subject));

  const onSubmit = handleSubmit(async (values) => {
    const created = await submit({ ...values, name: values.name.trim() });
    if (created) onDone();
  });

  return (
    <View style={{ gap: 16 }}>
      <FormField control={control} name="name" rules={rules.title('Give the test a name.')} label="Test name" placeholder={`${subjectInfo[subject].name} unit test`} />
      <Section title="Subject" bare>
        <Controller
          control={control}
          name="subject"
          render={({ field: { value, onChange } }) => (
            <ChipGroup label="Subject">
              {profile.subjects.map((id) => (
                <Chip
                  key={id}
                  label={subjectInfo[id].name}
                  color={subjectInfo[id].color}
                  selected={value === id}
                  onPress={() => {
                    onChange(id);
                    setValue('chapterKeys', []);
                  }}
                />
              ))}
            </ChipGroup>
          )}
        />
      </Section>
      <Section title="Date" bare>
        <Controller control={control} name="date" render={({ field: { value, onChange } }) => <DayPicker days={days} value={value} onChange={onChange} today={today} />} />
      </Section>
      <Section title="Weight in term grade" bare>
        <Controller
          control={control}
          name="weight"
          render={({ field: { value, onChange } }) => (
            <ChipGroup label="Weight">
              {WEIGHTS.map((weight) => (
                <Chip key={weight} label={`${weight}%`} selected={value === weight} onPress={() => onChange(weight)} />
              ))}
            </ChipGroup>
          )}
        />
      </Section>
      <Section title="Chapters in the syllabus" bare>
        <Controller
          control={control}
          name="chapterKeys"
          rules={{ validate: (value) => value.length > 0 || 'Tick at least one chapter so the planner knows what to revise.' }}
          render={({ field: { value, onChange } }) => (
            <AsyncBoundary resource={chapters}>
              {(list) => (
                <Card flush>
                  {list.map((chapter, index) => (
                    <View key={chapter.key}>
                      {index ? <Divider /> : null}
                      <CheckRow
                        label={chapter.name}
                        checked={value.includes(chapter.key)}
                        onToggle={() => onChange(value.includes(chapter.key) ? value.filter((key) => key !== chapter.key) : [...value, chapter.key])}
                      />
                    </View>
                  ))}
                </Card>
              )}
            </AsyncBoundary>
          )}
        />
      </Section>
      {errors.chapterKeys ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert">
          {errors.chapterKeys.message}
        </Text>
      ) : null}
      <Button title="Add test" variant="primary" block onPress={onSubmit} loading={isSubmitting} testID="exam-submit" />
    </View>
  );
}
