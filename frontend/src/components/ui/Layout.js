import { useState } from 'react';
import { Pressable, ScrollView, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from './Icon';
import { Stagger } from './Motion';

/** Space between the blocks (cards, sections) of a page. */
export const BLOCK_GAP = 18;

/**
 * A column of page blocks with BLOCK_GAP between them, each sliding in after the last. Use it when
 * a component renders several blocks of a page, so they never touch.
 */
export function Stack({ children, gap = BLOCK_GAP, style }) {
  return (
    <View style={[{ gap }, style]}>
      <Stagger>{children}</Stagger>
    </View>
  );
}

/** Pull-to-refresh spinner coloured for the current light or dark scheme. */
export function ThemedRefreshControl(props) {
  const { colors } = useTheme();
  return <RefreshControl tintColor={colors.tint} colors={[colors.tint]} progressBackgroundColor={colors.card} {...props} />;
}

/** Scrollable page with pull-to-refresh and a readable max width on tablets and web. */
export function Screen({ children, refreshing = false, onRefresh, testID }) {
  const { colors, layout } = useTheme();
  return (
    <ScrollView
      testID={testID}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { maxWidth: layout.maxContentWidth }]}
      refreshControl={onRefresh ? <ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, flush = false, testID }) {
  const { colors, radius, scheme } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        { backgroundColor: colors.card, borderRadius: radius.lg, boxShadow: colors.shadow },
        scheme === 'dark' && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
        !flush && styles.cardPadding,
        flush && styles.flush,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A small rounded square holding an icon, tinted with `color`. */
export function IconTile({ name, color, size = 26, iconSize }) {
  return (
    <View style={[styles.iconTile, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: `${color}22` }]}>
      <Icon name={name} size={iconSize ?? size * 0.62} color={color} strokeWidth={2.3} />
    </View>
  );
}

/**
 * A titled group: heading (with an optional icon tile), optional right-hand meta, a card, and an
 * optional footnote.
 *
 * `collapsible` hides the content behind the heading until it's tapped (for settings students
 * rarely change); `summary` is the one line shown while it's closed. `testID` names the heading.
 */
export function Section({ title, meta, icon, iconColor, children, footer, flush = false, bare = false, collapsible = false, defaultOpen = false, summary, testID }) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const iconTile = icon ? <IconTile name={icon} color={iconColor ?? colors.tint} size={24} /> : null;

  if (collapsible && !open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={`${title}${summary ? `. ${summary}` : ''}. Open`}
        testID={testID}
        style={({ pressed }) => [styles.closed, { backgroundColor: pressed ? colors.fill : colors.card, borderRadius: radius.lg, boxShadow: colors.shadow }]}
      >
        {icon ? <IconTile name={icon} color={iconColor ?? colors.tint} size={32} /> : null}
        <View style={styles.flex}>
          <Text style={[styles.closedTitle, { color: colors.text }]}>{title}</Text>
          {summary ? (
            <Text style={[styles.closedSummary, { color: colors.textSecondary }]} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron" size={18} color={colors.textTertiary} />
      </Pressable>
    );
  }

  const heading = (
    <>
      {iconTile}
      <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {meta ? (
        <View style={[styles.metaPill, { backgroundColor: colors.fill }]}>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{meta}</Text>
        </View>
      ) : null}
    </>
  );
  return (
    <View style={styles.section}>
      {title && collapsible ? (
        <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityState={{ expanded: true }} accessibilityLabel={`${title}. Close`} testID={testID} style={styles.sectionHead}>
          {heading}
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <Icon name="chevron" size={18} color={colors.textTertiary} />
          </View>
        </Pressable>
      ) : title ? (
        <View style={styles.sectionHead}>{heading}</View>
      ) : null}
      {bare ? children : <Card flush={flush}>{children}</Card>}
      {footer ? <Text style={[styles.footer, { color: colors.textSecondary }]}>{footer}</Text> : null}
    </View>
  );
}

export function Row({ children, style, gap = 8 }) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>;
}

export function Divider({ inset = 14 }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: inset }} />;
}

export function Muted({ children, style, small = false }) {
  const { colors } = useTheme();
  return <Text style={[{ color: colors.textSecondary, fontSize: small ? 12.5 : 14.5, lineHeight: small ? 17 : 20 }, style]}>{children}</Text>;
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
  return <Text style={[{ color: colors.text, fontSize: 15, fontWeight: weight }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 32, gap: BLOCK_GAP, width: '100%', alignSelf: 'center' },
  cardPadding: { padding: 14 },
  flush: { overflow: 'hidden' },
  iconTile: { alignItems: 'center', justifyContent: 'center' },
  section: { gap: 10 },
  flex: { flex: 1 },
  closed: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  closedTitle: { fontSize: 15.5, fontWeight: '800' },
  closedSummary: { fontSize: 12.5, marginTop: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
  metaPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  meta: { fontSize: 12, fontWeight: '700' },
  footer: { fontSize: 12.5, paddingHorizontal: 4, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
