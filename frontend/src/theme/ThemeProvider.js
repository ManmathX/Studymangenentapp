import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { layout, palette, radius, spacing, type } from './tokens';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const value = useMemo(() => ({ scheme, colors: palette[scheme], spacing, radius, type, layout }), [scheme]);
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
