import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { SubjectDot } from '../../components/domain/Badges';
import { DayPicker } from '../../components/domain/DayPicker';
import { Button } from '../../components/ui/Button';
import { CheckRow, Chip, ChipGroup } from '../../components/ui/Controls';
import { FormField } from '../../components/ui/Field';
import { Card, Divider } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { resources } from '../../services/resources';
import { useOnboardingStore } from '../../store/onboardingStore';
import { toast } from '../../store/toastStore';
import { subjects as subjectInfo } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, localTodayKey, plural, shortDate } from '../../utils/format';
import { rules } from '../../utils/validation';
import { FieldHeading, StepLayout } from './StepLayout';

/** Local ids for tests drafted during setup; the server assigns real ids on "Build my plan". */
let draftSequence = 0;
const nextDraftId = () => {
  draftSequence += 1;
  return `draft-${draftSequence}`;
};

export function TestsStep({ navigation }) {
  const { colors } = useTheme();
  const draft = useOnboardingStore((state) => state.draft);
  const addExam = useOnboardingStore((state) => state.addExam);
  const removeExam = useOnboardingStore((state) => state.removeExam);
  const syllabus = useResource(resources.syllabus(draft.cls ?? 9), { enabled: Boolean(draft.cls) });
  const today = localTodayKey();
  const days = useMemo(() => Array.from({ length: 60 }, (_, index) => addDays(today, index + 1)), [today]);
  const [subject, setSubject] = useState(draft.subjects[0]);
  const [date, setDate] = useState(addDays(today, 10));
  const [chapterKeys, setChapterKeys] = useState([]);
  const [chapterError, setChapterError] = useState(null);
  const { control, handleSubmit, reset } = useForm({ defaultValues: { name: '' } });

  const toggleChapter = (key) => {
    setChapterError(null);
    setChapterKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const onAdd = handleSubmit(({ name }) => {
    if (!chapterKeys.length) {
      setChapterError('Tick at least one chapter in this test.');
      return;
    }
    addExam({ id: nextDraftId(), subject, name: name.trim(), date, weight: 20, chapterKeys });
    reset({ name: '' });
    setChapterKeys([]);
    toast(`${name.trim()} added.`);
  });

  return (
    <StepLayout
      step={4}
      title="Upcoming tests"
      lead="Add the tests you know about. The planner works backwards from these dates."
      footer={<Button title={draft.exams.length ? 'Continue' : 'Skip for now'} variant="primary" block onPress={() => navigation.navigate('SchoolDayStep')} testID="tests-continue" />}
    >
      {draft.exams.length ? (
        <Card flush>
          {draft.exams.map((exam, index) => (
            <View key={exam.id}>
              {index ? <Divider /> : null}
              <View style={styles.examRow}>
                <SubjectDot subject={exam.subject} size={10} />
                <View style={styles.flex}>
                  <Text style={{ color: colors.text, fontSize: 16 }}>{exam.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {shortDate(exam.date)}, {plural(exam.chapterKeys.length, 'chapter')}
                  </Text>
                </View>
                <Button title="Remove" size="sm" variant="danger" onPress={() => removeExam(exam.id)} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <FieldHeading>Add a test</FieldHeading>
      <ChipGroup label="Subject">
        {draft.subjects.map((id) => (
          <Chip
            key={id}
            label={subjectInfo[id].name}
            color={subjectInfo[id].color}
            selected={subject === id}
            onPress={() => {
              setSubject(id);
              setChapterKeys([]);
            }}
          />
        ))}
      </ChipGroup>
      <FormField control={control} name="name" rules={rules.title('Give the test a name, for example "Periodic test 2".')} placeholder="Name, e.g. Periodic test 2" label="Test name" />
      <FieldHeading>Date</FieldHeading>
      <DayPicker days={days} value={date} onChange={setDate} today={today} />
      <FieldHeading>Chapters in this test</FieldHeading>
      <AsyncBoundary resource={syllabus}>
        {(catalog) => (
          <Card flush>
            {(catalog.find((item) => item.id === subject)?.chapters ?? []).map((chapter, index) => (
              <View key={chapter.key}>
                {index ? <Divider /> : null}
                <CheckRow label={chapter.name} checked={chapterKeys.includes(chapter.key)} onToggle={() => toggleChapter(chapter.key)} />
              </View>
            ))}
          </Card>
        )}
      </AsyncBoundary>
      {chapterError ? <Text style={{ color: colors.danger }}>{chapterError}</Text> : null}
      <Button title="Add this test" icon="plus" onPress={onAdd} testID="tests-add" />
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  examRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  flex: { flex: 1 },
});
