import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { getGoogleIdToken, googleSignInAvailable, renderGoogleButton } from '../../services/googleSignIn';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * "Continue with Google", the only way students sign in. Renders nothing where Google sign-in
 * isn't set up. On Android and iOS it opens the native account picker; on the web Google draws
 * its own button (its rules for websites) and hands back the same kind of ID token.
 */
export function GoogleButton() {
  if (!googleSignInAvailable) return null;
  return Platform.OS === 'web' ? <WebGoogleButton /> : <NativeGoogleButton />;
}

function useGoogleLogin() {
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const signIn = useCallback(
    async (getToken) => {
      setError(null);
      setBusy(true);
      try {
        const idToken = await getToken();
        if (idToken) await loginWithGoogle(idToken);
      } catch (caught) {
        setError(caught.message);
      } finally {
        setBusy(false);
      }
    },
    [loginWithGoogle],
  );
  return { busy, error, setError, signIn };
}

function NativeGoogleButton() {
  const { busy, error, signIn } = useGoogleLogin();
  return (
    <>
      <Button title="Continue with Google" variant="primary" block onPress={() => signIn(getGoogleIdToken)} loading={busy} testID="google-sign-in" />
      <ErrorText message={error} />
    </>
  );
}

/** How long Google gets to draw its button before we say it isn't showing. */
const RENDER_GRACE_MS = 6000;

function WebGoogleButton() {
  const { scheme, colors } = useTheme();
  const { busy, error, setError, signIn } = useGoogleLogin();
  const host = useRef(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    let active = true;
    renderGoogleButton(element, {
      onCredential: (idToken) => signIn(() => Promise.resolve(idToken)),
      dark: scheme === 'dark',
      width: element.offsetWidth || 320,
    }).catch(() => {
      if (active) setError('Google sign-in couldn’t load. Check your connection, or sign in with email.');
    });
    // Google draws nothing (no error) when this web address isn't allowed for the client ID.
    const check = setTimeout(() => {
      const frame = element.querySelector('iframe');
      if (active) setHidden(!frame || frame.offsetHeight === 0);
    }, RENDER_GRACE_MS);
    return () => {
      active = false;
      clearTimeout(check);
    };
  }, [scheme, setError, signIn]);

  return (
    <>
      <View style={styles.webRow}>
        <View ref={host} style={styles.webHost} testID="google-sign-in" />
        {busy ? <ActivityIndicator color={colors.tint} /> : null}
      </View>
      {hidden ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          Google sign-in isn’t switched on for this web address yet ({typeof window === 'undefined' ? '' : window.location.origin}). Ask the app team to switch it on.
        </Text>
      ) : null}
      <ErrorText message={error} />
    </>
  );
}

function ErrorText({ message }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <Text style={{ color: colors.danger }} accessibilityRole="alert">
      {message}
    </Text>
  );
}


const styles = StyleSheet.create({
  webRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  webHost: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 13, textAlign: 'center' },
});
