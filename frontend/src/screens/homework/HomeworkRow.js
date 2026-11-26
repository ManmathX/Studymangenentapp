import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TickBox } from '../../components/ui/Controls';
import { Icon } from '../../components/ui/Icon';
import { useSubjectInfo } from '../../store/subjectStore';
import { useTheme } from '../../theme/ThemeProvider';
import { dayName, duration } from '../../utils/format';

/** One homework item. Tap the tick or the text to mark it done; the bin deletes it. */
function HomeworkRowBase({ item, today, onToggle, onDelete, disabled }) {
  const { colors, radius } = useTheme();
  const subjectOf = useSubjectInfo();
  const color = subjectOf(item.subject).color;
  const overdue = !item.done && item.due < today;
  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.lg, boxShadow: colors.shadow }]}>
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <Pressable
        onPress={() => onToggle(item)}
        disabled={disabled}
        hitSlop={4}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done, disabled }}
        accessibilityLabel={`${item.done ? 'Mark not done' : 'Mark done'}: ${item.title}`}
        style={styles.main}
      >
        <TickBox checked={item.done} color={color} size={26} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: item.done ? colors.textTertiary : colors.text, textDecorationLine: item.done ? 'line-through' : 'none' }]}>{item.title}</Text>
          <View style={styles.meta}>
            <Text style={[styles.metaText, { color }]}>{subjectOf(item.subject).name}</Text>
            <View style={[styles.duePill, { backgroundColor: overdue ? colors.dangerSoft : colors.fill }]}>
              <Text style={[styles.metaText, { color: overdue ? colors.danger : colors.textSecondary }]}>Due {dayName(item.due, today)}</Text>
            </View>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{duration(item.mins)}</Text>
          </View>
          {item.note && !item.done ? (
            <Text style={[styles.note, { color: colors.textSecondary, backgroundColor: colors.fill }]}>
              <Text style={{ fontWeight: '700' }}>{item.teacher}: </Text>
              {item.note}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {onDelete ? (
        <Pressable
          onPress={() => onDelete(item)}
          disabled={disabled}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Delete homework: ${item.title}`}
          style={({ pressed }) => [styles.delete, { backgroundColor: pressed ? colors.dangerSoft : 'transparent', opacity: disabled ? 0.4 : 1 }]}
          testID={`delete-homework-${item.id}`}
        >
          <Icon name="trash" size={17} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const HomeworkRow = memo(HomeworkRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 11, paddingLeft: 14, paddingRight: 6, marginBottom: 8, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  main: { flex: 1, flexDirection: 'row', gap: 11 },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 15.5, fontWeight: '600', lineHeight: 20 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12.5, fontWeight: '600' },
  duePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  note: { fontSize: 12.5, padding: 8, borderRadius: 8, marginTop: 2, overflow: 'hidden', lineHeight: 17 },
  delete: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
