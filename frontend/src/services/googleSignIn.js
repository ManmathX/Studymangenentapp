import { TurboModuleRegistry } from 'react-native';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../config/env';

/**
 * Google Sign-In on Android and iOS. The native module only exists in builds made with EAS
 * or `expo run` (not Expo Go), so the library is loaded lazily and the button is hidden
 * when it is missing or no client ID is configured. The web build uses googleSignIn.web.js.
 */
const nativeModulePresent = Boolean(TurboModuleRegistry.get('RNGoogleSignin'));

export const googleSignInAvailable = nativeModulePresent && Boolean(GOOGLE_WEB_CLIENT_ID);

let configured = false;

function library() {
  const google = require('@react-native-google-signin/google-signin');
  if (!configured) {
    google.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}) });
    configured = true;
  }
  return google;
}

/** Shows Google's account picker. Resolves to an ID token, or null if the student backed out. */
export async function getGoogleIdToken() {
  if (!googleSignInAvailable) throw new Error('Google sign-in isn’t available in this version of the app.');
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = library();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) throw new Error('missing id token');
    return response.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.IN_PROGRESS) return null;
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Update Google Play services on this phone, then try again.');
    }
    throw new Error('Google sign-in didn’t work. Check your connection and try again.');
  }
}

/** Forgets the Google account on this device so the picker shows again next time. */
export async function signOutOfGoogle() {
  if (!googleSignInAvailable) return;
  try {
    await library().GoogleSignin.signOut();
  } catch {
    // Signing out of the app must not fail because Google's session couldn't be cleared.
  }
}
