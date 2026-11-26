import { StyleSheet } from 'react-native';
import { usePreferencesStore } from '../../store/preferencesStore';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from './Icon';
import { PressableScale } from './Motion';

/** A bare sun/moon icon that flips between light and dark. Shows the mode you'd switch to. */
export function ThemeToggle({ style }) {
  const { scheme, colors } = useTheme();
  const setAppearance = usePreferencesStore((state) => state.setAppearance);
  const dark = scheme === 'dark';
  return (
    <PressableScale
      onPress={() => setAppearance(dark ? 'light' : 'dark')}
      accessibilityRole="button"
      accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      hitSlop={10}
      scaleTo={0.85}
      style={[styles.button, { borderColor: colors.fillStrong, backgroundColor: colors.card }, style]}
      testID="theme-toggle"
    >
      <Icon name={dark ? 'sun' : 'moon'} size={18} color={colors.textSecondary} strokeWidth={2.2} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({ button: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' } });
