import { createStore, Store } from 'kiss-for-react';
import { ClicksPersistor } from './persistor';
import type { State } from './state';

/**
 * Creates the store of the app, from the state the server sent. On the client, this runs once
 * per page load (see `client.tsx`): there is no client-side router here, so every page is a
 * full page load, with its own store. The server has its own store per request (`server.tsx`).
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
