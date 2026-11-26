import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { dayName, duration } from '../../utils/format';
import { Button } from '../ui/Button';
import { Card } from '../ui/Layout';
import { Gradient } from '../ui/Gradient';
import { Icon } from '../ui/Icon';

function SuggestionCardBase({ suggestion, today, onAccept, onSwap, onSkip, onLater, busy }) {
  const { colors } = useTheme();
  const isMove = suggestion.kind === 'move';
  const when = isMove ? `Move to ${dayName(suggestion.date, today)}` : `${duration(suggestion.mins)}, ${dayName(suggestion.date, today)}`;
  return (
    <Card style={styles.card}>
      <View style={styles.who} accessibilityLabel={`Suggestion from ${suggestion.who}`}>
        <View style={styles.avatar}>
          <Gradient colors={colors.hero} />
          {/* Wrapped so it paints above the gradient on the web too. */}
          <View>
            <Icon name="spark" size={15} color="#fff" />
          </View>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.whoName, { color: colors.text }]}>
            {suggestion.who} {isMove ? 'noticed' : 'suggests'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{suggestion.role}</Text>
        </View>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{suggestion.title}</Text>
      <Text style={[styles.note, { color: colors.textSecondary }]}>
        <Text style={{ color: colors.tintInk, fontWeight: '700' }}>{when}.</Text> {suggestion.note}
      </Text>
      <View style={styles.buttons}>
        <Button title="Accept" icon="check" variant="primary" size="sm" onPress={() => onAccept(suggestion)} disabled={busy} />
        <Button title="Swap day" size="sm" onPress={() => onSwap(suggestion)} disabled={busy} />
        {onLater ? <Button title="Later" size="sm" variant="ghost" onPress={() => onLater(suggestion)} disabled={busy} /> : null}
        <Button title="Skip" size="sm" variant="ghost" onPress={() => onSkip(suggestion)} disabled={busy} />
      </View>
    </Card>
  );
}

export const SuggestionCard = memo(SuggestionCardBase);

const styles = StyleSheet.create({
  card: { gap: 6 },
  flex: { flex: 1 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  whoName: { fontSize: 14, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  note: { fontSize: 13.5, lineHeight: 18 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
});
