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
import { useOnboardingStore } from '../../store/onboardingStore';
import { toast } from '../../store/toastStore';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, localTodayKey, plural, shortDate } from '../../utils/format';
import { rules } from '../../utils/validation';
import { FieldHeading, StepLayout } from './StepLayout';
import { useDraftSubjects } from './useDraftSubjects';

/** Local ids for tests drafted during setup; the server assigns real ids on "Build my plan". */
let draftSequence = 0;
const nextDraftId = () => {
  draftSequence += 1;
  return `draft-${draftSequence}`;
};

const DEFAULT_DAYS_AHEAD = 10;

export function TestsStep({ navigation }) {
  const { colors } = useTheme();
  const { draft, syllabus, chosen } = useDraftSubjects();
  const addExam = useOnboardingStore((state) => state.addExam);
  const updateExam = useOnboardingStore((state) => state.updateExam);
  const removeExam = useOnboardingStore((state) => state.removeExam);
  const today = localTodayKey();
  const days = useMemo(() => Array.from({ length: 60 }, (_, index) => addDays(today, index + 1)), [today]);
  const [picked, setPicked] = useState(null);
  const [date, setDate] = useState(addDays(today, DEFAULT_DAYS_AHEAD));
  const [chapterKeys, setChapterKeys] = useState([]);
  const [chapterError, setChapterError] = useState(null);
  // Id of the draft test loaded into the form for editing, or null when adding a new one.
  const [editingId, setEditingId] = useState(null);
  const { control, handleSubmit, reset } = useForm({ defaultValues: { name: '' } });
  const current = chosen.find((item) => item.id === picked) ?? chosen[0];
  const subjectById = (id) => chosen.find((item) => item.id === id);
  const exams = draft.exams.filter((exam) => subjectById(exam.subject));

  const toggleChapter = (key) => {
    setChapterError(null);
    setChapterKeys((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]));
  };

  const clearForm = () => {
    reset({ name: '' });
    setChapterKeys([]);
    setChapterError(null);
    setEditingId(null);
    setDate(addDays(today, DEFAULT_DAYS_AHEAD));
  };

  const startEditing = (exam) => {
    setEditingId(exam.id);
    setPicked(exam.subject);
    setDate(exam.date);
    setChapterKeys(exam.chapterKeys);
    setChapterError(null);
    reset({ name: exam.name });
  };

  const onSave = handleSubmit(({ name }) => {
    if (!current) return;
    if (!chapterKeys.length) {
      setChapterError('Tick at least one chapter in this test.');
      return;
    }
    const exam = { id: editingId ?? nextDraftId(), subject: current.id, name: name.trim(), date, weight: 20, chapterKeys };
    if (editingId) updateExam(exam);
    else addExam(exam);
    toast(editingId ? `${exam.name} saved.` : `${exam.name} added.`);
    clearForm();
  });

  return (
    <StepLayout
      step={4}
      title="Upcoming tests"
      lead="Add the tests you know about. The planner works backwards from these dates."
      footer={<Button title={exams.length ? 'Continue' : 'Skip for now'} variant="primary" block disabled={editingId !== null} onPress={() => navigation.navigate('SchoolDayStep')} testID="tests-continue" />}
    >
      {exams.length ? (
        <Card flush>
          {exams.map((exam, index) => (
            <View key={exam.id}>
              {index ? <Divider /> : null}
              <View style={[styles.examRow, editingId === exam.id && { backgroundColor: colors.fill }]}>
                <SubjectDot subject={exam.subject} size={10} color={subjectById(exam.subject)?.color} />
                <View style={styles.flex}>
                  <Text style={{ color: colors.text, fontSize: 16 }}>{exam.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {subjectById(exam.subject)?.name}, {shortDate(exam.date)}, {plural(exam.chapterKeys.length, 'chapter')}
                  </Text>
                </View>
                <Button title="Edit" size="sm" icon="pencil" onPress={() => startEditing(exam)} disabled={editingId === exam.id} testID={`edit-draft-exam-${exam.id}`} />
                <Button
                  title="Remove"
                  size="sm"
                  variant="danger"
                  onPress={() => {
                    if (editingId === exam.id) clearForm();
                    removeExam(exam.id);
                  }}
                />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <FieldHeading>{editingId ? 'Edit test' : 'Add a test'}</FieldHeading>
      <ChipGroup label="Subject">
        {chosen.map((item) => (
          <Chip
            key={item.id}
            label={item.name}
            color={item.color}
            selected={current?.id === item.id}
            onPress={() => {
              if (item.id === current?.id) return;
              setPicked(item.id);
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
        {() => (
          <Card flush>
            {(current?.chapters ?? []).map((chapter, index) => (
              <View key={chapter.key}>
                {index ? <Divider /> : null}
                <CheckRow label={chapter.name} checked={chapterKeys.includes(chapter.key)} onToggle={() => toggleChapter(chapter.key)} />
              </View>
            ))}
          </Card>
        )}
      </AsyncBoundary>
      {chapterError ? <Text style={{ color: colors.danger }}>{chapterError}</Text> : null}
      {editingId ? (
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button title="Save changes" icon="check" variant="primary" block onPress={onSave} testID="tests-save" />
          </View>
          <Button title="Cancel" variant="ghost" onPress={clearForm} />
        </View>
      ) : (
        <Button title="Add this test" icon="plus" onPress={onSave} testID="tests-add" />
      )}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  examRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  flex: { flex: 1 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
