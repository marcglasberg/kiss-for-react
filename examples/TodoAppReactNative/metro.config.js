const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

// const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
// const path = require('path');
//
// const thirdPartyPath = path.resolve(__dirname, '../../');
//
// const config = {
//   resolver: {
//     extraNodeModules: {
//       'kiss-for-react': thirdPartyPath,
//     },
//   },
//   watchFolders: [thirdPartyPath],
// };
//
// module.exports = mergeConfig(getDefaultConfig(__dirname), config);


