/**
 * The Google Sign-In library's web support is part of its paid edition, so the web build
 * signs in with email and password only. The Android and iOS apps show the Google button.
 */
export const googleSignInAvailable = false;

export async function getGoogleIdToken() {
  throw new Error('Sign in with Google from the Android or iOS app.');
}

export async function signOutOfGoogle() {}
