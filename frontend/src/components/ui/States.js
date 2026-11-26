import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useNetworkStore } from '../../store/networkStore';
import { useTheme } from '../../theme/ThemeProvider';
import { Button } from './Button';
import { Icon } from './Icon';
import { nativeDriver, Stagger, useReducedMotion } from './Motion';

/** Placeholder cards that gently pulse while a screen loads. */
export function LoadingState({ label = 'Loading' }) {
  const { colors, radius } = useTheme();
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
        Animated.timing(opacity, { toValue: 0.55, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return (
    <Animated.View style={[styles.skeleton, { opacity }]} accessibilityLabel={label} accessibilityRole="progressbar">
      {[96, 150, 72].map((height, index) => (
        <View key={index} style={{ height, borderRadius: radius.lg, backgroundColor: colors.fill }} />
      ))}
    </Animated.View>
  );
}

export function EmptyState({ message, action, icon = 'star' }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.tintSoft }]}>
        <Icon name={icon} size={20} color={colors.tint} />
      </View>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{message}</Text>
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.errorIcon, { backgroundColor: colors.warningSoft }]}>
        <Icon name="warn" size={28} color={colors.warning} />
      </View>
      <Text style={[styles.errorTitle, { color: colors.text }]}>{error?.isNetworkError ? 'You’re offline' : 'Couldn’t load this'}</Text>
      <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error?.message ?? 'Something went wrong.'}</Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} variant="primary" /> : null}
    </View>
  );
}

/** Wraps a screen body with the right loading and error states; content slides in block by block. */
export function AsyncBoundary({ resource, children }) {
  if (resource.isLoading) return <LoadingState />;
  if (resource.error && resource.data === undefined) return <ErrorState error={resource.error} onRetry={resource.refresh} />;
  if (resource.data === undefined) return <LoadingState />;
  return <Stagger>{children(resource.data)}</Stagger>;
}

export function OfflineBanner() {
  const isOnline = useNetworkStore((state) => state.isOnline);
  const { colors } = useTheme();
  if (isOnline) return null;
  return (
    <View style={[styles.offline, { backgroundColor: colors.warning }]} accessibilityRole="alert">
      <Text style={styles.offlineText}>You’re offline. Your plan still works; signing in and account changes need a connection.</Text>
    </View>
  );
}

const TONES = {
  info: ['tint', 'tintSoft'],
  success: ['success', 'successSoft'],
  warning: ['warning', 'warningSoft'],
  danger: ['danger', 'dangerSoft'],
};

/** A coloured notice with an icon. `tone`: info | success | warning | danger. */
export function Banner({ title, body, tone = 'warning', icon = 'warn', children }) {
  const { colors, radius } = useTheme();
  const [accentKey, softKey] = TONES[tone] ?? TONES.warning;
  const accent = colors[accentKey];
  return (
    <View style={[styles.banner, { backgroundColor: colors[softKey], borderRadius: radius.lg, borderColor: `${accent}33` }]} accessibilityRole="summary">
      <View style={[styles.bannerIcon, { backgroundColor: accent }]}>
        <Icon name={icon} size={15} color="#fff" strokeWidth={2.4} />
      </View>
      <View style={styles.bannerBody}>
        <Text style={[styles.bannerTitle, { color: colors.text }]}>{title}</Text>
        {body ? <Text style={[styles.bannerText, { color: colors.textSecondary }]}>{body}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: 14, paddingVertical: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10, minHeight: 260 },
  empty: { paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorText: { fontSize: 14.5, textAlign: 'center' },
  offline: { paddingVertical: 6, paddingHorizontal: 16 },
  offlineText: { color: '#000', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  banner: { flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1 },
  bannerIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bannerBody: { flex: 1, gap: 3 },
  bannerTitle: { fontSize: 15, fontWeight: '700' },
  bannerText: { fontSize: 13.5, lineHeight: 18 },
});
