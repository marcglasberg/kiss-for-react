import { createStore } from 'kiss-for-react';
import { LoadItems } from './actions';
import { emptyState, type State } from './state';

/**
 * Loads the state of a request, on the server. Called by the `getServerSideProps` of each page,
 * which returns the result as the `initialState` prop. `pages/_app.tsx` creates the client
 * store from it.
 *
 * It uses a store and an action to load the data, so that the loading logic is the same as on
 * the client. In the pages router there are no React Server Components: `kiss-for-react`
 * resolves to its normal entry here too, which is fine on the server (the hooks are simply not
 * called). Next.js strips `getServerSideProps`, and the modules only it imports, from the
 * client bundle, so this file never reaches the browser.
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
