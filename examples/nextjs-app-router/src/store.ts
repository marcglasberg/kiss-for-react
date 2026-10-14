import { createStore, Store } from 'kiss-for-react';
import { ClicksPersistor } from './persistor';
import type { State } from './state';

/**
 * Creates the store of the app, from the state the server loaded. On the client, this runs once
 * (see `KissProvider.tsx`). On the server, it runs once per request, when the client components
 * are server-rendered: the store is used for that render only, and discarded.
 */
export function createAppStore(initialState: State): Store<State> {
  return createStore<State>({
    initialState,

    // The persistor reads localStorage, which only exists in the browser. On the server, the
    // store renders once and is discarded, and must not read or save anything.
    persistor: typeof window === 'undefined' ? undefined : new ClicksPersistor(initialState),

    // The page shows the errors of the actions with `useIsFailed` and `useExceptionFor`, so
    // the UserExceptions are not shown in a dialog here.
    showUserException: (_exception, _count, next) => next(),
  });
}
