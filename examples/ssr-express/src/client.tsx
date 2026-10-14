import { StoreProvider } from 'kiss-for-react';
import { hydrateRoot } from 'react-dom/client';
import { App, lazyLateItems } from './App';
import type { State } from './state';
import { createAppStore } from './store';

// The state the server rendered the page from, transferred in a JSON `<script>` (see `App.tsx`).
const state: State = JSON.parse(document.getElementById('kiss-state')!.textContent!);

// The store of this page load, with the persistor (see `store.ts`), which may restore the
// clicks from localStorage before the page hydrates.
const store = createAppStore(state);

// The lazy component of this page load, created once, like the store (see `App.tsx`).
const LateItems = lazyLateItems();

// `serverState` is the state the server HTML was rendered from. React needs to render exactly
// that while hydrating, and the live store may already differ: the persistor may have restored
// the clicks before hydration. With `serverState`, the hooks render it while hydrating, and
// then catch up with the live store. Here the store was created with that same state, so
// `serverState` could be left out (it defaults to the store's initial state), but it's explicit.
//
// The whole document is hydrated, since React rendered the whole document on the server. The
// scripts the server added after it (the bootstrap script, and the ones that put the streamed
// Suspense content in place) are left alone by the hydration.
hydrateRoot(
  document,
  <StoreProvider store={store} serverState={state}>
    <App url={window.location.pathname} serverState={state} LateItems={LateItems} />
  </StoreProvider>,
);
