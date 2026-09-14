module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // react-native-worklets/plugin must stay LAST. Reanimated 4 moved the
    // worklet transform into its own package, so the old
    // 'react-native-reanimated/plugin' entry is gone; naming it here would fail
    // the build outright rather than silently, which is the good case.
    plugins: ['react-native-worklets/plugin'],
  };
};
