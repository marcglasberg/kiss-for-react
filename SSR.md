# Server-side rendering (SSR) and Kiss

This file records what Kiss currently supports for server-side rendering, what has been
verified, what has not, and what is needed before we can state "Kiss works well with SSR"
(and with frameworks such as Next.js) in the README and on the docs site.

Status, as of 2026-10-12: **the React primitives are in place and tested in isolation.
No framework integration has been tried.** Do not advertise Next.js/Remix support yet.

## 1. What SSR is, in two paragraphs

With plain client rendering, the server sends an almost empty HTML page and a script. The
browser runs React, which builds the DOM from scratch. Until the script runs, the user sees a
blank page, and search engines see nothing.

With SSR, the server runs the React components in Node, producing the full HTML of the page.
The browser shows that HTML immediately. Then React runs on the client and **hydrates**: it
renders the same components, attaches event handlers to the existing DOM instead of creating
it again, and from then on the page is a normal client-side React app. Hydration requires
that the first client render produces exactly the same output as the server did, otherwise
React reports a "hydration mismatch" and, in the worst case, throws the server HTML away and
re-renders on the client. Frameworks such as Next.js, Remix and React Router do the server
part for you, and add their own conventions (per-request data loading, streaming, React Server
Components).

For a state-management library like Kiss, SSR raises three questions:

1. Can the hooks run on the server, where there is no DOM, no effects, and no subscriptions?
2. How does the state the server rendered with reach the client, so that hydration matches?
3. Is the store safe to create on the server, where many requests run in the same process?

## 2. What Kiss does today

Since the hooks moved to `useSyncExternalStore` (see `STATE_REFACTOR_REPORT.md`), each hook
has a **server snapshot**, which React uses on the server and during hydration:

