// Loaded by Jest before each test file (see `setupFilesAfterEnv` in `jest.config.js`).

// Tells React that the tests use `act()`, so that it warns about updates outside of it.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The jsdom environment has no `TextEncoder`/`TextDecoder`, which the browser build of
// `react-dom/server` (React 18) needs. Node has them in `util`.
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
