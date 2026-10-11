/**
 * app.json with the one value that must not be committed.
 *
 * `react-native-maps` needs a Google Maps key in a release Android build, or
 * the map renders as a blank grey box. Expo Go brings its own key and iOS uses
 * Apple Maps, so nothing else needs it. Set GOOGLE_MAPS_ANDROID_API_KEY as an
 * EAS environment variable (restricted in Google Cloud to this package name
 * and the signing certificate's SHA-1). Without it the plugin adds no key, and
 * the build still succeeds.
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY }],
  ],
});
