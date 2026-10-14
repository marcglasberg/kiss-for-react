# Kiss with plain Node + Express

A small app that shows how to use Kiss with server-side rendering **without a framework**:
Node, Express, `renderToPipeableStream` on the server, `hydrateRoot` on the client. It isolates
Kiss from the conventions of a framework: everything that happens is in these few files. It's
also an end-to-end test of Kiss's SSR support, with streaming: see `SSR.md` at the root of the
repository.

## What it shows

- **A store per request on the server.** `src/server.tsx` creates a store for each request,
  dispatches `LoadItems` and awaits it, renders with `renderToPipeableStream`, and disposes the
  store when the render is done, so that no timers are left in the Node process.
- **Streaming.** The page has a `Suspense` boundary with a lazy component
  (`src/LateItems.tsx`), which reads the store with `useSelect`. The server sends the shell as
  soon as it's ready (`onShellReady`), with the fallback, and the content of the boundary later
  in the same response, with React's inline script that puts it in place. Without JavaScript,
  the content is still in the HTML, hidden. The lazy component is created per request
  (`lazyLateItems`, in `src/App.tsx`), since `React.lazy` keeps the module once loaded: a
  module-level one would stream on the first request of the server only.
- **The state travels as JSON.** The whole document is rendered by React (`src/App.tsx`),
  including a `<script id="kiss-state" type="application/json">` with the state, with `<`
  escaped as `\u003c`, so that no text in the state can close the script early. The client
  (`src/client.tsx`) parses it, creates the store with it, and hydrates the document.
- **`serverState`**: the provider gets the server state as `serverState`, so that hydration
  renders exactly what the HTML shows, even if the client store already changed.
- **A persistor on the client only** (`src/persistor.ts`): it keeps the clicks in localStorage,
  and may restore them before hydration. That's the case `serverState` handles: the page
  hydrates with 0 clicks, and then shows the restored ones. On the server there is no
  localStorage, so `src/store.ts` creates the persistor only in the browser, and the server
  uses `createStore` directly.
- **The hooks**: `useSelect`, `useObject`, `useIsWaiting`, `useIsFailed`, `useExceptionFor`,
  `useIsStoreReady`, `useDispatch` and `useStoreEffect`, in `src/App.tsx`. On the server, the
  status hooks render "nothing in progress", and `useIsStoreReady` renders `true`.
- **No client-side router.** The links between the home page and the About page are plain
  links: full page loads. So the store is created once per page load, on the server and on the
  client, and the About page gets its clicks from the persistor, not from the home page's
  store. (In the Next.js examples, the store survives client-side navigation instead.)

## Run it

```sh
npm install
npm run build    # Bundles the client (dist/public/client.js) and the server (dist/server.cjs) with esbuild.
npm start        # http://localhost:3103
```

Open the page with JavaScript disabled in the browser's devtools: the items are already in the
HTML. With JavaScript, the page hydrates (the "Hydrated" flag turns to "yes"), the actions work,
and the clicks survive a reload. The client bundle uses the development build of React, so
that hydration problems show in the console; see `build.mjs`.

## Test it

```sh
npx playwright install chromium   # Once.
npm test                          # Builds, starts the server, and runs e2e/ssr.spec.ts.
```

The tests open the page with JavaScript disabled and check the server HTML, including the
streamed Suspense content; then with JavaScript, and check that there is no hydration warning
in the console, that the actions update the DOM, and that the About page (a full page load)
is server-rendered with 0 clicks and shows the persisted clicks after hydration; that the
state restored by the persistor shows after hydration without a mismatch; and that the raw
HTML of the response has the items, the streamed content after the shell, and the state as
JSON.

Note: `kiss-for-react` is installed from the repository root (`file:../..`). The `.npmrc` makes
npm pack and install it like a published package, instead of symlinking it. npm packs the root
as it is, so after changing the library, run `npm run build` at the root, then delete
`node_modules/kiss-for-react` here and run `npm install` again.
