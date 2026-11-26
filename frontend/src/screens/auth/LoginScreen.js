import { useForm } from 'react-hook-form';
import { Text } from 'react-native';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/Field';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeProvider';
import { applyServerErrors, rules } from '../../utils/validation';
import { AuthLayout } from './AuthLayout';
import { GoogleButton } from './GoogleButton';

export function LoginScreen({ navigation }) {
  const login = useAuthStore((state) => state.login);
  const { colors } = useTheme();
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm({ defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login({ email: values.email.trim(), password: values.password });
    } catch (error) {
      if (!applyServerErrors(error, setError, ['email', 'password'])) setError('root', { message: error.message });
    }
  });

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to see today’s plan.">
      <GoogleButton />
      <FormField control={control} name="email" rules={rules.email} label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" returnKeyType="next" />
      <FormField control={control} name="password" rules={rules.loginPassword} label="Password" placeholder="Your password" secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={onSubmit} returnKeyType="go" />
      {errors.root ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert" testID="login-error">
          {errors.root.message}
        </Text>
      ) : null}
      <Button title="Sign in with email" variant="primary" onPress={onSubmit} loading={isSubmitting} block testID="login-submit" />
      <Button title="Forgot password?" variant="ghost" onPress={() => navigation.navigate('ForgotPassword')} testID="open-forgot-password" />
      <Button title="New here? Create an account" variant="ghost" onPress={() => navigation.navigate('Register')} />
    </AuthLayout>
  );
}
