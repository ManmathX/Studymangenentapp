import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { duration } from '../../utils/format';
import { TickBox } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { SourceTag, Tag } from './Badges';

/** One task in today's list. Tapping anywhere on the row ticks it done (or undone). Suggested blocks get a tag and a dashed stripe. */
function TaskRowBase({ task, time, onToggle, onEdit, disabled = false }) {
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  const color = subjectOf(task.subject).color;
  const suggested = task.status === 'suggested';
  return (
    <Pressable
      onPress={() => onToggle(task)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: task.done, disabled }}
      accessibilityLabel={`${task.done ? 'Mark not done' : 'Mark done'}: ${task.title}`}
      testID={`task-toggle-${task.id}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.fill : 'transparent' }]}
    >
      <View style={[styles.stripe, suggested ? { borderLeftWidth: 4, borderStyle: 'dashed', borderColor: color } : { backgroundColor: color }]} />
      <TickBox checked={task.done} color={color} size={26} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: task.done ? colors.textTertiary : colors.text, textDecorationLine: task.done ? 'line-through' : 'none' }]}>{task.title}</Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color }]}>{subjectOf(task.subject).name}</Text>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>·</Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{duration(task.mins)}</Text>
          {suggested ? <Tag label="Suggested" kind="suggested" /> : <SourceTag source={task.source} />}
        </View>
      </View>
      {time ? (
        <View style={[styles.timePill, { backgroundColor: colors.fill }]}>
          <Text style={[styles.time, { color: colors.textSecondary }]}>{time}</Text>
        </View>
      ) : null}
      {onEdit && !task.done ? (
        <Pressable
          onPress={() => onEdit(task)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${task.title}`}
          testID={`task-edit-${task.id}`}
          style={({ pressed }) => [styles.edit, { backgroundColor: pressed ? colors.fillStrong : colors.fill }]}
        >
          <Icon name="pencil" size={15} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export const TaskRow = memo(TaskRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingLeft: 16, paddingRight: 12 },
  stripe: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 4, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15.5, fontWeight: '600', lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { fontSize: 12.5, fontWeight: '600' },
  timePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  edit: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
