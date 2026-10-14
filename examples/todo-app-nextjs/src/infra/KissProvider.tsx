'use client';
import { StoreProvider } from 'kiss-for-react';
import { useState, type ReactNode } from 'react';
import { State } from '../business/State';
import { createAppStore } from './store';

/**
 * Provides the store to the client components. It's a client component, since the store and
 * the provider live on the client. The root layout (a server component) renders it.
 *
 * The store is created once, with `useState`, so that it survives re-renders and client-side
 * navigation (the layout stays mounted when the page changes). When this component is
 * server-rendered, it creates a store for that render, which is discarded with it.
 *
 * The store starts from `State.initialState` (no todos, filter "all"): the todos come from the
 * server through the page's `StoreSlice` (`app/page.tsx`), not from here. `serverState` is
 * the state the server HTML is rendered from, outside any slice: the same static instance,
 * so React renders exactly that while hydrating, even if the client store already differs
 * (the slice adds the todos to the server state of the page's subtree).
 *
 * What happens on load, with the ClassPersistor (`store.ts`, browser only):
 * 1. The server renders the page with the todos of its file; the HTML lists them.
 * 2. In the browser, the store is created, and the persistor starts reading localStorage,
 *    where the whole state of the last visit is saved: its todos (now stale) and its filter.
 * 3. The page's `StoreSlice` mounts and merges the server's todos into the store. If the
 *    persistor hasn't finished, Kiss keeps the slice, and merges it again on top of the
 *    restored state when it arrives. Either way, the result is: the todos from the server,
 *    and the filter the user chose on the last visit.
 * 4. Hydration renders the server state (server todos, filter "all"), matching the HTML, and
 *    then the page catches up with the live store (same todos, the restored filter).
 */
export function KissProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAppStore(State.initialState));
  return (
    <StoreProvider store={store} serverState={State.initialState}>
      {children}
    </StoreProvider>
  );
}
