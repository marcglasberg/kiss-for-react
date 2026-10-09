module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testPathIgnorePatterns: ['/node_modules/', '/fixtures/', '/fixture/', '/.*\\.fixture\\.ts$/', '<rootDir>/examples/',
    // The demo files of the ESLint plugin (one is named like a test, to show a rule for tests).
    '<rootDir>/eslint-plugin/testing/'],
  modulePathIgnorePatterns: ['<rootDir>/examples/', '<rootDir>/lib/', '<rootDir>/eslint-plugin/lib/'],
  // The ESLint plugin is ESM, so its imports end with `.js`, but the files are `.ts`.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};
