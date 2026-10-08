const reactNativeConfig = require('@react-native/eslint-config/flat');

module.exports = [
  {
    ignores: ['android/', 'ios/', 'vendor/'],
  },
  ...reactNativeConfig,
  {
    // This app has no Flow code, and the eslint-plugin-ft-flow@2 used by
    // @react-native/eslint-config crashes on ESLint 9 when these rules run.
    files: ['**/*.js'],
    rules: {
      'ft-flow/define-flow-type': 'off',
      'ft-flow/use-flow-type': 'off',
    },
  },
  {
    files: ['jest.setup.js'],
    languageOptions: {
      globals: { jest: 'readonly' },
    },
  },
  {
    rules: {
      quotes: ['error', 'single'],
      'react-native/no-inline-styles': 'off',
      'no-trailing-spaces': 'off',
      curly: 'off',
      'comma-dangle': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
];
