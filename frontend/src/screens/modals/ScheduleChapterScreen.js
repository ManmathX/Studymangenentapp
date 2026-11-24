import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { DayPicker } from '../../components/domain/DayPicker';
import { Button } from '../../components/ui/Button';
import { CheckRow, SegmentedControl } from '../../components/ui/Controls';
import { Card, Divider, Muted, Screen, Section } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { chapterActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { CHAPTER_STATUS_ORDER, chapterStatus } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { capitalize, dayName, duration, shortDate } from '../../utils/format';

export function ScheduleChapterScreen({ route, navigation }) {
  const { chapterKey } = route.params;
  const proposal = useResource(resources.proposal(chapterKey));
  const today = useResource(resources.today);
  return (
    <Screen>
      <AsyncBoundary resource={proposal}>
        {(data) => <ScheduleForm data={data} today={today.data?.today ?? data.dayOptions[0]} navigation={navigation} />}
      </AsyncBoundary>
    </Screen>
  );
}

function ScheduleForm({ data, today, navigation }) {
  const { colors } = useTheme();
  const { chapter, exam } = data;
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting, errors },
  } = useForm({ defaultValues: { steps: data.steps.map((step) => ({ include: true, date: step.proposedDate })) } });
  const { fields } = useFieldArray({ control, name: 'steps' });

  useEffect(() => {
    reset({ steps: data.steps.map((step) => ({ include: true, date: step.proposedDate })) });
  }, [data.steps, reset]);

  const subjectOf = useSubjectInfo();
  const onSubmit = handleSubmit(async (values) => {
    const selections = values.steps.flatMap((step, index) => (step.include ? [{ index, date: step.date }] : []));
    if (!selections.length) {
      setError('root', { message: 'Tick at least one step to add.' });
      return;
    }
    const created = await chapterActions.schedule(chapter.key, selections, today);
    if (created) navigation.goBack();
  });

  return (
    <>
      <Card>
        <Text style={{ color: subjectOf(chapter.subject).color, fontWeight: '700' }}>{subjectOf(chapter.subject).name}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{chapter.name}</Text>
        <Muted small>
          {exam ? `In ${exam.name} on ${shortDate(exam.date)}. Steps are placed before then.` : 'No test includes this chapter yet, so steps are spread over the next two weeks.'}
        </Muted>
      </Card>

      <Section title="Where you are" bare>
        <SegmentedControl
          label="Chapter status"
          value={chapter.status}
          onChange={(status) => chapterActions.setStatus(chapter, status)}
          options={CHAPTER_STATUS_ORDER.map((status) => ({ value: status, label: chapterStatus[status].label }))}
        />
      </Section>

      {data.alreadyPlanned.length ? (
        <Section title="Already planned" flush>
          {data.alreadyPlanned.map((task, index) => (
            <View key={task.id}>
              {index ? <Divider /> : null}
              <View style={styles.planned}>
                <Text style={[styles.flex, { color: colors.text }]}>{capitalize(task.title.replace(`${chapter.name}: `, ''))}</Text>
                <Muted small>
                  {capitalize(dayName(task.date, today))}, {duration(task.mins)}
                </Muted>
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="Steps to add" bare footer={`The planner picked days with free time${exam ? ' before your test' : ''}. Change any day, or untick a step you don’t need.`}>
        <View style={{ gap: 10 }}>
          {fields.map((field, index) => {
            const step = data.steps[index];
            return (
              <Card key={field.id} flush>
                <Controller
                  control={control}
                  name={`steps.${index}.include`}
                  render={({ field: { value, onChange } }) => <CheckRow label={`${step.title} · ${duration(step.mins)}`} checked={value} onToggle={() => onChange(!value)} />}
                />
                <View style={styles.dayRow}>
                  <Controller
                    control={control}
                    name={`steps.${index}.date`}
                    render={({ field: { value, onChange } }) => <DayPicker days={data.dayOptions} value={value} onChange={onChange} today={today} />}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      </Section>
      {errors.root ? <Text style={{ color: colors.danger }}>{errors.root.message}</Text> : null}
      <Button title="Add to plan" variant="primary" block onPress={onSubmit} loading={isSubmitting} testID="schedule-submit" />
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', marginVertical: 4 },
  planned: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  flex: { flex: 1 },
  dayRow: { paddingHorizontal: 12, paddingBottom: 12 },
});
