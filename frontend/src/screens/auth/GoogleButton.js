import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { getGoogleIdToken, googleSignInAvailable } from '../../services/googleSignIn';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeProvider';

/** "Continue with Google", then an "or use email" divider. Renders nothing where Google sign-in isn't set up. */
export function GoogleButton() {
  const { colors } = useTheme();
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!googleSignInAvailable) return null;

  const onPress = async () => {
    setError(null);
    setBusy(true);
    try {
      const idToken = await getGoogleIdToken();
      if (idToken) await loginWithGoogle(idToken);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button title="Continue with Google" variant="primary" block onPress={onPress} loading={busy} testID="google-sign-in" />
      {error ? (
        <Text style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: colors.separator }]} />
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>or use email</Text>
        <View style={[styles.line, { backgroundColor: colors.separator }]} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
