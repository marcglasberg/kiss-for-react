
// Only the modules added here will be transformed, inside directory node_modules.
const packagesToTransformWithBabel = [
  '@react-native',
  'react-native',
  '@react-native-async-storage',
  'react-native-bouncy-checkbox',
  '@freakycoder/react-native-bounceable',
];

const transformIgnorePatterns = [
  `<rootDir>/node_modules/(?!(${packagesToTransformWithBabel.join('|')})/)`,
];

module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: transformIgnorePatterns,
  testPathIgnorePatterns: ['/node_modules/', '/fixtures/', '/fixture/', '/.*\\.fixture\\.ts$/'],
};
