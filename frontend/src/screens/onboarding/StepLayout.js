import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';

const TOTAL_STEPS = 5;

/** Shared frame for set-up steps: progress dots, heading, lead text, body, and a pinned action area. */
export function StepLayout({ step, title, lead, children, footer }) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: layout.maxContentWidth }]} keyboardShouldPersistTaps="handled">
        {step ? (
          <View style={styles.dots} accessibilityLabel={`Step ${step} of ${TOTAL_STEPS}`}>
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
              <View key={index} style={[styles.dot, { backgroundColor: index < step ? colors.tint : colors.fillStrong }]} />
            ))}
          </View>
        ) : null}
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {title}
        </Text>
        {lead ? <Text style={[styles.lead, { color: colors.textSecondary }]}>{lead}</Text> : null}
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, maxWidth: layout.maxContentWidth }]}>{footer}</View> : null}
    </View>
  );
}

export function FieldHeading({ children }) {
  const { colors } = useTheme();
  return <Text style={[styles.fieldHeading, { color: colors.textSecondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: 12, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  title: { fontSize: 30, fontWeight: '800', lineHeight: 36 },
  lead: { fontSize: 16, lineHeight: 22 },
  fieldHeading: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, paddingHorizontal: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 8, width: '100%', alignSelf: 'center' },
});
