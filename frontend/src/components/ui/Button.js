import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from './Icon';
import { PressableScale } from './Motion';

/** variant: primary | secondary | ghost | danger. size: md | sm. */
function ButtonBase({ title, onPress, variant = 'secondary', size = 'md', icon, loading = false, disabled = false, block = false, accessibilityLabel, testID }) {
  const { colors, radius } = useTheme();
  const palette = {
    primary: { bg: colors.tint, fg: colors.onTint },
    secondary: { bg: colors.tintSoft, fg: colors.tintInk },
    ghost: { bg: 'transparent', fg: colors.tintInk },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[variant];
  const inactive = disabled || loading;
  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.small : styles.medium,
        { backgroundColor: palette.bg, borderRadius: size === 'sm' ? radius.sm : radius.md, opacity: inactive ? 0.45 : pressed ? 0.85 : 1 },
        variant === 'primary' && !inactive && { boxShadow: `0px 4px 10px ${colors.tint}40` },
        block && styles.block,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 18} color={palette.fg} strokeWidth={2.4} /> : null}
          <Text style={[styles.label, size === 'sm' && styles.labelSmall, { color: palette.fg }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

export const Button = memo(ButtonBase);

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, maxWidth: '100%', flexShrink: 1 },
  medium: { minHeight: 46 },
  small: { minHeight: 34, paddingHorizontal: 12 },
  block: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, maxWidth: '100%' },
  label: { fontSize: 15.5, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  labelSmall: { fontSize: 13.5 },
});
