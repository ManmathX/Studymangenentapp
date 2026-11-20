import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNetworkStore } from '../../store/networkStore';
import { useTheme } from '../../theme/ThemeProvider';
import { Button } from './Button';
import { Icon } from './Icon';

export function LoadingState({ label = 'Loading' }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityLabel={label} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.textSecondary} />
    </View>
  );
}

export function EmptyState({ message, action }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{message}</Text>
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Icon name="warn" size={34} color={colors.warning} />
      <Text style={[styles.errorTitle, { color: colors.text }]}>{error?.isNetworkError ? 'You’re offline' : 'Couldn’t load this'}</Text>
      <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error?.message ?? 'Something went wrong.'}</Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} variant="primary" /> : null}
    </View>
  );
}

/** Wraps a screen body with the right loading and error states. */
export function AsyncBoundary({ resource, children }) {
  if (resource.isLoading) return <LoadingState />;
  if (resource.error && resource.data === undefined) return <ErrorState error={resource.error} onRetry={resource.refresh} />;
  if (resource.data === undefined) return <LoadingState />;
  return children(resource.data);
}

export function OfflineBanner() {
  const isOnline = useNetworkStore((state) => state.isOnline);
  const { colors } = useTheme();
  if (isOnline) return null;
  return (
    <View style={[styles.offline, { backgroundColor: colors.warning }]} accessibilityRole="alert">
      <Text style={styles.offlineText}>You’re offline. Changes will fail until you reconnect.</Text>
    </View>
  );
}

export function Banner({ title, body, tone = 'warning', icon = 'warn', children }) {
  const { colors, radius } = useTheme();
  const accent = tone === 'info' ? colors.tint : tone === 'success' ? colors.success : colors.warning;
  return (
    <View style={[styles.banner, { backgroundColor: colors.card, borderRadius: radius.lg }]} accessibilityRole="summary">
      <View style={[styles.bannerIcon, { backgroundColor: accent }]}>
        <Icon name={icon} size={16} color="#fff" />
      </View>
      <View style={styles.bannerBody}>
        <Text style={[styles.bannerTitle, { color: colors.text }]}>{title}</Text>
        {body ? <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 19 }}>{body}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, minHeight: 280 },
  empty: { padding: 20, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  errorTitle: { fontSize: 18, fontWeight: '600' },
  errorText: { fontSize: 15, textAlign: 'center' },
  offline: { paddingVertical: 6, paddingHorizontal: 16 },
  offlineText: { color: '#000', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  banner: { flexDirection: 'row', gap: 12, padding: 14 },
  bannerIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bannerBody: { flex: 1, gap: 4 },
  bannerTitle: { fontSize: 16, fontWeight: '600' },
});
