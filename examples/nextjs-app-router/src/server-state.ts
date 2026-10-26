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
 * process serves, mixing the users' data. It's a server store (`server: true`): the actions
 * that poll, retry or debounce on the client run once here, and start no timers. The store is
 * still disposed at the end, so that its props, pending waits and dependencies leave nothing
 * behind.
 */
export async function loadInitialState(): Promise<State> {
  const store = createStore<State>({ initialState: emptyState, server: true });
  try {
    await store.dispatchAndWait(new LoadItems());
    return store.state;
  } finally {
    await store.dispose();
  }
}
