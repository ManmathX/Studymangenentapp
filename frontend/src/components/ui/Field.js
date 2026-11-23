import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller } from 'react-hook-form';
import { useTheme } from '../../theme/ThemeProvider';

const Input = forwardRef(function Input({ label, error, multiline, style, ...props }, ref) {
  const { colors, radius, scheme } = useTheme();
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
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: colors.text, backgroundColor: colors.card, borderRadius: radius.md, borderColor: error ? colors.danger : colors.separator },
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
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500', paddingHorizontal: 4 },
  input: { minHeight: 48, paddingHorizontal: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  error: { fontSize: 13, paddingHorizontal: 4 },
});
