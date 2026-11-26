import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/Field';
import { Card, Muted, Screen } from '../../components/ui/Layout';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { useTheme } from '../../theme/ThemeProvider';
import { applyServerErrors, rules } from '../../utils/validation';

const WHAT_GOES = [
  'Your login and email address, from our server',
  'Your plan, tasks, homework and tests, from this phone',
  'Your streak, focus sessions and check-ins, from this phone',
  'Your sharing and privacy settings, from this phone',
];

export function DeleteAccountScreen() {
  const { colors } = useTheme();
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  // Accounts made with Google have no password; the button below is their confirmation.
  const hasPassword = useAuthStore((state) => state.user?.hasPassword !== false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm({ defaultValues: { password: '' } });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await deleteAccount(hasPassword ? password : undefined);
      toast('Your account and all its data were deleted.');
    } catch (error) {
      if (!applyServerErrors(error, setError, ['password'])) setError('root', { message: error.message });
    }
  });

  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <Card style={{ gap: 6 }}>
          <Text style={{ color: colors.danger, fontSize: 17, fontWeight: '700' }}>This can’t be undone</Text>
          <Muted small>Deleting your account removes, straight away and for good:</Muted>
          {WHAT_GOES.map((line) => (
            <Text key={line} style={{ color: colors.text, lineHeight: 22 }}>
              • {line}
            </Text>
          ))}
        </Card>
        <Muted small>Only want a fresh plan? Use “Start over with setup” instead. It keeps your login. Want to keep your plan? Save a backup in Profile first.</Muted>
        {hasPassword ? (
          <FormField control={control} name="password" rules={rules.loginPassword} label="Type your password to confirm" secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={onSubmit} />
        ) : (
          <Muted small>You sign in with Google, so there’s no password to type. Tap the button below only if you’re sure.</Muted>
        )}
        {errors.root ? (
          <Text style={{ color: colors.danger }} accessibilityRole="alert">
            {errors.root.message}
          </Text>
        ) : null}
        <Button title="Delete my account" variant="danger" block onPress={onSubmit} loading={isSubmitting} testID="delete-account-submit" />
      </View>
    </Screen>
  );
}
