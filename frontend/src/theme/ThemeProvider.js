import { createContext, useContext, useEffect, useMemo } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import { usePreferencesStore } from '../store/preferencesStore';
import { layout, palette, radius, spacing, type } from './tokens';

const ThemeContext = createContext(null);

/**
 * Tells native UI (switches, alerts, keyboards, pickers) which scheme to draw.
 * react-native-web has no override, and there the palette alone is enough.
 */
function applyNativeOverride(appearance) {
  if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
  try {
    Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
  } catch {
    // Older runtimes without the override keep following the system setting.
  }
}

export function ThemeProvider({ children }) {
  const appearance = usePreferencesStore((state) => state.appearance);
  const hydrate = usePreferencesStore((state) => state.hydrate);
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme = appearance === 'system' ? system : appearance;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    applyNativeOverride(appearance);
  }, [appearance]);

  const value = useMemo(
    () => ({ scheme, appearance, colors: palette[scheme], spacing, radius, type, layout }),
    [scheme, appearance],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}

/** Memoised StyleSheet factory bound to the current theme. */
export function useThemedStyles(factory) {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
