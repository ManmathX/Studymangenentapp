import { Component } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Button } from './Button';
import { Icon } from './Icon';

function CrashScreen({ onRetry }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]} accessibilityRole="alert">
      <Icon name="warn" size={40} color={colors.warning} />
      <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        This screen hit a problem. Your plan is saved on this phone, so nothing was lost.
      </Text>
      <Button title="Try again" variant="primary" onPress={onRetry} testID="crash-retry" />
    </View>
  );
}

/**
 * Catches render errors anywhere below it so a single broken screen shows a recovery
 * screen instead of a blank app. "Try again" remounts the tree.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
    this.retry = () => this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Hook point for a crash reporter (Sentry, Bugsnag, …) once one is configured.
    this.props.onError?.(error, info);
    if (__DEV__) console.error('Render error caught by ErrorBoundary', error, info?.componentStack);
  }

  render() {
    if (this.state.error) return <CrashScreen onRetry={this.retry} />;
    return <View key={this.state.attempt} style={styles.fill}>{this.props.children}</View>;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 21, maxWidth: 420 },
});
