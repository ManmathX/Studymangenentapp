import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { subjects } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { shortDate } from '../../utils/format';
import { Divider } from '../ui/Layout';
import { EmptyState } from '../ui/States';
import { ChapterChip } from './Badges';

const ExamRow = memo(function ExamRow({ exam, onRemove, busy }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityLabel={`${exam.name} in ${exam.daysLeft} days, ${exam.readiness.revised} of ${exam.readiness.total} chapters revised`}>
      <View style={styles.days}>
        <Text style={[styles.daysNumber, { color: subjects[exam.subject].color }]}>{exam.daysLeft}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{exam.daysLeft === 1 ? 'day' : 'days'}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]}>{exam.name}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {shortDate(exam.date)}, {exam.weight}% of term grade
        </Text>
        <View style={styles.chips}>
          {exam.chapters.map((chapter) => (
            <ChapterChip key={chapter.key} name={chapter.name} status={chapter.status} />
          ))}
        </View>
      </View>
      <View style={styles.ready}>
        <Text style={[styles.readyNumber, { color: colors.text }]}>
          {exam.readiness.revised}/{exam.readiness.total}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>revised</Text>
        {onRemove ? (
          <Pressable
            onPress={() => onRemove(exam)}
            disabled={busy}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Remove test: ${exam.name}`}
            style={({ pressed }) => [styles.remove, { opacity: busy ? 0.4 : pressed ? 0.5 : 1 }]}
            testID={`remove-exam-${exam.id}`}
          >
            <Icon name="trash" size={17} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

/** Upcoming tests. Pass `onRemove` to show a remove button on each row. */
export function ExamList({ exams, onRemove, busy = false }) {
  if (!exams.length) return <EmptyState message="No tests coming up. Add one so the planner can plan revision." />;
  return exams.map((exam, index) => (
    <View key={exam.id}>
      {index ? <Divider /> : null}
      <ExamRow exam={exam} onRemove={onRemove} busy={busy} />
    </View>
  ));
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 16 },
  days: { width: 40, alignItems: 'center' },
  daysNumber: { fontSize: 24, fontWeight: '700' },
  body: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  ready: { alignItems: 'flex-end' },
  readyNumber: { fontSize: 15, fontWeight: '700' },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});
