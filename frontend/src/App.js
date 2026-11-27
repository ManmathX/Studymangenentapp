import { createNavigationContainerRef, DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { persistNow } from './data/db';
import { OfflineBanner } from './components/ui/States';
import { Toast } from './components/ui/Toast';
import { RootNavigator } from './navigation/RootNavigator';
import { flushNotificationTap, startNotifications } from './services/notifications';
import { useAuthStore } from './store/authStore';
import { watchNetwork } from './store/networkStore';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';

/** Lets a tapped reminder open its screen from outside any component. */
const navigationRef = createNavigationContainerRef();

function Shell() {
  const { scheme, colors } = useTheme();
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
    // The plan is saved shortly after each change; save at once if the app is put away.
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') persistNow().catch(() => {});
    });
    const stopWatching = watchNetwork();
    // Reminders follow the plan on this phone: set after every change and opened when tapped.
    const stopNotifications = startNotifications(navigationRef);
    return () => {
      appState.remove();
      stopWatching();
      stopNotifications();
    };
  }, [bootstrap]);

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, primary: colors.tint, background: colors.background, card: colors.card, text: colors.text, border: colors.separator } };
  }, [colors, scheme]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <OfflineBanner />
      <ErrorBoundary>
        <NavigationContainer ref={navigationRef} theme={navigationTheme} onReady={flushNotificationTap} onStateChange={flushNotificationTap}>
          <RootNavigator />
        </NavigationContainer>
      </ErrorBoundary>
      <Toast />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
