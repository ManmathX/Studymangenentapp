import { Text } from 'react-native';
import { googleSignInAvailable } from '../../services/googleSignIn';
import { useTheme } from '../../theme/ThemeProvider';
import { AuthLayout } from './AuthLayout';
import { GoogleButton } from './GoogleButton';

/** Students sign in, and sign up, with Google only. */
export function LoginScreen() {
  const { colors } = useTheme();
  return (
    <AuthLayout title="Welcome" subtitle="Sign in with Google to see today’s plan. New here? The same button creates your account.">
      {googleSignInAvailable ? (
        <GoogleButton />
      ) : (
        <Text style={{ color: colors.textSecondary }} accessibilityRole="alert" testID="google-unavailable">
          Google sign-in isn’t available in this version of the app. Install the latest version to sign in.
        </Text>
      )}
    </AuthLayout>
  );
}
