import { createStore } from 'kiss-for-react';
import { LoadItems } from './actions';
import { emptyState, type State } from './state';

/**
 * Loads the state of a request, on the server. Called by the root layout, a server component,
 * which passes the result to the client `KissProvider`.
 *
 * It uses a store and an action to load the data, so that the loading logic is the same as on
 * the client. This module runs in server components, where `kiss-for-react` resolves to its
 * server entry: the store and the actions, with no hooks.
 *
 * One store per request: a module-level store would be shared by all the requests the Node
 * process serves, mixing the users' data. The store is disposed at the end, so that it leaves
 * no timers behind (this app has none, but a polling or debounced action would).
 */
export async function loadInitialState(): Promise<State> {
  const store = createStore<State>({ initialState: emptyState });
  try {
    await store.dispatchAndWait(new LoadItems());
    return store.state;
  } finally {
    await store.dispose();
  }
}
