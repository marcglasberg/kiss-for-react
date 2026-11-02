// The tests are BDDs of the state and the actions (no UI), in `__tests__/bdd.<Topic>.test.ts`.
export default {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        target: 'es2023',
        module: 'esnext',
        moduleResolution: 'bundler',
        types: ['node'],
        strict: true,
        skipLibCheck: true,
      },
    }],
  },
};
