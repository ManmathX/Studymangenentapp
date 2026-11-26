import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSubjectInfo } from '../../store/subjectStore';
import { chapterStatus } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { Hatch } from './Hatch';

export const StatusDot = memo(function StatusDot({ status, size = 10 }) {
  const { colors } = useTheme();
  const info = chapterStatus[status];
  const color = info?.hatch ? null : info?.color;
  return (
    <View
      accessibilityLabel={info?.label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: color ?? 'transparent',
        borderWidth: color ? 0 : info?.hatch ? 1 : 1.5,
        borderColor: colors.fillStrong,
      }}
    >
      {info?.hatch ? <Hatch gap={3} /> : null}
    </View>
  );
});

/** Pass `color` when the subject isn't on the profile yet (during setup). */
export const SubjectDot = memo(function SubjectDot({ subject, size = 8, color }) {
  const subjectOf = useSubjectInfo();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? subjectOf(subject).color }} />;
});

const TAG_COLORS = { app: '#007AFF', teacher: '#AF52DE', parent: '#FF9500', high: '#FF3B30', medium: '#FF9500', suggested: '#007AFF' };

export const Tag = memo(function Tag({ label, kind }) {
  const color = TAG_COLORS[kind] ?? '#8E8E93';
  return (
    <View style={[styles.tag, { backgroundColor: `${color}22` }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
});

export function SourceTag({ source }) {
  if (source === 'app') return <Tag label="Planner" kind="app" />;
  if (source === 'teacher') return <Tag label="Teacher" kind="teacher" />;
  if (source === 'parent') return <Tag label="Parent" kind="parent" />;
  return null;
}

/** Priority labels are hidden in simple mode, like the prototype. */
export function PriorityTag({ score, ageMode }) {
  if (ageMode === 'simple') return null;
  if (score >= 7) return <Tag label="High priority" kind="high" />;
  if (score >= 4) return <Tag label="Medium" kind="medium" />;
  return null;
}

export function ChapterChip({ name, status }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.chapterChip, { backgroundColor: colors.fill, borderRadius: radius.pill }]}>
      <StatusDot status={status} size={8} />
      <Text style={{ color: colors.text, fontSize: 12 }} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '700' },
  chapterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 220 },
});
