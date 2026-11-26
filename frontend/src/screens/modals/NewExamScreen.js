import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { Button } from '../../components/ui/Button';
import { CheckRow, Chip, ChipGroup } from '../../components/ui/Controls';
import { FormField } from '../../components/ui/Field';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { examActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays } from '../../utils/format';
import { rules } from '../../utils/validation';

const WEIGHTS = [5, 10, 20, 30, 50, 80];
const DAYS_AHEAD = 60;

/** New test, or editing one when opened with `{ exam }` (the EditExam route). */
export function NewExamScreen({ navigation, route }) {
  const profile = useResource(resources.profile);
  const exam = route?.params?.exam ?? null;
  return (
    <Screen>
      <AsyncBoundary resource={profile}>{(data) => <ExamForm profile={data} exam={exam} onDone={() => navigation.goBack()} />}</AsyncBoundary>
    </Screen>
  );
}

/** The days a test can be on: tomorrow onwards, plus the test's own date when editing one that is further out or today. */
function pickableDays(today, current) {
  const days = Array.from({ length: DAYS_AHEAD }, (_, index) => addDays(today, index + 1));
  if (current && !days.includes(current)) {
    if (current < days[0]) days.unshift(current);
    else days.push(current);
  }
  return days;
}

export function ExamForm({ profile, exam = null, onDone, submit }) {
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  const today = profile.today;
  const editing = Boolean(exam);
  const days = useMemo(() => pickableDays(today, exam?.date), [today, exam?.date]);
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm({
    defaultValues: exam
      ? { name: exam.name, subject: exam.subject, date: exam.date, weight: exam.weight, chapterKeys: exam.chapterKeys }
      : { name: '', subject: profile.subjects[0], date: addDays(today, 10), weight: 20, chapterKeys: [] },
  });
  const subject = useWatch({ control, name: 'subject' });
  const chapters = useResource(resources.chapters(subject));
  const weights = exam && !WEIGHTS.includes(exam.weight) ? [...WEIGHTS, exam.weight].sort((a, b) => a - b) : WEIGHTS;

  const onSubmit = handleSubmit(async (values) => {
    const body = { ...values, name: values.name.trim() };
    const save = submit ?? (editing ? (changes) => examActions.update(exam.id, changes) : examActions.create);
    const saved = await save(body);
    if (saved) onDone();
  });

  return (
    <View style={{ gap: 16 }}>
      <FormField control={control} name="name" rules={rules.title('Give the test a name.')} label="Test name" placeholder={`${subjectOf(subject).name} unit test`} />
      <Section title="Subject" bare>
        <Controller
          control={control}
          name="subject"
          render={({ field: { value, onChange } }) => (
            <ChipGroup label="Subject">
              {profile.subjects.map((id) => (
                <Chip
                  key={id}
                  label={subjectOf(id).name}
                  color={subjectOf(id).color}
                  selected={value === id}
                  onPress={() => {
                    if (id === value) return;
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
              {weights.map((weight) => (
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
      {editing ? <Muted small>Study blocks already in your plan stay. Use “Schedule from syllabus” in Plan to add more.</Muted> : null}
      <Button title={editing ? 'Save changes' : 'Add test'} variant="primary" block onPress={onSubmit} loading={isSubmitting} testID="exam-submit" />
    </View>
  );
}
