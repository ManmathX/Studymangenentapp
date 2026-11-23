import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/Field';
import { Muted, Screen } from '../../components/ui/Layout';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { useTheme } from '../../theme/ThemeProvider';
import { applyServerErrors, rules } from '../../utils/validation';

export function ChangePasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const changePassword = useAuthStore((state) => state.changePassword);
  const {
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { isSubmitting, errors },
  } = useForm({ defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await changePassword(currentPassword, newPassword);
      toast('Password changed. Other devices were signed out.');
      navigation.goBack();
    } catch (error) {
      if (!applyServerErrors(error, setError, ['currentPassword', 'newPassword'])) setError('root', { message: error.message });
    }
  });

  return (
    <Screen>
      <View style={{ gap: 14 }}>
        <Muted small>For your security, every other phone or browser signed in to this account will be signed out.</Muted>
        <FormField control={control} name="currentPassword" rules={rules.loginPassword} label="Current password" secureTextEntry autoComplete="current-password" textContentType="password" />
        <FormField
          control={control}
          name="newPassword"
          rules={{ ...rules.newPassword, validate: { ...rules.newPassword.validate, different: (value) => value !== getValues('currentPassword') || 'Choose a password different from the current one' } }}
          label="New password"
          placeholder="8+ characters with a letter and a number"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <FormField
          control={control}
          name="confirm"
          rules={{ required: 'Type the new password again', validate: (value) => value === getValues('newPassword') || 'Passwords don’t match' }}
          label="Confirm new password"
          secureTextEntry
          autoComplete="new-password"
          onSubmitEditing={onSubmit}
        />
        {errors.root ? (
          <Text style={{ color: colors.danger }} accessibilityRole="alert">
            {errors.root.message}
          </Text>
        ) : null}
        <Button title="Change password" variant="primary" block onPress={onSubmit} loading={isSubmitting} testID="change-password-submit" />
      </View>
    </Screen>
  );
}
