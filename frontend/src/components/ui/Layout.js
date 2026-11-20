import { ScrollView, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

/** Scrollable page with pull-to-refresh and a readable max width on tablets and web. */
export function Screen({ children, refreshing = false, onRefresh, testID }) {
  const { colors, layout } = useTheme();
  return (
    <ScrollView
      testID={testID}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { maxWidth: layout.maxContentWidth }]}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, flush = false }) {
  const { colors, radius } = useTheme();
  return <View style={[{ backgroundColor: colors.card, borderRadius: radius.lg }, !flush && styles.cardPadding, flush && styles.flush, style]}>{children}</View>;
}

/** A titled group: heading, optional right-hand meta, a card, and an optional footnote. */
export function Section({ title, meta, children, footer, flush = false, bare = false }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
          {meta ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{meta}</Text> : null}
        </View>
      ) : null}
      {bare ? children : <Card flush={flush}>{children}</Card>}
      {footer ? <Text style={[styles.footer, { color: colors.textSecondary }]}>{footer}</Text> : null}
    </View>
  );
}

export function Row({ children, style, gap = 8 }) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>;
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 16 }} />;
}

export function Muted({ children, style, small = false }) {
  const { colors } = useTheme();
  return <Text style={[{ color: colors.textSecondary, fontSize: small ? 13 : 15 }, style]}>{children}</Text>;
}

export function Title({ children, style }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.title, { color: colors.text }, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, style, weight }) {
  const { colors } = useTheme();
  return <Text style={[{ color: colors.text, fontSize: 16, fontWeight: weight }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 20, width: '100%', alignSelf: 'center' },
  cardPadding: { padding: 16 },
  flush: { overflow: 'hidden' },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  meta: { fontSize: 14 },
  footer: { fontSize: 13, paddingHorizontal: 4, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
