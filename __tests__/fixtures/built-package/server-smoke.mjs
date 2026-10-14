// The ESM twin of `server-smoke.cjs`: loads the BUILT package under the `react-server` export
// condition, with Node native ESM: `node --conditions=react-server server-smoke.mjs`.
// Prints `function:undefined:undefined:2`.
import React from 'react';
import * as kiss from 'kiss-for-react';

class Increment extends kiss.KissAction {
  reduce() {
    return { count: this.state.count + 1 };
  }
}

const store = kiss.createStore({ initialState: { count: 1 }, logger: () => {} });
store.dispatch(new Increment());
process.stdout.write([typeof kiss.createStore, typeof kiss.useSelect, typeof React.createContext, store.state.count].join(':'));
