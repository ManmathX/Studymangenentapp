import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller } from 'react-hook-form';
import { useTheme } from '../../theme/ThemeProvider';

const Input = forwardRef(function Input({ label, error, multiline, style, onFocus, onBlur, ...props }, ref) {
  const { colors, radius, scheme } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label ?? props.placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardAppearance={scheme}
        selectionColor={colors.tint}
        multiline={multiline}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: colors.text, backgroundColor: colors.card, borderRadius: radius.md, borderColor: error ? colors.danger : focused ? colors.tint : colors.separator },
          focused && { boxShadow: `0px 0px 0px 3px ${colors.tintSoft}` },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

/** A text input bound to React Hook Form, showing the field's validation message. */
export function FormField({ control, name, rules, label, ...inputProps }) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { onChange, onBlur, value, ref }, fieldState: { error } }) => (
        <Input ref={ref} label={label} value={value} onChangeText={onChange} onBlur={onBlur} error={error?.message} testID={`field-${name}`} {...inputProps} />
      )}
    />
  );
}

export { Input };

const styles = StyleSheet.create({
  wrap: { gap: 5 },
  label: { fontSize: 12.5, fontWeight: '700', paddingHorizontal: 2 },
  input: { minHeight: 46, paddingHorizontal: 13, fontSize: 15.5, borderWidth: 1.5 },
  multiline: { minHeight: 84, paddingTop: 11, textAlignVertical: 'top' },
  error: { fontSize: 12.5, fontWeight: '600', paddingHorizontal: 2 },
});
