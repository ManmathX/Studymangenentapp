import { GOOGLE_WEB_CLIENT_ID } from '../config/env';

/**
 * Google sign-in on the web build, using Google Identity Services ("Sign in with Google").
 * Google renders its own button (see screens/auth/GoogleButton.web.js) and hands back an ID
 * token for the web client, the same token the Android and iOS apps send to the API.
 * The page's origin must be listed under "Authorized JavaScript origins" on that client.
 */
export const googleSignInAvailable = Boolean(GOOGLE_WEB_CLIENT_ID);

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let loading = null;
let handler = () => {};
let initialized = false;

/** Loads the Google Identity Services script once. Resolves to `window.google`. */
function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error('Google sign-in did not load')));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Google sign-in did not load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Draws Google's button into `element`. `onCredential` receives the ID token when the student
 * picks an account. Google allows one set-up per page, so later calls only swap the handler.
 */
export async function renderGoogleButton(element, { onCredential, dark, width }) {
  const google = await loadScript();
  handler = onCredential;
  if (!initialized) {
    google.accounts.id.initialize({
      client_id: GOOGLE_WEB_CLIENT_ID,
      callback: (response) => handler(response.credential),
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    initialized = true;
  }
  google.accounts.id.renderButton(element, {
    type: 'standard',
    theme: dark ? 'filled_black' : 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    logo_alignment: 'left',
    width: Math.round(Math.max(200, Math.min(400, width))),
  });
}

/** The native flow isn't used on the web; Google's own button starts sign-in. */
export async function getGoogleIdToken() {
  throw new Error('Use the “Continue with Google” button.');
}

/** Stops Google from signing the same account straight back in after "Sign out". */
export async function signOutOfGoogle() {
  window.google?.accounts?.id?.disableAutoSelect();
}
