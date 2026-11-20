import { useForm } from 'react-hook-form';
import { Text } from 'react-native';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/Field';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeProvider';
import { applyServerErrors, rules } from '../../utils/validation';
import { AuthLayout } from './AuthLayout';

export function RegisterScreen({ navigation }) {
  const register = useAuthStore((state) => state.register);
  const { colors } = useTheme();
  const {
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { isSubmitting, errors },
  } = useForm({ defaultValues: { name: '', email: '', password: '', confirm: '' } });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    try {
      await register({ name: name.trim(), email: email.trim(), password });
    } catch (error) {
      if (!applyServerErrors(error, setError, ['name', 'email', 'password'])) setError('root', { message: error.message });
    }
  });

  return (
    <AuthLayout title={'Your syllabus.\nYour schedule.'} subtitle="Create an account. Every NCERT chapter is ready for you, and you decide when to study each one.">
      <FormField control={control} name="name" rules={rules.name} label="First name" placeholder="Your first name" autoComplete="given-name" textContentType="givenName" />
      <FormField control={control} name="email" rules={rules.email} label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <FormField control={control} name="password" rules={rules.newPassword} label="Password" placeholder="8+ characters with a letter and a number" secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <FormField
        control={control}
        name="confirm"
        rules={{ required: 'Type the password again', validate: (value) => value === getValues('password') || 'Passwords don’t match' }}
        label="Confirm password"
        placeholder="Type it again"
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={onSubmit}
      />
      {errors.root ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert">
          {errors.root.message}
        </Text>
      ) : null}
      <Button title="Create account" variant="primary" onPress={onSubmit} loading={isSubmitting} block testID="register-submit" />
      <Button title="I already have an account" variant="ghost" onPress={() => navigation.navigate('Login')} />
    </AuthLayout>
  );
}
