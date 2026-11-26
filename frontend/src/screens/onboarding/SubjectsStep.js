import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SubjectDot } from '../../components/domain/Badges';
import { Button } from '../../components/ui/Button';
import { ToggleRow } from '../../components/ui/Controls';
import { Input } from '../../components/ui/Field';
import { Card, Divider, Muted } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { MAX_CUSTOM_CHAPTERS, MAX_CUSTOM_SUBJECTS, useOnboardingStore } from '../../store/onboardingStore';
import { toast } from '../../store/toastStore';
import { useTheme } from '../../theme/ThemeProvider';
import { confirmAction } from '../../utils/confirm';
import { examLabel } from '../../utils/exam';
import { plural } from '../../utils/format';
import { FieldHeading, StepLayout } from './StepLayout';
import { useDraftSubjects } from './useDraftSubjects';

export function SubjectsStep({ navigation }) {
  const { draft, syllabus, all, chosen } = useDraftSubjects();
  const toggleSubject = useOnboardingStore((state) => state.toggleSubject);
  const removeCustomSubject = useOnboardingStore((state) => state.removeCustomSubject);
  // null: form closed; 'new': adding; otherwise the id of the subject being edited.
  const [editing, setEditing] = useState(null);
  const total = chosen.reduce((sum, subject) => sum + subject.chapters.length, 0);
  const catalog = all.filter((subject) => !subject.custom);
  const custom = draft.customSubjects;

  const remove = async (subject) => {
    const confirmed = await confirmAction({
      title: `Remove ${subject.name}?`,
      message: 'Its chapters, and any test you added for it, are removed from setup.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    if (editing === subject.id) setEditing(null);
    removeCustomSubject(subject.id);
  };

  return (
    <StepLayout
      step={2}
      title="Your subjects"
      lead={`${plural(total, 'chapter')} for ${examLabel({ boardName: draft.boardName, levelName: draft.level?.name })}. Turn off any subject you don’t take, or add one that’s missing.`}
      footer={<Button title="Continue" variant="primary" block disabled={!chosen.length || editing !== null} onPress={() => navigation.navigate('TaughtStep')} testID="subjects-continue" />}
    >
      <AsyncBoundary resource={syllabus}>
        {() => (
          <Card flush>
            {catalog.map((subject, index) => (
              <View key={subject.id}>
                {index ? <Divider /> : null}
                <ToggleRow label={subject.name} hint={plural(subject.chapters.length, 'chapter')} color={subject.color} value={!draft.turnedOff.includes(subject.id)} onValueChange={() => toggleSubject(subject.id)} />
              </View>
            ))}
          </Card>
        )}
      </AsyncBoundary>

      <FieldHeading>Your own subjects</FieldHeading>
      {custom.length ? (
        <Card flush>
          {custom.map((subject, index) => (
            <View key={subject.id}>
              {index ? <Divider /> : null}
              {editing === subject.id ? (
                <CustomSubjectForm subject={subject} taken={all} onClose={() => setEditing(null)} />
              ) : (
                <CustomSubjectRow subject={subject} disabled={editing !== null} onEdit={() => setEditing(subject.id)} onRemove={() => remove(subject)} />
              )}
            </View>
          ))}
        </Card>
      ) : null}
      {editing === 'new' ? (
        <Card flush>
          <CustomSubjectForm taken={all} onClose={() => setEditing(null)} />
        </Card>
      ) : null}
      {editing === null ? (
        custom.length < MAX_CUSTOM_SUBJECTS ? (
          <Button title="Add a subject" icon="plus" onPress={() => setEditing('new')} testID="add-subject" />
        ) : (
          <Muted small>You can add up to {MAX_CUSTOM_SUBJECTS} subjects of your own.</Muted>
        )
      ) : null}
      <Muted small>Missing a subject, like Sanskrit, Computer or a language? Add it with its chapter names.</Muted>
    </StepLayout>
  );
}

function CustomSubjectRow({ subject, disabled, onEdit, onRemove }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <SubjectDot subject={subject.id} size={10} color={subject.color} />
      <View style={styles.flex}>
        <Text style={{ color: colors.text, fontSize: 16 }}>{subject.name}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{plural(subject.chapters.length, 'chapter')}</Text>
      </View>
      <Button title="Edit" size="sm" icon="pencil" onPress={onEdit} disabled={disabled} testID={`edit-subject-${subject.id}`} />
      <Button title="Remove" size="sm" variant="danger" onPress={onRemove} disabled={disabled} />
    </View>
  );
}

/** Name plus one chapter per line. `subject` set means editing it. */
function CustomSubjectForm({ subject = null, taken, onClose }) {
  const { colors } = useTheme();
  const saveCustomSubject = useOnboardingStore((state) => state.saveCustomSubject);
  const [name, setName] = useState(subject?.name ?? '');
  const [chapterText, setChapterText] = useState(subject?.chapters.join('\n') ?? '');
  const [error, setError] = useState(null);

  const save = () => {
    const cleanName = name.trim();
    const chapters = chapterText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const clash = taken.some((other) => other.id !== subject?.id && other.name.toLowerCase() === cleanName.toLowerCase());
    const problem = !cleanName
      ? 'Give the subject a name.'
      : cleanName.length > 40
        ? 'Keep the name under 40 characters.'
        : clash
          ? `You already have ${cleanName}.`
          : !chapters.length
            ? 'Add at least one chapter, one per line.'
            : chapters.length > MAX_CUSTOM_CHAPTERS
              ? `Add at most ${MAX_CUSTOM_CHAPTERS} chapters.`
              : chapters.some((chapter) => chapter.length > 80)
                ? 'Keep each chapter name under 80 characters.'
                : null;
    if (problem) {
      setError(problem);
      return;
    }
    const changedChapters = subject && subject.chapters.join('\n') !== chapters.join('\n');
    const saved = saveCustomSubject({ id: subject?.id, name: cleanName, chapters });
    if (!saved) return;
    toast(changedChapters ? `${cleanName} saved. Tick its taught chapters and tests again.` : `${cleanName} ${subject ? 'saved' : 'added'}.`);
    onClose();
  };

  return (
    <View style={styles.form}>
      <Input label="Subject name" value={name} onChangeText={setName} placeholder="e.g. Sanskrit" maxLength={40} testID="custom-subject-name" />
      <Input
        label={`Chapters, one per line (${chapterText.split('\n').filter((line) => line.trim()).length})`}
        value={chapterText}
        onChangeText={setChapterText}
        placeholder={'Sandhi\nSamasa\nKaraka'}
        multiline
        style={styles.chapters}
        testID="custom-subject-chapters"
      />
      {error ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <Button title={subject ? 'Save subject' : 'Add subject'} variant="primary" size="sm" onPress={save} testID="custom-subject-save" />
        <Button title="Cancel" size="sm" variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14 },
  flex: { flex: 1 },
  form: { gap: 10, padding: 14 },
  chapters: { minHeight: 120 },
  buttons: { flexDirection: 'row', gap: 8 },
});
