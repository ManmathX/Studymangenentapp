import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/ui/Icon';
import { Appear } from '../../components/ui/Motion';
import { useTheme } from '../../theme/ThemeProvider';

/** The app's mark and name. */
export function Wordmark() {
  const { colors } = useTheme();
  return (
    <View style={styles.brand}>
      <View style={[styles.mark, { backgroundColor: colors.tint }]}>
        <Icon name="check" size={16} color="#fff" strokeWidth={3.2} />
      </View>
      <Text style={[styles.brandName, { color: colors.text }]}>Study Planner</Text>
    </View>
  );
}

/** Landing frame: plain background, content centred, the sign-in action pinned to the bottom. */
export function AuthLayout({ children, actions, note }) {
  const { colors, layout } = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: layout.maxContentWidth }]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <Appear delay={380} style={[styles.actions, { maxWidth: layout.maxContentWidth }]}>
        {actions}
        {note ? <Text style={[styles.note, { color: colors.textSecondary }]}>{note}</Text> : null}
      </Appear>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 20, width: '100%', alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mark: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },
  actions: { width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, gap: 10 },
  note: { fontSize: 13, textAlign: 'center' },
});
