import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusDot } from '../../components/domain/Badges';
import { Button } from '../../components/ui/Button';
import { Chip, ChipGroup } from '../../components/ui/Controls';
import { Input } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { Card, Divider, Muted, Screen, Stack } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useResource } from '../../hooks/useResource';
import { profileActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { chapterStatus } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

export function SyllabusScreen({ navigation }) {
  const profile = useResource(resources.profile);
  return (
    <Screen>
      <AsyncBoundary resource={profile}>{(data) => <SyllabusBody profile={data} navigation={navigation} />}</AsyncBoundary>
    </Screen>
  );
}

function SyllabusBody({ profile, navigation }) {
  const [subject, setSubject] = useState(profile.subjects[0]);
  const chapters = useResource(resources.chapters(subject));
  const subjectOf = useSubjectInfo();
  return (
    <Stack>
      <ChipGroup label="Subject">
        {profile.subjects.map((id) => (
          <Chip key={id} label={subjectOf(id).name} color={subjectOf(id).color} selected={subject === id} onPress={() => setSubject(id)} />
        ))}
      </ChipGroup>
      <AsyncBoundary resource={chapters}>
        {(list) => (
          <Card flush>
            {list.map((chapter, index) => (
              <View key={chapter.key}>
                {index ? <Divider /> : null}
                <ChapterRow chapter={chapter} onPress={() => navigation.navigate('ScheduleChapter', { chapterKey: chapter.key })} />
              </View>
            ))}
          </Card>
        )}
      </AsyncBoundary>
      <Muted small>
        Class {profile.cls} {profile.boardName ?? profile.board}. 1. Pick a subject above. 2. Tap a chapter to plan when you’ll study it.
      </Muted>
      <AddSubject onAdded={setSubject} />
    </Stack>
  );
}

/** A subject the student studies but didn't add at setup, with its own chapter list. */
function AddSubject({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [chapterText, setChapterText] = useState('');
  const chapters = chapterText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const add = useAsyncAction(async () => {
    const added = await profileActions.addSubject({ name, chapters });
    if (!added) return;
    setOpen(false);
    setName('');
    setChapterText('');
    onAdded(added.id);
  });

  if (!open) return <Button title="Add a subject" icon="plus" onPress={() => setOpen(true)} testID="add-subject" />;
  return (
    <Card style={styles.form}>
      <Input label="Subject name" value={name} onChangeText={setName} placeholder="e.g. Sanskrit" maxLength={40} testID="new-subject-name" />
      <Input
        label={`Chapters, one per line (${chapters.length})`}
        value={chapterText}
        onChangeText={setChapterText}
        placeholder={'Sandhi\nSamasa\nKaraka'}
        multiline
        style={styles.chapters}
        testID="new-subject-chapters"
      />
      <View style={styles.buttons}>
        <Button title="Add subject" variant="primary" size="sm" onPress={add.execute} loading={add.pending} testID="new-subject-save" />
        <Button title="Cancel" size="sm" variant="ghost" onPress={() => setOpen(false)} disabled={add.pending} />
      </View>
    </Card>
  );
}

const ChapterRow = memo(function ChapterRow({ chapter, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.fill : 'transparent' }]} testID={`chapter-${chapter.key}`}>
      <StatusDot status={chapter.status} />
      <Text style={[styles.name, { color: colors.text }]}>{chapter.name}</Text>
      {chapter.plannedCount ? (
        <Text style={{ color: colors.tint, fontSize: 12, fontWeight: '600' }}>{chapter.plannedCount} planned</Text>
      ) : (
        <Muted small>{chapterStatus[chapter.status].label}</Muted>
      )}
      <Icon name="chevron" size={14} color={colors.textTertiary} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, minHeight: 46 },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
  form: { gap: 10 },
  chapters: { minHeight: 120 },
  buttons: { flexDirection: 'row', gap: 8 },
});
