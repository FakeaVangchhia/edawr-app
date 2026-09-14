/**
 * Jest module resolution, with one exception carved out for worklets.
 *
 * Reanimated 4 moved its worklets runtime into `react-native-worklets`, whose
 * `WorkletsModule/NativeWorklets.native.ts` reaches for the native module at
 * *import* time. Under Jest there is no native module, so the import throws
 * `Cannot read properties of undefined (reading 'loadUnpackers')` — a message
 * naming neither Reanimated nor the component that imported it. It takes down
 * every suite that renders anything animated.
 *
 * The package ships a plain `NativeWorklets.ts` beside the `.native` one for
 * exactly this case, so the fix is resolution rather than mocking: drop the
 * `.native` extensions while resolving anything inside that package, and Jest
 * picks the non-native file. Tests then run against the real Reanimated, which
 * is what `react-native-reanimated/mock` cannot offer — that mock re-imports
 * the real module on its way in, so it fails identically.
 *
 * **This delegates to React Native's resolver, not Jest's default.** Worklets'
 * own `jest/resolver.js` does the extension filtering and then calls
 * `options.defaultResolver`, which would drop the Haste and platform-extension
 * handling that `jest-expo` installs by pointing `resolver` at RN's. Setting
 * `resolver` in this project replaces jest-expo's outright, so the delegation
 * has to be put back deliberately — hence this file rather than a bare
 * reference to the one in `node_modules`.
 */
const reactNativeResolver = require('@react-native/jest-preset/jest/resolver');

/** @type {import('jest-resolve').SyncResolver} */
module.exports = (request, options) => {
  const isWorklets =
    request.includes('react-native-worklets') ||
    (options.basedir && options.basedir.includes('react-native-worklets'));

  if (isWorklets && options.extensions) {
    options = {
      ...options,
      extensions: options.extensions.filter((ext) => !ext.includes('native')),
    };
  }

  return reactNativeResolver(request, options);
};
