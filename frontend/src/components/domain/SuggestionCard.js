import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { dayName, duration } from '../../utils/format';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

function SuggestionCardBase({ suggestion, today, onAccept, onSwap, onSkip, onLater, busy }) {
  const { colors, radius } = useTheme();
  const isMove = suggestion.kind === 'move';
  const when = isMove ? `Move to ${dayName(suggestion.date, today)}` : `${duration(suggestion.mins)}, ${dayName(suggestion.date, today)}`;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.lg }]} accessibilityLabel={`Suggestion from ${suggestion.who}`}>
      <View style={styles.who}>
        <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
          <Icon name="spark" size={16} color="#fff" />
        </View>
        <View>
          <Text style={[styles.whoName, { color: colors.text }]}>
            {suggestion.who} {isMove ? 'noticed' : 'suggests'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{suggestion.role}</Text>
        </View>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{suggestion.title}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
        {when}. {suggestion.note}
      </Text>
      <View style={styles.buttons}>
        <Button title="Accept" variant="primary" size="sm" onPress={() => onAccept(suggestion)} disabled={busy} />
        <Button title="Swap day" size="sm" onPress={() => onSwap(suggestion)} disabled={busy} />
        {onLater ? <Button title="Later" size="sm" variant="ghost" onPress={() => onLater(suggestion)} disabled={busy} /> : null}
        <Button title="Skip" size="sm" variant="ghost" onPress={() => onSkip(suggestion)} disabled={busy} />
      </View>
    </View>
  );
}

export const SuggestionCard = memo(SuggestionCardBase);

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  whoName: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '600', marginTop: 4 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
});
