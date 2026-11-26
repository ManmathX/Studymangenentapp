import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { PressableScale } from '../../components/ui/Motion';
import { getGoogleIdToken, googleSignInAvailable, renderGoogleButton } from '../../services/googleSignIn';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * "Continue with Google", the only way students sign in. Renders nothing where Google sign-in
 * isn't set up. On Android and iOS it opens the native account picker. On the web only Google's
 * own button may start sign-in, so it is drawn invisibly over our themed button and takes the click.
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

/** The Google "G" mark (brand colours are required by Google's guidelines). */
function GoogleMark({ size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/** What the student sees: the app's primary button with a white Google badge. */
function ButtonFace({ busy }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <GoogleMark />
      </View>
      <Text style={[styles.label, { color: colors.onTint }]}>Continue with Google</Text>
      {busy ? <ActivityIndicator color={colors.onTint} style={styles.spinner} /> : null}
    </View>
  );
}

function useFaceStyle() {
  const { colors, radius } = useTheme();
  return { backgroundColor: colors.tint, borderRadius: radius.md, boxShadow: `0px 4px 10px ${colors.tint}40` };
}

function NativeGoogleButton() {
  const { busy, error, signIn } = useGoogleLogin();
  const face = useFaceStyle();
  return (
    <>
      <PressableScale
        onPress={() => signIn(getGoogleIdToken)}
        disabled={busy}
        testID="google-sign-in"
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityState={{ busy }}
        style={({ pressed }) => [styles.button, face, { opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
      >
        <ButtonFace busy={busy} />
      </PressableScale>
      <ErrorText message={error} />
    </>
  );
}

/** How long Google gets to draw its button before we treat it as not showing. */
const RENDER_GRACE_MS = 6000;

/** True once Google has put a visible button (iframe or plain div, depending on the account state) into `element`. */
function googleButtonDrawn(element) {
  return Array.from(element.querySelectorAll('iframe, [role="button"]')).some((node) => node.offsetHeight > 0);
}

function WebGoogleButton() {
  const { busy, error, setError, signIn } = useGoogleLogin();
  const face = useFaceStyle();
  const host = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    let active = true;
    renderGoogleButton(element, { onCredential: (idToken) => signIn(() => Promise.resolve(idToken)), dark: false, width: element.offsetWidth || 320 })
      .then(() => {
        if (active) setReady(googleButtonDrawn(element));
      })
      .catch(() => {
        if (active) setError('Google sign-in couldn’t load. Check your connection and try again.');
      });
    const check = setTimeout(() => {
      if (active) setReady(googleButtonDrawn(element));
    }, RENDER_GRACE_MS);
    return () => {
      active = false;
      clearTimeout(check);
    };
  }, [setError, signIn]);

  // Only reached when Google's invisible button isn't there to take the click.
  const onFallbackPress = () => setError(googleButtonDrawn(host.current ?? document.body) ? null : 'Google sign-in is still loading. Try again in a moment.');

  return (
    <>
      <Pressable
        onPress={onFallbackPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        style={({ hovered }) => [styles.button, face, { opacity: busy ? 0.6 : hovered ? 0.9 : 1 }]}
      >
        <ButtonFace busy={busy} />
        <View ref={host} testID="google-sign-in" style={[styles.googleLayer, !ready && styles.hiddenLayer]} />
      </Pressable>
      <ErrorText message={error} />
    </>
  );
}

function ErrorText({ message }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert">
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'stretch', minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15.5, fontWeight: '700' },
  spinner: { marginLeft: 4 },
  // Google's real button sits on top, nearly transparent, stretched to cover the whole face.
  googleLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY: 1.3 }] },
  hiddenLayer: { pointerEvents: 'none' },
  error: { fontSize: 13, textAlign: 'center' },
});
