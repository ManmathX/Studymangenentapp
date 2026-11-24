import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text } from 'react-native';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/Field';
import { Muted } from '../../components/ui/Layout';
import { authApi } from '../../services/api/endpoints';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { useTheme } from '../../theme/ThemeProvider';
import { applyServerErrors, rules } from '../../utils/validation';
import { AuthLayout } from './AuthLayout';

/**
 * Forgot password: email a 6-digit code, then set a new password with it. The plan on this
 * phone belongs to the account, so it opens again as soon as the student is back in.
 */
export function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState(null);
  return email ? (
    <ResetStep email={email} onStartAgain={() => setEmail(null)} />
  ) : (
    <EmailStep onSent={setEmail} onBack={() => navigation.goBack()} />
  );
}

function ErrorText({ message }) {
  const { colors } = useTheme();
  return message ? (
    <Text style={{ color: colors.danger }} accessibilityRole="alert" testID="forgot-error">
      {message}
    </Text>
  ) : null;
}

function EmailStep({ onSent, onBack }) {
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm({ defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (values) => {
    const email = values.email.trim().toLowerCase();
    try {
      await authApi.forgotPassword(email);
      toast('If that email has an account, a code is on its way.');
      onSent(email);
    } catch (error) {
      if (!applyServerErrors(error, setError, ['email'])) setError('root', { message: error.message });
    }
  });

  return (
    <AuthLayout title="Forgot your password?" subtitle="We’ll email you a 6-digit code to set a new one.">
      <FormField control={control} name="email" rules={rules.email} label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" onSubmitEditing={onSubmit} returnKeyType="send" />
      <ErrorText message={errors.root?.message} />
      <Button title="Email me a code" variant="primary" onPress={onSubmit} loading={isSubmitting} block testID="forgot-send" />
      <Button title="Back to sign in" variant="ghost" onPress={onBack} />
    </AuthLayout>
  );
}

function ResetStep({ email, onStartAgain }) {
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const [resending, setResending] = useState(false);
  const {
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { isSubmitting, errors },
  } = useForm({ defaultValues: { code: '', newPassword: '', confirm: '' } });

  const onSubmit = handleSubmit(async ({ code, newPassword }) => {
    try {
      await resetPassword({ email, code: code.trim(), newPassword });
      toast('Password changed. You’re signed in.');
    } catch (error) {
      if (!applyServerErrors(error, setError, ['code', 'newPassword'])) setError('root', { message: error.message });
    }
  });

  const resend = async () => {
    setResending(true);
    try {
      await authApi.forgotPassword(email);
      toast('A new code is on its way. Codes can be sent once a minute.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout title="Check your email" subtitle={`Enter the 6-digit code sent to ${email} and choose a new password.`}>
      <FormField
        control={control}
        name="code"
        rules={{ required: 'Enter the code from the email', pattern: { value: /^\s*\d{6}\s*$/, message: 'The code has 6 digits' } }}
        label="Code"
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
      />
      <FormField control={control} name="newPassword" rules={rules.newPassword} label="New password" secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <FormField
        control={control}
        name="confirm"
        rules={{ required: 'Type the new password again', validate: (value) => value === getValues('newPassword') || 'Passwords don’t match' }}
        label="New password again"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={onSubmit}
      />
      <ErrorText message={errors.root?.message} />
      <Button title="Set new password" variant="primary" onPress={onSubmit} loading={isSubmitting} block testID="reset-submit" />
      <Muted small>The code works for 15 minutes. Didn’t get it? Check spam, or send a new one.</Muted>
      <Button title="Send a new code" variant="ghost" onPress={resend} loading={resending} />
      <Button title="Use a different email" variant="ghost" onPress={onStartAgain} />
    </AuthLayout>
  );
}
