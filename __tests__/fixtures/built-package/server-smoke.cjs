// Loads the BUILT package under the `react-server` export condition, as a React Server
// Components bundler does for the modules of server components, and as Node does with
// `node --conditions=react-server server-smoke.cjs`. Run from the repository root, after
// `npm run build` (or from the consumer of `scripts/pack-smoke.cjs`). Prints
// `function:undefined:undefined:2` (see `build.esm.test.ts`): `createStore` exists, `useSelect`
// doesn't, React is its server build (no `createContext`), and the store works. The ESM twin
// is `server-smoke.mjs`.
const React = require('react');
const kiss = require('kiss-for-react');

class Increment extends kiss.KissAction {
  reduce() {
    return { count: this.state.count + 1 };
  }
}

const store = kiss.createStore({ initialState: { count: 1 }, logger: () => {} });
store.dispatch(new Increment());
process.stdout.write([typeof kiss.createStore, typeof kiss.useSelect, typeof React.createContext, store.state.count].join(':'));
