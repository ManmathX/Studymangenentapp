import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { duration } from '../../utils/format';
import { Icon } from '../ui/Icon';
import { SourceTag, SubjectDot } from './Badges';

function TaskRowBase({ task, time, onToggle, disabled = false }) {
  const { colors } = useTheme();
  const subjectOf = useSubjectInfo();
  const color = subjectOf(task.subject).color;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onToggle(task)}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done, disabled }}
        accessibilityLabel={`${task.done ? 'Mark not done' : 'Mark done'}: ${task.title}`}
        testID={`task-toggle-${task.id}`}
        style={[styles.tick, { borderColor: task.done ? color : colors.fillStrong, backgroundColor: task.done ? color : 'transparent' }]}
      >
        {task.done ? <Icon name="check" size={15} color="#fff" strokeWidth={3} /> : null}
      </Pressable>
      <View style={styles.body}>
        <Text style={[styles.title, { color: task.done ? colors.textTertiary : colors.text, textDecorationLine: task.done ? 'line-through' : 'none' }]}>{task.title}</Text>
        <View style={styles.meta}>
          <SubjectDot subject={task.subject} />
          <Text style={[styles.metaText, { color }]}>{subjectOf(task.subject).name}</Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{duration(task.mins)}</Text>
          <SourceTag source={task.source} />
        </View>
      </View>
      {time ? <Text style={[styles.time, { color: colors.textSecondary }]}>{time}</Text> : null}
    </View>
  );
}

export const TaskRow = memo(TaskRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  tick: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 16, lineHeight: 21 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: 13, fontWeight: '500' },
  time: { fontSize: 14, fontVariant: ['tabular-nums'] },
});
