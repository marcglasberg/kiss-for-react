# The todo app with Next.js

The [Vite todo app](../todo-app-example) ported to the Next.js **app router**, with the todos
on the server: the server renders the list from its own storage, every change goes to the
server through server actions, and the browser hydrates without mismatches. The business code
(the state classes and the actions) is the same as in the Vite app, with the actions calling
the server. It's also an end-to-end test of Kiss's SSR support with a class-based state,
`StoreSlice`, server actions and the `ClassPersistor`: see `SSR.md` at the root of the
repository.

## What it shows

- **The todos live on the server, and survive restarts.** `src/infra/todosFile.ts` keeps them
  in a JSON file, `data/todos.json` (a stand-in for a database), created from the committed
  seed `data/todos.seed.json` on the first request. Every write bumps a `version` and is
  atomic (a temp file, then a rename). It's server-only code (`fs`): only the page and the
  server actions import it.
- **The first render has them.** `app/page.tsx` is a server component: it reads the file and
  renders the client UI (`src/ui/TodoApp.tsx`) inside `StoreSlice`, which merges the todos
  into the store before the UI renders. So the HTML already lists them (open the page with
  JavaScript disabled to see), hydration matches, and client-side navigation back to the page
  shows them in its first render. The slice's `key` is the file's version, so that a refreshed
  page (after a server action) merges the fresh list again.
- **A class-based state, through `mergeServerState`.** The slice is a plain object (a prop
  that crosses the server/client boundary as JSON), and the state is the `State` class with a
  `TodoList` of `TodoItem`s. The default merge (a shallow merge of plain objects) doesn't fit,
  so `src/infra/store.ts` gives `createStore` the `mergeServerState` option, which rebuilds the
  `TodoList` with `TodoList.fromJson` and keeps the rest of the state (the filter).
  `src/business/TodoList.ts` has `fromJson`/`toJson` on both classes, so the server uses the
  same classes: the server actions read the file into a `TodoList`, call its methods, and
  write it back.
- **Server actions as the API of the Kiss actions.** `app/actions.ts` (`'use server'`) has
  `addTodo`, `toggleTodo`, `removeTodo` and `removeCompletedTodos`. The Kiss actions in
  `src/business/` call them from their reducers like any async function, and put the list the
  server returns in the state; so the UI gets `useIsWaiting` for free: the add button and the
  checkboxes show their waiting state while the server answers. The server actions never
  throw (Next.js hides thrown messages in production): a refusal is returned as a value, and
  the Kiss action turns it into a `UserException`. `AddTodoAction` also validates locally
  first: a duplicate throws a `UserException` with no round trip, shown in the MUI dialog
  (`src/infra/StoreParameters.tsx`). `NextFilterAction` stays local: the filter is client state.
- **The store is created once on the client**, in `src/infra/KissProvider.tsx`, rendered by
  the root layout, so it survives client-side navigation: the `/stats` page counts the todos
  of the same store. It starts from the empty `State.initialState`, which is also the
  provider's `serverState`; the todos come from the page's slice.
- **The `ClassPersistor`, browser only, keeps the client's filter.** It saves the whole state
  in localStorage and restores it on load, possibly before hydration. The todos it restores
  are stale, so the page's slice is merged on top: Kiss keeps a slice merged while the
  persistor is still reading, and merges it again onto the restored state. The result is the
  server's todos with the filter the user chose on the last visit. Hydration still renders the
  server state (the HTML), and the page catches up after. On the server there is no
  localStorage, so `src/infra/store.ts` gives the persistor to the store only in the browser.
- **`typeName` for the `ClassPersistor` under minification.** The persistor saves the classes
  by name, and Next.js minifies class names in the production build (`TodoItem` becomes `e`),
  so `State`, `TodoList` and `TodoItem` declare `static readonly typeName = '...'`, the stable
  name the persistor uses instead. Without it, the persistor throws a `StoreException` when
  it's created, explaining this. The Vite app doesn't need it, since its `vite.config.ts` turns
  off the minification of class names (`keepNames: true`); Next.js has no such setting.

Where things are: the root layout in `app/layout.tsx` (a server component, which renders
`KissProvider`, the nav and the dialog's `#dialog-root`); the todo page in `app/page.tsx` (a
server component) with its UI in `src/ui/TodoApp.tsx` (a client component); the stats page in
`app/stats/page.tsx`; the server actions in `app/actions.ts`; the file in
`src/infra/todosFile.ts`; the tests in `e2e/todo.spec.ts`.

## Run it

```sh
npm install
npm run dev      # http://localhost:3104
```

Open the page with JavaScript disabled in the browser's devtools: the todos are already in the
HTML. With JavaScript, the page hydrates ("Store ready" turns to "yes"), the changes go to the
server (see `data/todos.json` change), and the filter survives a reload. Delete
`data/todos.json` to start from the seed again.

## Test it

```sh
npx playwright install chromium   # Once.
npm test                          # Builds, starts the production server, and runs the tests in e2e/.
```

The tests start the server with `TODOS_FILE=todos.e2e.json` (a file name inside `data/`, see
`playwright.config.ts`), so they don't touch `data/todos.json`; the global setup, and each
test, delete that file, so every test starts from the seed. `e2e/todo.spec.ts` opens the page with JavaScript disabled and
checks that the server HTML lists the seed todos; then with JavaScript, and checks that there is
no hydration warning in the console, and that an added todo is in the server's file (read with
`fs`) and in the server HTML of a fresh context without JavaScript; that toggling and removing
the completed todos change the server's list, which a reload shows; that the filter is restored
by the persistor after a reload while the todos are the server's (the test changes the file
behind the browser's back), and that localStorage has the `typeName`s rather than minified class
names; that a duplicate todo shows the dialog without going to the server; that a random todo
(from the DummyJSON API, which the test answers itself) is fetched by the browser and saved on
the server; and that the store survives client-side navigation to the stats page.

Note: `kiss-for-react` is installed from the repository root (`file:../..`). The `.npmrc` makes
npm pack and install it like a published package, instead of symlinking it. npm packs the root as it is, so after changing the library, run `npm run build` at the root, then delete `node_modules/kiss-for-react` here and run `npm install` again, and delete `.next`: the build cache trusts the version of a package in node_modules, which does not change.
