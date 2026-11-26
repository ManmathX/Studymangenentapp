import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appear, ProgressBar, Stagger } from '../../components/ui/Motion';
import { useTheme } from '../../theme/ThemeProvider';

const TOTAL_STEPS = 5;

/** Shared frame for set-up steps: a progress bar, heading, lead text, body, and a pinned action area. */
export function StepLayout({ step, title, lead, children, footer }) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: layout.maxContentWidth }]} keyboardShouldPersistTaps="handled">
        {step ? (
          <View style={styles.progress} accessibilityLabel={`Step ${step} of ${TOTAL_STEPS}`}>
            <Text style={[styles.stepLabel, { color: colors.tint }]}>
              STEP {step} OF {TOTAL_STEPS}
            </Text>
            <ProgressBar progress={step / TOTAL_STEPS} color={colors.tint} track={colors.fillStrong} height={6} />
          </View>
        ) : null}
        <Appear>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
          {lead ? <Text style={[styles.lead, { color: colors.textSecondary }]}>{lead}</Text> : null}
        </Appear>
        <Stagger>{children}</Stagger>
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10, backgroundColor: colors.background, borderTopColor: colors.separator, maxWidth: layout.maxContentWidth }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function FieldHeading({ children }) {
  const { colors } = useTheme();
  return <Text style={[styles.fieldHeading, { color: colors.textSecondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 10, gap: 14, width: '100%', alignSelf: 'center', paddingBottom: 24 },
  progress: { gap: 6, marginBottom: 4 },
  stepLabel: { fontSize: 11.5, fontWeight: '900', letterSpacing: 0.8 },
  title: { fontSize: 26, fontWeight: '900', lineHeight: 32 },
  lead: { fontSize: 15, lineHeight: 21, marginTop: 4 },
  fieldHeading: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, paddingHorizontal: 2 },
  footer: { paddingHorizontal: 18, paddingTop: 10, gap: 6, width: '100%', alignSelf: 'center', borderTopWidth: StyleSheet.hairlineWidth },
});
