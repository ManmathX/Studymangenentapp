import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSubjectInfo } from '../../store/subjectStore';
import { Icon } from '../ui/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { shortDate } from '../../utils/format';
import { Divider } from '../ui/Layout';
import { EmptyState } from '../ui/States';
import { ChapterChip } from './Badges';

const ExamRow = memo(function ExamRow({ exam, onEdit, onRemove, busy }) {
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  return (
    <View style={styles.row} accessibilityLabel={`${exam.name} in ${exam.daysLeft} days, ${exam.readiness.revised} of ${exam.readiness.total} chapters revised`}>
      <View style={[styles.days, { backgroundColor: `${subjectOf(exam.subject).color}1A` }]}>
        <Text style={[styles.daysNumber, { color: subjectOf(exam.subject).color }]}>{exam.daysLeft}</Text>
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
        <View style={styles.actions}>
        {onEdit ? (
          <Pressable
            onPress={() => onEdit(exam)}
            disabled={busy}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Edit test: ${exam.name}`}
            style={({ pressed }) => [styles.action, { opacity: busy ? 0.4 : pressed ? 0.5 : 1 }]}
            testID={`edit-exam-${exam.id}`}
          >
            <Icon name="pencil" size={17} color={colors.tint} />
          </Pressable>
        ) : null}
        {onRemove ? (
          <Pressable
            onPress={() => onRemove(exam)}
            disabled={busy}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Remove test: ${exam.name}`}
            style={({ pressed }) => [styles.action, { opacity: busy ? 0.4 : pressed ? 0.5 : 1 }]}
            testID={`remove-exam-${exam.id}`}
          >
            <Icon name="trash" size={17} color={colors.textTertiary} />
          </Pressable>
        ) : null}
        </View>
      </View>
    </View>
  );
});

/** Upcoming tests. Pass `onEdit` / `onRemove` to show edit and remove buttons on each row. */
export function ExamList({ exams, onEdit, onRemove, busy = false }) {
  if (!exams.length) return <EmptyState icon="trophy" message="No tests coming up. Add one so the planner can plan revision." />;
  return exams.map((exam, index) => (
    <View key={exam.id}>
      {index ? <Divider /> : null}
      <ExamRow exam={exam} onEdit={onEdit} onRemove={onRemove} busy={busy} />
    </View>
  ));
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  days: { width: 44, paddingVertical: 4, borderRadius: 12, alignItems: 'center' },
  daysNumber: { fontSize: 21, fontWeight: '800' },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  ready: { alignItems: 'flex-end' },
  readyNumber: { fontSize: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 2, marginTop: 6 },
  action: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