| Hook | Server/hydration value |
| --- | --- |
| `useSelect`, `useObject`, `useAllState` | selector applied to `serverState` (or the store's `initialState`) |
| `useIsWaiting`, `useIsFailed` | `false` |
| `useExceptionFor` | `null` |
| `useIsStoreReady` | `true` |
| `useDispatch` and friends | the store's dispatch functions (calling them during a server render has no effect on the HTML) |
| `useStoreEffect` | never runs on the server (it is a passive effect) |

`StoreProvider` takes an optional `serverState` prop. When absent, the server snapshot is the
`initialState` the store was created with. See the "Server-side rendering" section of the
README for the intended usage.

The core runtime (`src/Store.tsx`, `src/KissAction.ts`, `src/Hooks.tsx`, ...) does not
reference `window`, `document`, `localStorage` or `react-dom`, so it loads in Node. The only
browser-specific code is in the example persistor of `ClassPersistor` documentation.

### Verified (automated, React 18.3.1 and 19.3.0)

Scenarios H01 to H09 in `__tests__/bdd.ExternalStoreServerRendering.test.tsx` (Node
environment) and `__tests__/bdd.ExternalStoreHydration.test.tsx` (jsdom):

- Every hook renders with `renderToString`, with no DOM and no "missing getServerSnapshot"
  error.
- The server renders `serverState` when given, or the store's initial state otherwise.
- Two requests with their own stores do not share state, status or readiness.
- A class-based state with a `Map` can be rendered on the server, transferred as JSON, and
  restored on the client with its methods.
- A server render leaves nothing behind: no subscription, no effect, no dispatched action.
- Hydrating with the same state as the server produces no mismatch and no extra render.
- When the client store changed before hydration, hydration uses `serverState`, then the
  components catch up with the live store.
- A `Suspense` boundary hydrated later (lazy component) still matches the server HTML, then
  catches up with the store.
- Readiness and status hydrate as the server rendered them, then follow the client store.

`scripts/pack-smoke.cjs` also renders every hook with `renderToString` from the **built,
packed** package, in both ESM and CJS, in an isolated consumer, on React 18 and 19.

### Not verified

- Any framework: Next.js (pages router or app router), Remix, React Router framework mode,
  Astro, Vite SSR.
- Streaming (`renderToPipeableStream`, `renderToReadableStream`) with Suspense boundaries that
  resolve during streaming.
- React Server Components: which parts of Kiss are usable in a server component, and whether
  the `'use client'` boundary needs a wrapper.
- A real browser hydrating real server HTML (the automated tests use jsdom).
- Behaviour of store features that use timers on the server: polling, `dispatchWhen` with a
  timeout, debounce, throttle, retry delays, `waitCondition` with a timeout. A server render
  is synchronous and short-lived, so pending timers would leak if actions were dispatched
  during it and never awaited.
- Persistence on the server. A server store should not have a persistor, or should have one
  that reads per-request data. `useIsStoreReady` returns `true` on the server regardless.

## 3. Known design constraints

- **One store per request on the server.** A module-level `createStore(...)` singleton would be
  shared by all requests in the same Node process, mixing users' states. On the client, the
  usual singleton is fine.
- **The state must be serializable, or you must provide the serialization.** Plain objects go
  through JSON. Class instances, `Map`, `Set`, `Date` and so on need `toJSON`/`fromJSON` code,
  or the same serializer used for persistence. Kiss does not ship a transfer helper.
- **Hydration renders `serverState`, not the live store.** If the client store is created with
  a different state than the server rendered with, pass the transferred state as
  `serverState`, or React will report a mismatch. After hydration the components follow the
  store.
- **Status hooks are blank on the server.** The HTML never shows a spinner, a failure or a
  "not ready" store. If the page needs server-rendered data, dispatch the actions on the
  server and `await` them before rendering.
- **Dispatching during a server render is pointless.** `renderToString` is one synchronous
  pass; nothing re-renders. Actions dispatched from a component body or from `useStoreEffect`
  (which does not run on the server) will not affect the HTML and may leave timers behind.

## 4. What is needed to state "Kiss works well with SSR"

Each item below is a concrete deliverable. When all are done, the README can say that Kiss
supports SSR with Next.js (and whichever other frameworks were covered), with a link to the
example.

### 4.1 Framework example apps (in `examples/`)

1. **Next.js app router** (`examples/nextjs-app-router`):
   - A `'use client'` `StoreProvider` wrapper that creates the store once per client, with
     `useState(() => createStore(...))` or `useRef`, receiving the initial state as a prop from
     a server component.
   - A server component that loads data (e.g. from a fake API), builds the state, and passes
     it serialized to the client wrapper.
   - Pages that use `useSelect`, `useObject`, `useIsWaiting`, `useIsFailed`, `useIsStoreReady`
     and `useStoreEffect`.
   - Navigation between two routes that share the store, to confirm the store survives client
     navigation and is not re-created.
2. **Next.js pages router** (`examples/nextjs-pages-router`): the same with `getServerSideProps`
   and a store created in `_app.tsx`, since this is still the most common setup.
3. **Plain Node + Express** (`examples/ssr-express`): `renderToPipeableStream` on the server,
   `hydrateRoot` on the client, no framework. This isolates Kiss from framework conventions.

Each example should include a persistor on the client (localStorage) to exercise the
"client store changed before hydration" path, and show the `serverState` prop being used.

### 4.2 Automated checks

1. **End-to-end test per example** (Playwright): build the example, start it, open the page
   with JavaScript disabled and assert the HTML already contains the server-rendered state;
   open with JavaScript enabled and assert zero hydration warnings in the console, then
   dispatch an action by clicking and assert the DOM updates.
2. **Streaming BDDs** in `__tests__/bdd.ExternalStoreStreaming.test.tsx`: render with
   `renderToPipeableStream`, with a lazy component inside `Suspense`, collect the chunks, and
   assert that the state appears in the streamed HTML and that hydrating the complete HTML
   produces no mismatch.
3. **Server-safety BDDs** in `__tests__/bdd.ExternalStoreServerSafety.test.tsx`:
   - Creating a store, dispatching and awaiting async actions, and rendering, leaves no live
     timers (use `jest.useFakeTimers()` and `jest.getTimerCount()`).
   - Polling, debounce, throttle and `dispatchWhen` timers are cleared when the server store
     is discarded. If there is no API for that today, add `store.dispose()` (or similar) and
     document that server code must call it after rendering.
   - A persistor that throws on the server (because `localStorage` is undefined) does not
     break `renderToString`; the readiness hook still renders `true`.
4. **React Server Components check**: a test that imports `kiss-for-react` in an environment
   with the `react-server` export condition (as Next.js does for server components) and
   confirms that importing the package does not throw. If the hooks file breaks that import,
   split the entry points (`kiss-for-react` for client, `kiss-for-react/server` or a
   `react-server` condition for RSC) so that `createStore` and actions can be used in server
   components while hooks stay client-only.
5. **CI**: run the example builds and the Playwright tests in `.github/workflows/ci.yml` on
   React 18 and 19, and on the two most recent Next.js majors.

### 4.3 Library changes likely to be needed

These are expectations, to be confirmed by the examples and tests above:

- `store.dispose()` (or `store.close()`): cancels polling cycles, pending `dispatchWhen`,
  debounce/throttle timers and retry waits, and drops listeners. Needed for per-request
  server stores so that Node processes do not leak timers.
- A documented `'use client'` story. Either Kiss ships a `'use client'` directive at the top
  of the hooks entry (so that importing the hooks from a server component gives a clear
  error), or the docs show the wrapper pattern. The directive approach needs the ESM build
  to keep the directive, which `scripts/fix-esm.cjs` must not strip.
- Possibly a `serializeState`/`deserializeState` hook on `createStore`, reusing the
  persistence serializer, so that the transfer of class-based states is one line.
- `useIsStoreReady` on the server: today it is `true`. If a server store does have a
  persistor, the server should `await store.ready()` before rendering, and the docs should
  say so (they do, in the README).

### 4.4 Documentation

- README: keep the current "Server-side rendering" section and add a "Next.js" subsection
  linking to the example, once it exists.
- Docs site (`../kissforreact.org`): a dedicated "Server-side rendering" page with the
  per-request store rule, the `serverState` prop, serialization, and the framework examples.
- CHANGELOG: list `serverState` and `dispose()` (if added).

## 5. Decision

Until section 4 is done, the accurate statement is:

> Kiss renders on the server with `renderToString` and hydrates with `hydrateRoot` on React 18
> and 19. Every hook has a server snapshot, and the `serverState` prop of `StoreProvider`
> controls what the server renders and what hydration matches. Framework integration
> (Next.js, Remix) and streaming are not yet verified.

That sentence is what the README currently supports, and nothing stronger.
