/**
 * Extends app.json. Google Sign-In on iOS needs the iOS OAuth client's URL scheme
 * (com.googleusercontent.apps.…); set GOOGLE_IOS_URL_SCHEME for iOS builds. Android builds
 * need nothing extra here: register the app's SHA-1 on an Android OAuth client instead.
 */
const PLUGIN = '@react-native-google-signin/google-signin';

module.exports = ({ config }) => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  if (!iosUrlScheme) return config;
  return {
    ...config,
    plugins: (config.plugins ?? []).map((plugin) => (plugin === PLUGIN ? [PLUGIN, { iosUrlScheme }] : plugin)),
  };
};
