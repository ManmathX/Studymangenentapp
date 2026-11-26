import { StyleSheet, Text } from 'react-native';
import { Appear } from '../../components/ui/Motion';
import { googleSignInAvailable } from '../../services/googleSignIn';
import { useTheme } from '../../theme/ThemeProvider';
import { AuthLayout, Wordmark } from './AuthLayout';
import { GoogleButton } from './GoogleButton';
import { ScreensCollage } from './ScreensCollage';

/** Students sign in, and sign up, with Google only. */
export function LoginScreen() {
  const { colors } = useTheme();
  return (
    <AuthLayout
      actions={
        googleSignInAvailable ? (
          <GoogleButton />
        ) : (
          <Text style={[styles.unavailable, { color: colors.textSecondary }]} accessibilityRole="alert" testID="google-unavailable">
            Google sign-in isn’t available in this version of the app. Install the latest version to sign in.
          </Text>
        )
      }
      note="New here? Signing in creates your account."
    >
      <Appear>
        <Wordmark />
      </Appear>
      <Appear delay={70}>
        <Text style={[styles.headline, { color: colors.text }]} accessibilityRole="header">
          Your school week, <Text style={{ color: colors.tint }}>sorted.</Text>
        </Text>
        <Text style={[styles.lead, { color: colors.textSecondary }]}>Homework, tests and revision in one plan.</Text>
      </Appear>
      <ScreensCollage />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center', marginTop: 22 },
  lead: { fontSize: 15.5, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  unavailable: { fontSize: 14, textAlign: 'center' },
});
