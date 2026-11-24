import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusDot } from '../../components/domain/Badges';
import { Chip, ChipGroup } from '../../components/ui/Controls';
import { Icon } from '../../components/ui/Icon';
import { Card, Divider, Muted, Screen } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
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
    <>
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
        Class {profile.cls} {profile.boardName ?? profile.board}. Pick a chapter to schedule it.
      </Muted>
    </>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, minHeight: 46 },
  name: { flex: 1, fontSize: 16 },
});
