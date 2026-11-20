import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from './Icon';

/** variant: primary | secondary | ghost | danger. size: md | sm. */
function ButtonBase({ title, onPress, variant = 'secondary', size = 'md', icon, loading = false, disabled = false, block = false, accessibilityLabel, testID }) {
  const { colors, radius } = useTheme();
  const palette = {
    primary: { bg: colors.tint, fg: colors.onTint },
    secondary: { bg: colors.fill, fg: colors.tint },
    ghost: { bg: 'transparent', fg: colors.tint },
    danger: { bg: colors.fill, fg: colors.danger },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.small : styles.medium,
        { backgroundColor: palette.bg, borderRadius: radius.md, opacity: inactive ? 0.45 : pressed ? 0.7 : 1 },
        block && styles.block,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={palette.fg} /> : null}
          <Text style={[styles.label, size === 'sm' && styles.labelSmall, { color: palette.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export const Button = memo(ButtonBase);

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  medium: { minHeight: 46 },
  small: { minHeight: 34, paddingHorizontal: 12 },
  block: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 16, fontWeight: '600' },
  labelSmall: { fontSize: 14 },
});
