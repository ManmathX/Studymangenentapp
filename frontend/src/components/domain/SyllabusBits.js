import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../ui/Icon';
import { Divider } from '../ui/Layout';

/** A unit's name above its chapters in a list ("Mechanics", "Botany"). */
export function UnitHeading({ name, first = false }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.unit, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]} accessibilityRole="header">
      <Text style={[styles.unitText, { color: colors.textSecondary }]}>{name.toUpperCase()}</Text>
    </View>
  );
}

/** A unit heading where the unit changes, otherwise a divider between rows. */
export function ChapterSeparator({ chapter, previous, index }) {
  if (chapter.unit && chapter.unit !== previous?.unit) return <UnitHeading name={chapter.unit} first={index === 0} />;
  return index ? <Divider /> : null;
}

/** "★ Important · 6 topics · 8%" under a chapter's name; nothing for plain chapters. */
export function ChapterMeta({ chapter }) {
  const { colors } = useTheme();
  const parts = [
    chapter.topics?.length ? `${chapter.topics.length} topic${chapter.topics.length === 1 ? '' : 's'}` : null,
    chapter.weightage ? `${chapter.weightage}% weightage` : null,
    chapter.marks ? `${chapter.marks} marks` : null,
  ].filter(Boolean);
  if (!chapter.important && !parts.length) return null;
  return (
    <View style={styles.meta}>
      {chapter.important ? (
        <>
          <Icon name="star" size={12} color={colors.warning} />
          <Text style={{ color: colors.warningInk, fontSize: 12, fontWeight: '700' }}>Important</Text>
          {parts.length ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>·</Text> : null}
        </>
      ) : null}
      {parts.length ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{parts.join(' · ')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  unit: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  unitText: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2 },
});
