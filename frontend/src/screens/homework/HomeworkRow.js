import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SubjectDot } from '../../components/domain/Badges';
import { Icon } from '../../components/ui/Icon';
import { subjects } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { dayName, duration } from '../../utils/format';

function HomeworkRowBase({ item, today, onToggle, disabled }) {
  const { colors } = useTheme();
  const color = subjects[item.subject].color;
  return (
    <View style={[styles.row, { backgroundColor: colors.card }]}>
      <Pressable
        onPress={() => onToggle(item)}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done, disabled }}
        accessibilityLabel={`${item.done ? 'Mark not done' : 'Mark done'}: ${item.title}`}
        style={[styles.tick, { borderColor: item.done ? color : colors.fillStrong, backgroundColor: item.done ? color : 'transparent' }]}
      >
        {item.done ? <Icon name="check" size={15} color="#fff" strokeWidth={3} /> : null}
      </Pressable>
      <View style={styles.body}>
        <Text style={[styles.title, { color: item.done ? colors.textTertiary : colors.text, textDecorationLine: item.done ? 'line-through' : 'none' }]}>{item.title}</Text>
        <View style={styles.meta}>
          <SubjectDot subject={item.subject} />
          <Text style={{ color, fontSize: 13, fontWeight: '500' }}>{subjects[item.subject].name}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Due {dayName(item.due, today)}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{duration(item.mins)}</Text>
        </View>
        {item.note && !item.done ? (
          <Text style={[styles.note, { color: colors.textSecondary, backgroundColor: colors.fill }]}>
            <Text style={{ fontWeight: '700' }}>{item.teacher}: </Text>
            {item.note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const HomeworkRow = memo(HomeworkRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  tick: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 16 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  note: { fontSize: 13, padding: 8, borderRadius: 8, marginTop: 4, overflow: 'hidden' },
});
