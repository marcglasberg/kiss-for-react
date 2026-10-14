# Server-side rendering (SSR) and Kiss

This file records what Kiss implements for server-side rendering, what is verified and how, and
what was considered and not done. The work was done on 2026-10-14, in two steps: first the
framework-level requirements ("supported": the primitives, React Server Components, per-request
stores, three framework examples), then the per-route merge pattern (`StoreSlice`) and the
mutation story, which make Kiss a solid choice as the sole state management of a Next.js app.

Status: **done.** The four conditions of section 5 hold.

## 1. What is implemented

### 1.1 The React primitives

Each hook has a **server snapshot**, which React uses on the server and during hydration:

| Hook | Server/hydration value |
| --- | --- |
| `useSelect`, `useObject`, `useAllState` | selector applied to `serverState` (or the store's `initialState`) |
| `useIsWaiting`, `useIsFailed` | `false` |
| `useExceptionFor` | `null` |
| `useIsStoreReady` | `true` |
| `useDispatch` and friends | the store's dispatch functions (no effect on the HTML) |
| `useStoreEffect` | never runs on the server (passive effect) |

`StoreProvider` takes an optional `serverState` prop: the state the server HTML was rendered
from. On the server, the hooks render it. On the client, they render it while hydrating, even if
the live store already changed (a persistor may have restored a newer state), and then catch up
with the live store. When absent, it's the `initialState` the store was created with.

### 1.2 React Server Components

- `src/Hooks.tsx` and `src/StoreProvider.tsx` (the context, the provider and `StoreSlice`) are
  the only modules that import React, and both start with `'use client'`. The core runtime
  imports nothing from React, and references no `window`, `document`, `localStorage` or
  `react-dom`.
- `src/server.ts` is a server entry: everything except the hooks. The package exposes it
  through the `react-server` export condition (which the bundlers of React Server Components
  use for server components), and as `kiss-for-react/server`. A server component can import
  `createStore`, the actions, and the `StoreProvider` and `StoreSlice` components (their module
  is `'use client'`, so the bundler turns them into client references); importing a hook there
  is a build error.
- `StoreProvider.tsx` reads React's exports through the default import and guards
  `createContext`, so that the server entry also loads in plain Node with the `react-server`
  condition (React's server build has no `createContext`), which the package's tests use.

### 1.3 Per-request stores

`store.dispose()` shuts the store down (stopping polling, debounce, retry and the other
features), cancels the pending `dispatchWhen`s, rejects the pending `waitCondition`s,
`waitActionCondition`s, `waitAllActions`s and the other waits with an `AbortDispatchException`
(cancelling their timeouts; inside an action, that aborts the action without a failure), pauses
the persistor and cancels its pending save, and disposes the props. A server creates one store
per request, renders, and disposes it, leaving no timer in the Node process.

### 1.4 The per-route merge: `StoreSlice`

A server-rendered app has many routes, each loading its own data on the server, and one store
above them (the root layout, or `_app.tsx`). `StoreSlice` gives a route's data to the store:

```tsx
<StoreSlice state={{ user }} key={`${user.id}:${user.updatedAt}`}>
  <UserView />
</StoreSlice>
```

- `state` is a plain, serializable object (a server component passes it to a client component
  as a prop, so a merge function can't be passed).
- The merge is `store.mergeServerState(slice)`, which dispatches a sync, built-in
  `MergeServerStateAction` (visible to the logger, the observers and the persistor). The
  default merge is shallow (`{ ...state, ...slice }`) for plain-object states, and returns the
  same state when nothing changes, so nothing is published. A class-based state needs the
  `mergeServerState: (state, slice) => state` option of `createStore`, which also deserializes
  the slice. Without it, merging into a non-plain state throws a `StoreException` saying so.
- **On the server**, the slice is merged into the request's store, and the subtree renders the
  merged server state (a nested context provider whose `getServerState` returns
  `merge(parentServerState, slice)`), so the HTML shows the route's data. The components
  outside the slice (the layout) render the root server state, and catch up after hydration.
- **While hydrating**, the subtree hydrates against the same merged server state (no mismatch,
  even if the live store already differs), and the slice is merged into the live store before
  the subtree's first client render, so nothing changes under the hooks afterwards.
- **On client-side navigation**, the slice is merged before the children render, in the slice
  component's `useState` initializer (once per mount, idempotent under StrictMode), so the
  route's first render already reads it: no empty or stale frame. The merge is applied
  **silently** (`NotificationBatch.suspend`): publishing during a render would make React warn
  about updating the mounted components that use the store. The notifications are published in
  a layout effect, right after the commit, so the layout catches up before the browser paints.
- **Once per mount.** A later change of the `state` prop is ignored; React's `key` remounts the
  slice and merges again. The key must change when the route's data changes: the entity id, and
  its `updatedAt` for a refresh of the same entity (after a server action with
  `revalidatePath`, or in the pages router, where the page component stays mounted when only
  the params change).
- **The server data wins** over the client's for the fields in the slice; the rest of the state
  is kept (the clicks, the other routes' data). The `mergeServerState` option can keep client
  fields.
- **Persistor.** A slice merged while the persistor is still reading (`_pendingServerSlices`) is
  merged again into the persisted state when it arrives (`ProcessPersistence` calls
  `store._applyPendingServerSlices`), so the route's data is not lost. The merged state may be
  persisted.
- **Streaming.** A slice inside a Suspense boundary (a route with `loading.tsx`) is in the
  streamed chunk, and hydrates like the rest.

### 1.5 Mutations

Mutations are ordinary Kiss actions. In the app router, an action's reducer calls a server
action (client code may import a `'use server'` function), which gives Kiss's status hooks,
retry, optimistic updates and error handling on top of it, with no fetch code. The server
action returns failures as values (Next.js replaces thrown errors with a generic message in
production), and the Kiss action throws a `UserException`. After `revalidatePath`, the route's
server component renders again with fresh data, and the slice's key changes. In the pages
router, the action calls an API route. No library change was needed for this.

### 1.6 Verified, automated (React 18.3 and 19.3, in CI)

- `bdd.ExternalStoreServerRendering` and `bdd.ExternalStoreHydration`: every hook renders with
  `renderToString` and no DOM; `serverState` or the initial state is rendered; two requests
  with their own stores don't share state, status or readiness; a class-based state with a
  `Map` is transferred and restored; a render leaves no subscription, effect or dispatch;
  hydration produces no mismatch and no extra render, also when the client store changed
  before hydrating, also inside a `Suspense` boundary hydrated later.
- `bdd.ExternalStoreStreaming`: `renderToPipeableStream` sends the state in the shell and in a
  later chunk; the complete streamed HTML hydrates without mismatch; concurrent streams don't
  mix their stores; `renderToReadableStream` works too.
- `bdd.ExternalStoreServerSafety`: with fake timers, dispatching, rendering and disposing
  leaves no timer; the timers of polling, debounce, retry, `dispatchWhen`, `waitCondition`,
  `waitActionCondition` and the persistor's throttle are cleared by `dispose()`; pending waits
  reject with `AbortDispatchException`; a persistor that throws on the server doesn't break the
  render, and the error goes to the `errorObserver`.
- `bdd.ExternalStoreSlices`: on the server, the subtree of a slice renders the merged state and
  the request store gets it, as a `MergeServerStateAction`; hydration of a page with a slice
  has no mismatch, the route shows the slice from its first commit, the layout catches up after
  the commit; the same when the client store changed before hydration (the server slice wins,
  the clicks are kept); a slice mounting on the client renders its route with the slice in its
  first commit; StrictMode merges once (one state change seen by the observer); a new key
  merges the new slice and keeps the rest, the same key with a new prop does nothing; the
  `mergeServerState` option is used for class-based states, and the default throws without it;
  a slice merged before the persistor is ready is merged again into the persisted state, and a
  later merge is persisted; a transition to a route with a slice and a suspended sibling shows
  no tearing; a slice inside a streamed Suspense boundary is in the HTML and hydrates;
  `mergeServerState` called twice with the same slice publishes once. All with React's
  warnings turned into failures.
- `bdd.ReactServerComponents` (run with the `react-server` condition): React is its server
  build, the server entry loads and the store works, the provider and the slice are exported
  and no hook is.
- `bdd.ServerEntryPoint`, `build.esm.test.ts` and `scripts/pack-smoke.cjs`: the server entry
  exports everything but the hooks; the built package resolves the condition and the subpath
  in ESM and CJS; the `'use client'` directive survives both builds; the server entry imports
  no React except through the `'use client'` module; the packed package's types compile a
  consumer.

### 1.7 Verified, end to end (Playwright, `examples/`)

Each example has a persistor on the client only, uses `serverState`, uses every hook, and runs
`npm test` (build, start the production server, test) with every console error, warning and
page error turned into a failure. `e2e/ssr.spec.ts` (all three): with JavaScript disabled the
HTML shows the server state; hydration logs nothing; a sync action, an async action with its
status, a failed action with its `UserException` and client-side navigation work; clicks
restored from localStorage before hydration cause no mismatch and show after it.

`e2e/routes.spec.ts` (the two Next.js examples): with JavaScript disabled, `/users` and
`/users/2` already have their server-loaded slices (in the app router, the user route streams
inside its `loading.tsx` boundary, and the HTML has the fallback plus the streamed chunk);
client-side navigation `/` → `/users` → `/users/2` → `/users/3` → back merges each route's
slice before its first render (a `MutationObserver` records every text the user name shows:
never empty, never the previous user after the new one) and keeps the clicks; a rename goes
through a Kiss action that calls a server action (app router) or an API route (pages router),
the list and a full reload show it, the failure path shows the `UserException`; the persisted
clicks and a route's slice coexist after a reload with no mismatch.

- `examples/nextjs-app-router` (Next 16 and 15, React 19): the root layout loads the base
  state with a per-request store and passes it to a `'use client'` provider; `/users` and
  `/users/[id]` are server components rendering `StoreSlice`; `app/users/actions.ts` is the
  server action; `app/users/[id]/loading.tsx` streams the route.
- `examples/nextjs-pages-router` (Next 16 and 15, React 19 and 18): `getServerSideProps` on each
  page returns the base `initialState` (a full load of any page creates the store in
  `_app.tsx`) and the page's `slice`; `pages/api/users/[id]/rename.ts` is the mutation; the
  users live on `globalThis`, since Next.js bundles the API module separately per route.
- `examples/ssr-express` (React 19 and 18): Express, `renderToPipeableStream` piped in
  `onShellReady`, a lazy component streamed after the shell, the state in a JSON `<script>`,
  `hydrateRoot(document, ...)`, the store disposed in `onAllReady` and on `close`.
- `examples/todo-app-nextjs` (Next 16 and 15, React 19): the Vite todo app
  (`examples/todo-app-example`) ported to the app router, with the same business code. Its
  state is class-based (`State`, `TodoList`, `TodoItem`), so it covers what the three small
  examples don't: the state travels as plain JSON (`toJson`/`fromJson`) and is rebuilt on the
  client; the `ClassPersistor` in the browser, whose classes declare `static typeName` because
  Next.js minifies class names in production; MUI under hydration; a `UserException` dialog.
  `e2e/todo.spec.ts`: the server HTML lists the initial todos; the app works after hydration
  with no warnings; the saved todos are restored as class instances (their methods work, and
  the saved JSON has the `typeName` keys); the store survives navigation to `/stats`.

The CI job `ssr-examples` runs the matrix. The examples install `kiss-for-react` from the
repository root with `install-links=true` (`.npmrc`), so npm packs the root **as it is**: build
the library first (CI does), and after changing it, rebuild, delete the example's
`node_modules/kiss-for-react`, `npm install` again, and delete the Next.js `.next` cache, which trusts the
(unchanged) version of a package in node_modules.

### 1.8 Documentation

README ("Server-side rendering", with "Next.js and React Server Components" and "Several
routes"), the docs site page `react/miscellaneous/server-side-rendering.md` (the four rules,
streaming, the app router, `StoreSlice`, server actions, which state goes in the store, the
pages router, the examples), the CHANGELOG, and the examples' READMEs.

## 2. Design constraints and rules

- One store per request on the server; dispose it after rendering.
- The state and the slices must be serializable, or the app provides the serialization (the
  `mergeServerState` option, for class-based states).
- Hydration renders `serverState`, which must be stable (keep it in `useState` in Next.js; in
  the pages router it's the first page's `initialState`, and later pages bring slices).
- The status hooks are blank on the server: load the data before rendering, with actions.
- Dispatching during a server render is pointless; `useStoreEffect` doesn't run there.
- A slice is merged once per mount: the key must change with the route's data (id plus
  `updatedAt`). With a `loading.tsx`, client navigation shows the fallback (no slice element)
  and then the route, complete: "no stale frame" means fallback-then-new, never old-then-new.
- Server actions return failures as values; the Kiss action throws the `UserException`.
- Streaming needs something that suspends per request (a module-level `React.lazy` streams
  only once per process; a route's data loading does suspend per request).
- Don't render values that differ between server and client (dates in local time).
- The default logger prints every action to the server console, with minified class names in
  production bundles; server stores want `logger: () => {}`.
- Which state goes in the store: in interactive apps, the client's working copy of the data the
  app interacts with, loaded per route with `StoreSlice`, mutated through actions; in
  RSC-centric apps, client state only, with the server data left in server components.

## 3. Considered and not planned

- **Suspense integration** (`useSelectSuspense`, reading store data with `use`): Kiss loads data
  with actions before rendering, and `StoreSlice` covers per-route data, including streamed
  routes. Not planned unless an app needs per-component streaming of store data.
- **Re-applying a slice when its `state` prop changes** (deep comparison): it would fight the
  live store on every parent re-render; the key rule is explicit and cheap.
- **`serializeState`/`deserializeState` on `createStore`**: the slices and the initial state are
  plain objects in Next.js; class-based states use the `mergeServerState` option.
- **A server-side persistor**: a server store renders once; if it has a persistor, `await
  store.ready()` before rendering (documented). No further support.
- **Remix, React Router framework mode, Astro, Vite SSR**: nothing in Kiss is Next.js-specific;
  `StoreSlice` works with any loader-based router (a loader returns the slice). No example yet.

## 4. Library changes made for SSR (summary)

- `src/StoreProvider.tsx` (new): the context, `StoreProvider` and `StoreSlice`, `'use client'`,
  reading React through the default import with `createContext` guarded.
- `src/Hooks.tsx`: `'use client'`; imports the context from `StoreProvider.tsx`.
- `src/Store.tsx`: no React import; `dispose()` rejects the pending waits (`_abortAllWaits`);
  `mergeServerState(slice)`, `_mergeServerStateSilently`, `_mergeSlice`,
  `_applyPendingServerSlices`, the `mergeServerState` constructor option, the pending slices
  before readiness, and `NotificationBatch.suspend`.
- `src/KissAction.ts`: `MergeServerStateAction`. `src/utils.ts`: `isPlainObject`.
- `src/ProcessPersistence.ts`: merges the pending slices into the persisted state.
- `src/server.ts` (new), the `react-server` condition and the `./server` subpath in
  `package.json`.
- `scripts/pack-smoke.cjs`: the `react-server` smoke, the `./server` types, and
  `ESNext.Disposable` in the consumer's lib (a pre-existing failure: `Symbol.dispose` in the
  store's types).

## 5. Definition of "good", and the statement

1. A page's server-loaded data reaches the live store on full load and on client navigation,
   with no mismatch and no flash: `StoreSlice`, verified by BDDs and by the Playwright tests of
   both Next.js examples.
2. Mutations go through Kiss actions that call server actions or API routes, with status and
   error handling: shown and tested in both examples.
3. The docs say which state belongs in the store, for interactive apps and for RSC-centric
   apps: the docs site page.
4. The examples have several routes and a mutation, and their end-to-end tests pass in CI on
   Next 15 and 16, React 18 and 19.

So: Kiss supports server-side rendering on React 18 and 19, with `renderToString`, streaming,
and `hydrateRoot` without mismatches; the `serverState` prop controls what the server renders
and what hydration matches; `store.dispose()` makes per-request stores safe; the package works
in React Server Components through the `react-server` condition; and `StoreSlice` merges each
route's server-loaded data into the store, on the server, on hydration and on client-side
navigation. Verified with the Next.js app router and pages router, and with plain Node +
Express with streaming, end to end.
