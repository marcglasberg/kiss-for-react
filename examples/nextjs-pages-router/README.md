# Kiss with the Next.js pages router

A small app that shows how to use Kiss with server-side rendering in the Next.js **pages router**
(`getServerSideProps`). It's also an end-to-end test of Kiss's SSR support: see the
"Server-side rendering" section of the README at the root of the repository. The app-router
version is in `../nextjs-app-router`.

## What it shows

- **A store per request on the server.** `src/server-state.ts` creates a store, dispatches
  `LoadItems`, takes the state, and disposes the store. It runs in the `getServerSideProps` of
  each page. The pages router has no React Server Components, so `kiss-for-react` resolves to
  its normal entry everywhere (the `'use client'` directive, and the package's `react-server`
  export condition, are irrelevant here); Next.js strips `getServerSideProps`, and what only it
  imports, from the client bundle.
- **The state travels as a prop.** `getServerSideProps` returns `{ props: { initialState } }`,
  a plain object, which Next.js serializes into the HTML and gives to the page and to the custom
  App.
- **The store is created once on the client**, with `useState(() => createAppStore(...))`, in
  `pages/_app.tsx`, which stays mounted across client-side navigation. Each page has its own
  `getServerSideProps`, so a navigation brings new `pageProps`, but the store is not re-created
  from them. The About page shows the same clicks.
- **`serverState`**: the App passes the state the server HTML was rendered from as
  `serverState`, so that hydration renders exactly what the HTML shows, even if the client
  store already changed. Hydration happens only once, so it's the `initialState` of the first
  page load, also kept in `useState`.
- **A persistor on the client only** (`src/persistor.ts`): it keeps the clicks in localStorage,
  and may restore them before hydration. That's the case `serverState` handles: the page
  hydrates with 0 clicks, and then shows the restored ones. On the server there is no
  localStorage, so `src/store.ts` creates the persistor only in the browser.
- **The hooks**: `useSelect`, `useObject`, `useIsWaiting`, `useIsFailed`, `useExceptionFor`,
  `useIsStoreReady`, `useDispatch` and `useStoreEffect`, in `pages/index.tsx`. On the server, the
  status hooks render "nothing in progress", and `useIsStoreReady` renders `true`.
- **Routes with their own server data** (`/users` and `/users/[id]`): each page's
  `getServerSideProps` also returns a `slice`, which the page merges into the store with the
  `StoreSlice` component. See "Several routes: StoreSlice" below.
- **A mutation through an API route** (`RenameUser` in `src/actions.ts`, which calls
  `pages/api/users/[id]/rename.ts`), with its waiting status and its failure path.

## Several routes: StoreSlice

The store lives in `pages/_app.tsx`, so it survives client-side navigation, and that's also why
a route can't put its own server data into the `initialState`: on navigation, the store is not
re-created from the new `pageProps`. Instead, a page that loads its own data merges it into the
store with `StoreSlice`:

- **Every page returns `initialState`** from its `getServerSideProps`, so that a full load of
  any page can create the store in `pages/_app.tsx`, and hydrate against it. A page with its
  own data **also returns `slice`**: a plain object with the fields it loads. `pages/users/index.tsx`
  returns `{ users }`, and `pages/users/[id].tsx` returns `{ user }`.
- **The page renders its content inside `<StoreSlice state={slice}>`.** The slice is merged
  into the store once, when the `StoreSlice` mounts, before its children render. Since the
  state is a plain object, the merge is the default shallow one, `{ ...state, ...slice }` (a
  class-based state would give `createStore` the `mergeServerState` option). So: on the server,
  the HTML has the route's data; on a full load, hydration matches it, since the `StoreSlice`
  provides the merged server state to its own subtree (the provider's `serverState` stays the
  first page's `initialState`); and on client-side navigation, the first render of the route
  already shows its data, with no empty or stale frame. The rest of the state (the clicks, the
  other routes' data) is kept: `UserView` shows the other users from the list route's slice.
- **The `key` rule.** The slice is merged once per mount, and a page component stays mounted
  when only its params change: going from `/users/3` back to `/users/2` re-renders the same
  `UserPage` with new `pageProps`, which alone would not merge again. So `pages/users/[id].tsx`
  gives the `StoreSlice` a `key` that changes with the route's data, `${user.id}:${user.updatedAt}`:
  a new key remounts the slice, which merges the new data. Any navigation to a page re-runs its
  `getServerSideProps`, so the slice is always fresh (a rename made elsewhere shows up). The
  `/users` page needs no key, since it unmounts whenever the user leaves it.
- **The mutation.** In the pages router there are no server actions, so the API layer is an
  API route: `pages/api/users/[id]/rename.ts` (`POST` with `{ name }`). The Kiss action
  `RenameUser` calls it with `fetch`, and turns its `{ ok: false, error }` answer into a
  `UserException`. The route's page shows `useIsWaiting(RenameUser)` and
  `useExceptionFor(RenameUser)`, like the home page does with `AddItem`. The action also updates
  the list in the store, and the next visit of either route brings the new name in its slice.
- **The fake data.** The users are an in-memory array in `src/api.ts`, in place of a database.
  It's kept on `globalThis`, since Next.js bundles that module separately into each page and
  API route, and a module-level array would exist once per bundle.

## Run it

```sh
npm install
npm run dev      # http://localhost:3102
```

Open the page with JavaScript disabled in the browser's devtools: the items are already in the
HTML. With JavaScript, the page hydrates (the "Hydrated" flag turns to "yes"), the actions work,
and the clicks survive a reload. Open "Users" for the routes with their own server data.

## Test it

```sh
npx playwright install chromium   # Once.
npm test                          # Builds, starts the production server, and runs e2e/*.spec.ts.
```

`e2e/ssr.spec.ts` opens the page with JavaScript disabled and checks the server HTML, then with
JavaScript and checks that there is no hydration warning in the console, that the actions update
the DOM, that the store survives navigation, and that the state restored by the persistor shows
after hydration.

`e2e/routes.spec.ts` checks the routes with slices: the HTML of `/users` and `/users/2` has
their data with JavaScript disabled; client-side navigation between `/`, `/users`, `/users/2`
and `/users/3` (and back) shows each route's data in its first render, with no stale or empty
frame (a `MutationObserver` records every text the user's name shows), and keeps the clicks; a
rename goes through the API route and shows on both routes and after a full load, with its
failure path; and the persisted clicks and a route's slice coexist after a reload, with no
hydration warning.

Note: `kiss-for-react` is installed from the repository root (`file:../..`). The `.npmrc` makes
npm pack and install it like a published package, instead of symlinking it. npm packs the root as it is, so after changing the library, run `npm run build` at the root, then delete `node_modules/kiss-for-react` here and run `npm install` again, and delete `.next`: the build cache trusts the version of a package in node_modules, which does not change.
