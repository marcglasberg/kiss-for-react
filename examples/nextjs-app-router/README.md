# Kiss with the Next.js app router

A small app that shows how to use Kiss with server-side rendering in the Next.js **app router**
(React Server Components). It's also an end-to-end test of Kiss's SSR support: see `SSR.md` at
the root of the repository.

## What it shows

- **A store per request on the server.** `src/server-state.ts` creates a store, dispatches
  `LoadItems`, takes the state, and disposes the store. It runs in a server component (the root
  layout), where `kiss-for-react` resolves to its server entry: the store and the actions, with
  no hooks. The package has a `react-server` export condition for that.
- **The state travels as a prop.** The root layout (`app/layout.tsx`, a server component) gives
  the loaded state to `KissProvider` (`src/KissProvider.tsx`, a client component), as a plain
  object.
- **The store is created once on the client**, with `useState(() => createAppStore(...))`, in
  the root layout, so it survives client-side navigation. The About page shows the same clicks.
- **`serverState`**: the provider passes the server state as `serverState`, so that hydration
  renders exactly what the HTML shows, even if the client store already changed.
- **A persistor on the client only** (`src/persistor.ts`): it keeps the clicks in localStorage,
  and may restore them before hydration. That's the case `serverState` handles: the page
  hydrates with 0 clicks, and then shows the restored ones. On the server there is no
  localStorage, so `src/store.ts` creates the persistor only in the browser.
- **The hooks**: `useSelect`, `useObject`, `useIsWaiting`, `useIsFailed`, `useExceptionFor`,
  `useIsStoreReady`, `useDispatch` and `useStoreEffect`, in `app/page.tsx`. On the server, the
  status hooks render "nothing in progress", and `useIsStoreReady` renders `true`.
- **Routes that load their own data**, merged into the store with `StoreSlice`: `/users` and
  `/users/[id]`, with a `loading.tsx` so the user route streams. See the next section.
- **A mutation through a server action**: the rename on the user page is a Kiss action whose
  reducer calls a Next.js server action (`app/users/actions.ts`).

## Several routes: StoreSlice

The root layout loads the state every route needs (the items). A route that needs its own data
can't put it there: the layout doesn't know which route is rendering, and the store is created
once and kept across client-side navigation, so a route can't create its own either. The
pattern is the **per-route slice**: the route's server component loads the data, and renders
the route's content inside `StoreSlice`, which merges that data into the store.

```tsx
// app/users/[id]/page.tsx, a server component.
export default async function UserPage({ params }) {
  const user = await fetchUser(Number((await params).id));
  if (user === null) notFound();
  return (
    <StoreSlice state={{ user }} key={`${user.id}:${user.updatedAt}`}>
      <UserView />
    </StoreSlice>
  );
}
```

- `StoreSlice` is imported from `kiss-for-react` in a server component: the package's server
  entry exports it as a client reference. Its `state` prop is a plain, serializable object (a
  prop that crosses the server/client boundary), with the fields of the state to replace. The
  merge is shallow (`{ ...state, ...slice }`), which fits this app's plain-object state; a
  class-based state gives `createStore` a `mergeServerState` option instead.
- The merge happens **before the children render**: on the server, so the HTML shows the
  route's data; while hydrating, against the same merged state, so there is no mismatch; and on
  client-side navigation, so the route's first render already shows its data, with no empty or
  stale frame. The rest of the store (the clicks, client state) is kept. The components outside
  the slice (the layout) see the merged state right after the commit.
- A slice is merged **once per mount**. React's `key` decides when it's merged again: a new key
  remounts the slice. The user page uses `id:updatedAt`, so that a refresh of the same user with
  new data (after a rename and `revalidatePath`) merges again; the list page has one slice and
  no key. Changing the `state` prop without a new key does nothing.
- `app/users/[id]/loading.tsx` puts the route in a Suspense boundary: the server streams the
  layout first and the route later, and the route hydrates against its own merged state.

**The mutation.** `RenameUser` (`src/actions.ts`) is a Kiss action whose reducer awaits
`renameUser` (`app/users/actions.ts`, a `'use server'` function): client code can import a
server action and call it like any async function, so there is no fetch code, and the page gets
`useIsWaiting`, `useIsFailed` and `useExceptionFor` for free. The server action **returns**
failures as a value (`{ ok: false, error }`), since Next.js replaces errors thrown by server
actions with a generic message in production; the Kiss action turns it into a `UserException`.
On success, the action updates the store, and the server action calls `revalidatePath`, so the
open page refreshes with a new slice (a new `updatedAt`, so a new key), which agrees with it.

Where things are: the users and their fake API in `src/api.ts` (in memory, in the server
process); the routes in `app/users/page.tsx` and `app/users/[id]/page.tsx`; their client
content in `src/UsersList.tsx` and `src/UserView.tsx`; the tests in `e2e/routes.spec.ts`.

## Run it

```sh
npm install
npm run dev      # http://localhost:3101
```

Open the page with JavaScript disabled in the browser's devtools: the items are already in the
HTML. With JavaScript, the page hydrates (the "Hydrated" flag turns to "yes"), the actions work,
and the clicks survive a reload.

## Test it

```sh
npx playwright install chromium   # Once.
npm test                          # Builds, starts the production server, and runs the tests in e2e/.
```

`e2e/ssr.spec.ts` opens the home page with JavaScript disabled and checks the server HTML, then
with JavaScript and checks that there is no hydration warning in the console, that the actions
update the DOM, that the store survives navigation, and that the state restored by the persistor
shows after hydration.

`e2e/routes.spec.ts` does the same for the routes with a slice: the HTML of `/users` and
`/users/2` has their data without JavaScript; client-side navigation between the home page, the
list and two users shows each route's data in its first render (a `MutationObserver` records
every name the user page shows, and the test checks there was no empty or stale one) and keeps
the clicks; a rename through the server action shows on the refreshed page, on the list, and
after a full reload, and its failure path shows the error; and the persisted clicks and a
route's slice coexist after a reload, with no console error or warning.

Note: `kiss-for-react` is installed from the repository root (`file:../..`). The `.npmrc` makes
npm pack and install it like a published package, instead of symlinking it. npm packs the root as it is, so after changing the library, run `npm run build` at the root, then delete `node_modules/kiss-for-react` here and run `npm install` again, and delete `.next`: the build cache trusts the version of a package in node_modules, which does not change.
