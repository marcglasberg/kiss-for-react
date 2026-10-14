import {
  useDispatch,
  useExceptionFor,
  useIsFailed,
  useIsStoreReady,
  useIsWaiting,
  useObject,
  useSelect,
  useStoreEffect,
} from 'kiss-for-react';
import { lazy, Suspense, useState, type ComponentType } from 'react';
import { AddItem, Increment, MarkHydrated } from './actions';
import type { State } from './state';

/**
 * Creates the lazy component that streams after the shell. The delay in the import makes sure
 * of it: the server sends the shell as soon as it's ready (`onShellReady`, in `server.tsx`),
 * with the Suspense fallback, and the content of the boundary when this import resolves. The
 * client (`client.tsx`) imports it the same way, so the boundary hydrates when it resolves,
 * after the shell. esbuild inlines the dynamic import, as the bundles have no code splitting.
 *
 * It's a factory, called once per request on the server and once per page load on the client,
 * and not a module-level `const LateItems = lazy(...)`, because `React.lazy` keeps the module
 * once it's loaded: in a long-lived server, a module-level lazy component suspends on the
 * first request only, and renders in the shell of every request after it, so nothing streams.
 * (A real app streams data, not code: a component that reads a promise with `use`, created
 * per request, suspends on every request. The same rule applies: the promise must be per
 * request.)
 */
export function lazyLateItems(): ComponentType {
  return lazy(() => new Promise((resolve) => setTimeout(resolve, 150)).then(() => import('./LateItems')));
}

/**
 * The whole document is rendered by React, on the server (`renderToPipeableStream`) and on the
 * client (`hydrateRoot(document, ...)`). The state travels to the client in a JSON `<script>`,
 * rendered here with the same text on both sides, so that it hydrates without a mismatch.
 * `LateItems` is the lazy component of this request or page load (see `lazyLateItems`).
 */
export function App({ url, serverState, LateItems }: { url: string; serverState: State; LateItems: ComponentType }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Kiss + Express</title>
      </head>
      <body style={{ fontFamily: 'sans-serif', maxWidth: 640, margin: '2rem auto' }}>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <a href="/">Home</a>
          <a href="/about" data-testid="to-about">About</a>
        </nav>
        {url === '/about' ? <AboutPage /> : <HomePage LateItems={LateItems} />}
        <script id="kiss-state" type="application/json" dangerouslySetInnerHTML={{ __html: serializeState(serverState) }} />
      </body>
    </html>
  );
}

/**
 * The state as JSON, for the `<script type="application/json">` of the page. In HTML, the text
 * of a script ends at the first `</script>`, so a `<` in the state (a user's text, say) could
 * close the script early and inject markup. JSON allows `\u003c` for `<`, so `<` is escaped
 * that way: the text stays valid JSON, and `JSON.parse` on the client gives `<` back.
 */
export function serializeState(state: State): string {
  return JSON.stringify(state).replace(/</g, '\u003c');
}

/**
 * The home page. On the server, the hooks render the `serverState` of the provider; the status
 * hooks render "nothing in progress".
 */
function HomePage({ LateItems }: { LateItems: ComponentType }) {
  const loadedAt = useSelect((s: State) => s.loadedAt);
  const items = useObject((s: State) => s.items);
  const clicks = useSelect((s: State) => s.clicks);
  const hydrated = useSelect((s: State) => s.hydrated);
  const isReady = useIsStoreReady();
  const isAdding = useIsWaiting(AddItem);
  const addFailed = useIsFailed(AddItem);
  const addError = useExceptionFor(AddItem);
  const dispatch = useDispatch();
  const [text, setText] = useState('');

  // Runs on the client only, after hydration (and after the store is ready).
  useStoreEffect({ onMount: (store) => store.dispatch(new MarkHydrated()) });

  return (
    <main>
      <h1>Kiss + Express</h1>
      <p>
        Items loaded on the server at <code data-testid="loaded-at">{loadedAt}</code>
      </p>
      <ul data-testid="items">
        {items.map((item) => <li key={item.id}>{item.text}</li>)}
      </ul>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          dispatch(new AddItem(text));
          setText('');
        }}
      >
        <input
          data-testid="new-item"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder='New item ("fail" fails)'
        />
        <button type="submit" data-testid="add-item" disabled={isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </button>
        {addFailed && <p data-testid="add-error" style={{ color: 'crimson' }}>{addError?.message}</p>}
      </form>

      <p>
        Clicks: <strong data-testid="clicks">{clicks}</strong>{' '}
        <button data-testid="increment" onClick={() => dispatch(new Increment())}>+1</button>
        <br />
        <small>The clicks are kept in localStorage, and survive a reload. The items come from the server.</small>
      </p>

      <p>
        Hydrated: <span data-testid="hydrated">{hydrated ? 'yes' : 'no'}</span>
        {' · '}
        Store ready: <span data-testid="ready">{isReady ? 'yes' : 'no'}</span>
      </p>

      <Suspense fallback={<p data-testid="late-items-fallback">Loading the item count…</p>}>
        <LateItems />
      </Suspense>
    </main>
  );
}

/**
 * A second page. There is no client-side router here: the link to it is a full page load, so
 * the server renders it with a new store (0 clicks), and the client creates a new store for it,
 * whose persistor restores the clicks made on the home page.
 */
function AboutPage() {
  const clicks = useSelect((s: State) => s.clicks);
  const hydrated = useSelect((s: State) => s.hydrated);
  const itemCount = useSelect((s: State) => s.items.length);
  useStoreEffect({ onMount: (store) => store.dispatch(new MarkHydrated()) });
  return (
    <main>
      <h1>About</h1>
      <p>
        A new store, after a full page load: <strong data-testid="clicks">{clicks}</strong> clicks,{' '}
        <span data-testid="item-count">{itemCount}</span> items, hydrated:{' '}
        <span data-testid="hydrated">{hydrated ? 'yes' : 'no'}</span>.
      </p>
    </main>
  );
}
