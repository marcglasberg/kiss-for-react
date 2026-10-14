'use client';
import { StoreProvider } from 'kiss-for-react';
import { useState, type ReactNode } from 'react';
import type { State } from './state';
import { createAppStore } from './store';

/**
 * Provides the store to the client components. It's a client component, since the store and
 * the provider live on the client. The root layout (a server component) renders it with the
 * state it loaded, which arrives here as a plain prop.
 *
 * The store is created once, with `useState`, so that it survives re-renders and client-side
 * navigation (the layout stays mounted when the page changes). When this component is
 * server-rendered, it creates a store for that render, which is discarded with it.
 *
 * `serverState` is the state the server HTML was rendered from. React needs to render exactly
 * that while hydrating, and the client store may already differ: the persistor may have
 * restored the clicks before hydration. With `serverState`, the hooks render it while
 * hydrating, and then catch up with the live store.
 */
export function KissProvider({ initialState, children }: { initialState: State; children: ReactNode }) {
  const [store] = useState(() => createAppStore(initialState));
  return (
    <StoreProvider store={store} serverState={initialState}>
      {children}
    </StoreProvider>
  );
}
