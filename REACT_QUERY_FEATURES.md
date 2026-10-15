# React Query features, adapted to Kiss

Features of [TanStack Query (React Query)](https://tanstack.com/query) that Kiss doesn't have
yet, and how they could work in Kiss. Each section says why the feature is useful, how React
Query does it, and a proposed Kiss API.

The two libraries have different philosophies, and the proposals respect Kiss's:

- **React Query** is built around **queries**: a `queryKey` identifies a piece of server data,
  a `queryFn` fetches it, and the result goes into a **cache** that React Query owns. The cache
  tracks staleness, who is observing each key (mounted components), and refetches by itself on
  mount, focus, reconnect, interval and invalidation. Mutations are separate (`useMutation`),
  and usually end by invalidating queries.

- **Kiss** is built around **actions**: an action may call the server, and its reducer may
  change the **state**, which the app owns and shapes as it likes. There's no cache apart from
  the state, and the data doesn't belong to the action that loaded it. Components dispatch
  actions and read the state. So, every React Query behavior that "refetches a query" becomes,
  in Kiss, "dispatches an action again", and every "is this key fetching/stale/errored" becomes
  "is an action of this type (and key) in progress/fresh/failed".

Most of React Query already has an equivalent in Kiss (see the table at the end). The gaps
are mostly about **when** actions are dispatched automatically (focus, reconnect, mounted
components, invalidation), and about **showing the status** of an action per key and per
background run.

| Feature                                                                                      | Status      | Priority    |
|----------------------------------------------------------------------------------------------|-------------|-------------|
| [1. App focus and online signals in the store](#1-app-focus-and-online-signals-in-the-store) | Done        | High        |
| [2. `useStoreEffect`: `onFocus` and `onOnline`](#2-usestoreeffect-onfocus-and-ononline)      | Done        | High        |
| [3. Polling tied to mounted components](#3-polling-tied-to-mounted-components)               | Partly done | High        |
| [4. `useKeepFresh`: keep an action's data up to date while mounted](#4-usekeepfresh-keep-an-actions-data-up-to-date-while-mounted) | Rejected | |
| [5. Invalidation](#5-invalidation)                                                           | Rejected    |             |
| [6. Background runs vs. first load](#6-background-runs-vs-first-load)                        | Rejected    |             |
| [7. Status per key](#7-status-per-key)                                                       | Done        | Medium      |
| [8. Global "anything in progress"](#8-global-anything-in-progress)                           | Rejected    |             |
| [9. Retry predicate: `shouldRetry`](#9-retry-predicate-shouldretry)                          | Done        | Medium      |
| [10. Aborting actions from outside](#10-aborting-actions-from-outside)                       |             | Medium      |
| [11. Paged (infinite) loading](#11-paged-infinite-loading)                                   |             | Medium      |
| [12. Suspense and error boundaries](#12-suspense-and-error-boundaries)                       |             | Low         |
| [13. Persisted offline actions](#13-persisted-offline-actions)                               |             | Low         |
| [Already equivalent](#already-equivalent)                                                    |             |             |

When implementing any of these, also write BDDs in `__tests__/bdd.<Topic>.test.ts` (see
`AGENTS.md`), update `README.md`, `CHANGELOG.md` and the docs site, and revisit `LINTS_LIST.md`.

---

## 1. App focus and online signals in the store

**Status: implemented** (`AppSignal`, `focusSource` and `onlineSource` in `src/Store.tsx`;
BDDs in `__tests__/bdd.AppFocusAndOnline.test.ts` and
`__tests__/bdd.AppFocusAndOnlineBrowser.test.ts`). Decisions taken, from the proposal below:

- Names: `store.isFocused`, `store.isOnline`, `focusSource`, `onlineSource`,
  `store.setFocused(bool | null)`, `store.setOnline(bool | null)`, hooks `useIsFocused()` and
  `useIsOnline()`. The source type is exported as `AppSignalSource`.
- Setting a signal by hand disconnects its source (so a late lazy start can't overwrite the
  value the test set); `null` connects it again. The default is `true` until the source says
  otherwise, and both are `true` on the server.
- The default `hasInternet()` of the actions now returns `store.isOnline`, so
  `checkInternet`/`unlimitedRetryCheckInternet` follow a custom `onlineSource`.
  `forceInternetOnOffSimulation` still takes precedence, and overriding `hasInternet()` still
  works.
- An unsubscribe that throws on `dispose()` is reported like a prop disposal error.

### Why

Several features below (refetch on focus, refetch on reconnect, pausing polling in a hidden
tab) need to know whether the app is **focused** (the browser tab is visible) and **online**.
Kiss has no such notion. Actions have `hasInternet()`, which reads `navigator.onLine` on
demand, but nothing **listens** to changes.

### How React Query does it

`focusManager` listens to `visibilitychange` and is focused when
`document.visibilityState === 'visible'`. `onlineManager` listens to the `online`/`offline`
window events, starting from `navigator.onLine`. Both have `setEventListener` to replace the
source (React Native uses `AppState` and `NetInfo`), and `setFocused`/`setOnline` for tests.
Nothing runs on the server.

### Proposed API

The store gets two signals, with default browser sources, and no-op sources elsewhere:

```ts
store.isFocused; // boolean. Always true on the server, in Node and React Native, by default.
store.isOnline;  // boolean. Always true where `navigator.onLine` doesn't exist.
```

Configurable in `createStore`, for React Native or custom detection (a ping, a WebSocket):

```ts
createStore<State>({
  initialState: ...,
  focusSource: (setFocused) => {
    const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
    return () => sub.remove(); // Unsubscribe, called by `store.dispose()`.
  },
  onlineSource: (setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)),
});
```

- `store.setFocused(bool)` and `store.setOnline(bool)` for tests. `store.isOnline` should also
  be what `hasInternet()` and `checkInternet` read by default, so the existing
  `forceInternetOnOffSimulation` keeps working and takes precedence.
- The sources are subscribed lazily, when the first consumer (a hook, a polling action) needs
  them, and unsubscribed on `store.dispose()`.
- Hooks `useIsFocused()` and `useIsOnline()` (with `useSyncExternalStore`) are cheap to add,
  for "You are offline" banners.
- Decision: React Query v5 dropped the `focus` window event and uses only `visibilitychange`,
  because `focus` fires too often (dev tools, iframes). Do the same.

---

## 2. `useStoreEffect`: `onFocus` and `onOnline`

**Status: implemented** (`onFocus`, `onBlur`, `onOnline` and `onOffline` in
`UseStoreEffectOptions`, `src/Hooks.tsx`; BDDs in
`__tests__/bdd.UseStoreEffectFocusAndOnline.test.ts` and
`__tests__/bdd.UseIsFocusedAndOnline.test.tsx`). As proposed below: transitions only, never on
mount, only after `onMount` ran, and a component without these callbacks doesn't start the
sources. The action-side `rerunOnFocus` alternative was not done (see section 4).

### Why

The most used React Query defaults: when the user comes back to the tab, or the internet comes
back, the data on screen is reloaded. In Kiss the component already says what to load with
`onMount`; it should be able to say "and again when the tab is focused".

### How React Query does it

`refetchOnWindowFocus` and `refetchOnReconnect` (both default `true`). They refetch only the
**active** queries (with a mounted observer) that are **stale**. With `'always'` they refetch
even if fresh.

### Proposed API

New callbacks in `useStoreEffect`, next to `onMount`, `onDepsChange` and `onUnmount`:

```tsx
useStoreEffect({
  onMount:  (store) => store.dispatch(new LoadPrices()),
  onFocus:  (store) => store.dispatch(new LoadPrices()), // Tab became visible again.
  onOnline: (store) => store.dispatch(new LoadPrices()), // Internet came back.
  onBlur:   (store) => ...,   // Optional, tab hidden.
  onOffline:(store) => ...,   // Optional, internet lost.
});
```

- They run only on **transitions** (hidden → visible, offline → online), only while the
  component is mounted, and only after `onMount` ran (store ready). They are not called on
  mount, even if the tab is visible. Same rules as the other callbacks: not awaited, errors not
  caught, latest render's closure, once per transition in `StrictMode`.
- "Only if stale" is **the action's job**, not the hook's: give the action `fresh = 30000` and
  a focus within 30 seconds is aborted silently, like React Query's default. Without `fresh`,
  it's `refetchOnWindowFocus: 'always'`.
- Alternative considered: an action property `rerunOnFocus = true`, where the store itself
  re-dispatches the last instance. Rejected as the primary design: the store would re-run
  actions nobody on screen needs anymore (React Query only refetches active queries). It only
  makes sense together with the ref-counting of section 4, which is where it goes.

---

## 3. Polling tied to mounted components

**Status: partly done.** The options `pollOnlyWhenFocused` and `pollOnlyWhenOnline` were
implemented (both default `true`; `_pollingCanTick` and `_waitToTick` in `src/Store.tsx`; BDDs
in `__tests__/bdd.PollingFocusAndOnline.test.ts`). Semantics: a tick that comes due while the
app is not focused (or offline) waits, and runs as soon as the app is focused (or online)
again; a tick not yet due runs at its normal time; the immediate run of `Poll.start` and
`Poll.runNowAndRestart` is not affected; `Poll.stop`, `Poll.runNowAndRestart` and
`clearInternalActionProps()` drop a waiting tick. Where the store can't know (no sources), the
polling never pauses.

The **reference counting** (`Poll.subscribe`/`Poll.unsubscribe`) was **rejected**: polling in
Kiss is started and stopped explicitly by the app, not by how many components are on screen.

### Why

Kiss polling is started and stopped by hand (`Poll.start` / `Poll.stop`). The natural pattern,
`onMount: Poll.start`, `onUnmount: Poll.stop`, has two problems:

- Two components that poll the same action (a header badge and a list) share the polling key.
  When one unmounts and stops, the other stops receiving updates.
- Polling continues while the tab is hidden, wasting requests and battery.

### How React Query does it

`refetchInterval` runs only while the query has observers (mounted components), and the
interval is per query, not per component. `refetchIntervalInBackground: false` (default)
pauses it when the tab is hidden.

### Proposed API

**Reference counting in the store, per polling key.** A new `Poll.subscribe` /
`Poll.unsubscribe` pair, used by the hook in section 4 (and available by hand):

```ts
dispatch(new LoadPrices(Poll.subscribe));   // Starts polling if this key had no subscribers.
dispatch(new LoadPrices(Poll.unsubscribe)); // Stops polling when the last subscriber leaves.
```

`Poll.start`/`Poll.stop` keep their meaning and win over the subscribers (`Poll.stop` clears
the count, like `stopAllPolling()` and `clearInternalActionProps()`).

**New polling options in the action**, read by the store's timer:

```ts
class LoadPrices extends Action {
  constructor(readonly poll = Poll.once) { super(); }
  pollInterval = 5000;
  pollOnlyWhenFocused = true; // Pause the timer while the tab is hidden. On focus: tick now if
                              // the last tick is older than `pollInterval`, then resume.
  pollOnlyWhenOnline = true;  // Pause while offline. On reconnect: tick now, then resume.
  createPollingAction() { return new LoadPrices(); }
  ...
}
```

Defaults: `false` for both, to keep the current behavior (2.0.0 is unpublished, so `true` is
also possible, matching React Query; decide before release). Both use the signals of section 1.

---

## 4. `useKeepFresh`: keep an action's data up to date while mounted

**Status: rejected.** With `onMount`, `onFocus` and `onOnline` in `useStoreEffect` (section 2),
this hook would be a shortcut for three lines, plus two things that were rejected: the
reference-counted polling (section 3) and registering the component as "active" for the
invalidation (section 5). Without those, it's a repetition of `useStoreEffect`.

### Why

Sections 2 and 3 are building blocks. What `useQuery` really gives the user, in one line, is:
"while this component is on screen, keep this data loaded and current". A Kiss hook can give
the same, with an **action** in the place of the query, and the state in the place of the cache.

### How React Query does it

`useQuery({ queryKey, queryFn, staleTime, refetchOnMount, refetchOnWindowFocus,
refetchOnReconnect, refetchInterval })` registers an observer; the query refetches on those
events while it has observers, and the observer count also drives invalidation (section 5).

### Proposed API

```tsx
function Prices() {
  useKeepFresh(() => new LoadPrices(), { onFocus: true, onOnline: true, poll: true });
  const prices = useSelect((s: State) => s.prices);
  ...
}
```

```tsx
function User({ userId }) {
  useKeepFresh(() => new LoadUser(userId), { deps: [userId] });
  ...
}
```

- `onMount` (always): dispatches the action. If the action has `fresh`, a recently loaded one
  is skipped, as `refetchOnMount` with `staleTime`.
- `deps` (like `useStoreEffect`): when they change, the old action is unsubscribed (polling,
  invalidation) and the new one dispatched.
- `onFocus: true`, `onOnline: true` (default `true`, as React Query): re-dispatch on the
  transitions of section 2.
- `poll: true`: dispatches with `Poll.subscribe` on mount and `Poll.unsubscribe` on unmount
  (section 3). The interval is the action's `pollInterval`.
- The hook registers the action as **active** in the store, keyed by `computeFreshKey()`
  (falling back to the class). Invalidation (section 5) re-dispatches active actions.
- Re-dispatches after the first are marked as **background** runs (section 6), so spinners
  don't flicker.
- Returns nothing; the component reads the state with `useSelect`, and the status with
  `useIsWaiting`/`useIsFailed`, as always. There is no `data` return value: the data is wherever
  the reducer put it. This is the main difference from `useQuery`, and it's intentional.
- Implementation: on top of `useStoreEffect` and a `Set` of active actions per key in the
  store, cleared by `clearInternalActionProps()`.
- Name is open: `useKeepFresh`, `useKeepUpdated`, `useAutoDispatch`.

---

## 5. Invalidation

**Status: rejected.** Invalidation exists in React Query because the library owns a cache, and
the mutation doesn't know what's in it. In Kiss, the action that saves already knows what to
reload, and does it right away: `OptimisticCommand` has `reloadFromServer()`, `OptimisticSync`
has `onFinish` (where you can reload), and `OptimisticSyncWithPush` with `ServerPush` gets the
changes pushed by the server, so there's nothing to reload. A plain action can also dispatch
the load action itself (with a `force` flag, if the load action uses `fresh`). Adding a store
level "mark stale and re-run the active ones" would be complex, and would need the "active
components" registry of section 4, which was also rejected.

### Why

After a mutation (add a todo), the lists that show todos must reload. Today the mutation
action does `this.dispatch(new LoadTodos())`, which: must know every list to reload; reloads
even if no component shows them; and is aborted if `LoadTodos` has `fresh`, unless it passes a
`force` flag. The mutation shouldn't need to know all that.

### How React Query does it

`queryClient.invalidateQueries({ queryKey: ['todos'] })` marks every matching query stale
(partial key match: `['todos']` matches `['todos', 1]`) and refetches the **active** ones.
Inactive ones refetch when next used.

### Proposed API

```ts
class AddTodo extends Action {
  async reduce() {
    await api.addTodo(this.todo);
    this.invalidate(LoadTodos);            // All keys of LoadTodos.
    this.invalidate(LoadTodo, this.todo.id); // Only the one with this `freshKeyParams()`.
    return null;
  }
}
store.invalidate(LoadTodos);  // Also from outside actions.
store.invalidateAll();        // Same as removing all fresh keys and re-running everything active.
```

- Removes the fresh keys of the type (and key), as `removeFreshKey()` does for one action.
- Re-dispatches the actions of that type that are active (section 4), as background runs.
  Without `useKeepFresh`, invalidating just forgets the fresh key, and the next dispatch runs.
- Matching is by class (including subclasses) plus the optional key. Key prefixes (React
  Query's partial match) can be done by invalidating the class, or with `freshKeyParams()`
  returning an array and matching its prefix; the latter is a possible later addition.
- Note `clearInternalActionProps()` already does the "forget all fresh keys" half.

---

## 6. Background runs vs. first load

**Status: rejected.** React Query needs `isPending` vs. `isFetching` because the data lives in
its cache, and the component can't tell whether there is data yet. In Kiss the data lives in the
app's state, so the component just looks at it: on the first run the state is still empty
(`null`), and on the next runs it already has data. So `if (prices === null) return <Spinner/>`
is the first-load spinner, and `useIsWaiting(LoadPrices)` with data present is the
"refreshing" indicator. No new API is needed.

### Why

`useIsWaiting(LoadPrices)` is `true` during **every** run, including each poll tick and each
focus re-run. A component that does `if (isWaiting) return <Spinner/>` flickers every few
seconds, and a background failure with a `UserException` opens a dialog on every tick.

### How React Query does it

`isPending` (no data yet) vs. `isFetching` (a request is in flight, maybe with data shown).
`isRefetching = isFetching && !isPending`. Background errors keep the data and set `isError`.

Kiss can't know whether "there is data" (the state is the app's), so the distinction is made
on the **action run**, not on the data.

### Proposed API

- Every action gets `isBackground: boolean`. The store sets it to `true` on the runs it starts
  itself: poll ticks (`createPollingAction()`), focus/online re-runs and invalidations from
  `useKeepFresh`. The app can set it: `dispatch(new LoadPrices(), { background: true })`, or
  `get isBackground() { return !this.force; }`.
- Hooks: `useIsWaiting(T)` keeps meaning "any run in progress". Add
  `useIsWaiting(T, { background: false })` for "a foreground run is in progress" (the spinner
  of the first load), and `useIsRefreshing(T)` for "a background run is in progress" (a small
  indicator). Same option for `store.isWaiting`.
- Errors: a failed background run still marks the action as failed (`useIsFailed`), but the
  user-error dialog is **not** shown by default. The app can change this in `wrapError`, where
  `this.isBackground` is available.

---

## 7. Status per key

**Status: implemented**, with these differences from the proposal below:

- The method is a getter named `statusKey` (not `statusKeyParams()`). There is no
  `compute...Key()` here, since the key is never combined with anything: the action type is
  always separate. The docs of `statusKey` say that the key must come from the action's own
  fields and never change, and what is kept in memory.
- The option is `{ statusKey }`, not `{ key }`: `useIsWaiting(LoadUser, { statusKey: userId })`.
- The store keeps, per failure, only the action type, the `statusKey` and the error, not the
  action object (this also applies to actions without a key, and was done in AsyncRedux too).
- New `clearAllExceptions()`, called by `clearInternalActionProps()` (and so by `logOut()`,
  `setShutDown(true)` and `dispose()`), so the failures of a user don't stay in memory after
  the logout.
- `useLastRun` was dropped (see the end of this section).

### Why

`useIsWaiting(LoadUser)` is per class. A list of users where each row dispatches
`LoadUser(id)` shows a spinner in **every** row while any one loads. The key features
(`nonReentrantKeyParams`, `freshKeyParams`...) already give actions a per-instance identity;
the status hooks should be able to use it.

### How React Query does it

Every status (`isFetching`, `isError`, `error`, `failureCount`, `dataUpdatedAt`) is per
`queryKey`, and `useMutationState` filters mutations by key.

### Proposed API

```ts
class LoadUser extends Action {
  constructor(readonly userId: string) { super(); }
  statusKeyParams() { return this.userId; }
  ...
}

const isWaiting = useIsWaiting(LoadUser, { key: userId });
const isFailed = useIsFailed(LoadUser, { key: userId });
const error = useExceptionFor(LoadUser, { key: userId });
clearExceptionFor(LoadUser, { key: userId });
```

- `statusKeyParams()` returns the same kinds of values as the other `*KeyParams()` methods,
  compared the same way. Default `undefined`, which keeps today's per-class behavior.
- Without `key`, the hooks match any key (today's behavior). `store.isWaiting`, `isFailed`,
  `exceptionFor` and `clearExceptionFor` get the same option.
- A `useLastRun(T, { key })` hook returning `{ finishedAt, attempts }` was considered and
  dropped: actions leave `_actionsInProgress` when they finish, so the store would have to keep
  a record of every action that ever ran, per key, for the whole life of the store. An action
  that wants "updated 2 minutes ago" can simply write `updatedAt: Date.now()` into the state.

---

## 8. Global "anything in progress"

**Status: rejected.** A hook that counts every action in progress is a bad idea. In React
Query, `useIsFetching()` is useful because the library owns every request. In Kiss, actions
are not only requests: a global count mixes the actions that load data with the ones that
save, poll, sync, or just change the state. A top progress bar that reacts to all of them
would blink for things the user doesn't care about. The right way is to list the actions the
bar should show, with `useIsWaiting(LoadUser) || useIsWaiting(LoadPosts)`, which already
exists. For the rare case that really needs the global count, `store.actionsInProgress()` can
be read inside `useStoreEffect` or in a custom hook.

### Why

A top progress bar (like YouTube's) needs "is any action running", for which Kiss has
`store.actionsInProgress()` but no hook.

### How React Query does it

`useIsFetching()` and `useIsMutating()` return counts, optionally filtered.

---

## 9. Retry predicate: `shouldRetry`

**Status: done.** `KissAction.shouldRetry(error, attempt)`, default `true` for every error.
It's used by `retry`, `unlimitedRetryCheckInternet` and `OptimisticCommand` with `retry`.
BDDs in `__tests__/bdd.ShouldRetry.test.ts`.

### Why

`retry` retries on **any** error. Some errors are permanent: a 404, a 401, a validation error
from the server. Retrying them wastes time and delays the error message. The action should be
able to say which errors are worth retrying.

### How React Query does it

`retry: boolean | number | (failureCount, error) => boolean`, and
`retryDelay: number | (attempt, error) => number`.

### What Kiss already has

The `retry` property already configures the delays: `initialDelay`, `multiplier`, `maxDelay`,
`maxRetries` and `unlimitedRetries`. So React Query's `retryDelay` is already covered, except
for a delay that depends on the error itself (for example, a "Retry-After" value sent by a
rate-limited server). That case is rare, and not worth a new method. The only gap is the
predicate.

### Proposed API

An optional method in `KissAction`:

```ts
class LoadUser extends Action {
  retry = { on: true, maxRetries: 3 };

  shouldRetry(error: unknown, attempt: number): boolean {
    return !(error instanceof NotFoundError) && !(error instanceof UnauthorizedError);
  }
}
```

- `attempt` is the number of the attempt that just failed, starting at `1`. It's the same
  value `this.attempts` would have after this failure.
- **Default: `true` for every error**, which is the current behavior, and the same as the
  `Retry` mixin of Async Redux, whose `catch (error)` retries everything. This includes
  `UserException`: a `UserException` thrown by the reducer may well be transient (for
  example, "Could not reach the server, please try again"), and the action author is the one
  who knows. If an action wants to give up on a `UserException`, it overrides `shouldRetry`.
- `AbortDispatchException` is not an error, but a signal that the action was aborted on
  purpose, so the retry loop keeps never retrying it, and `shouldRetry` is not even called.
- When `shouldRetry` returns `false`, the action fails right away with that error, as if the
  retries had run out.
- It also applies to `unlimitedRetryCheckInternet`: a permanent error can then stop a loop
  that would otherwise retry forever. It's not called for the "no internet" case, which keeps
  waiting until there is internet.
- If `shouldRetry` itself throws, the action fails with that error.
- It's not called when the retries ran out, since the action fails anyway.
- An `OptimisticCommand` with `retry` handles its own retry of `sendCommandToServer`, and
  calls `shouldRetry` too, with the same default. When it returns `false`, the command rolls
  back (if `shouldRollback` says so) and fails right away.

---

## 10. Aborting actions from outside

### Why

`abortSignal` is only aborted by `ignoreOld`, when a newer action of the same key is
dispatched. A component that unmounts (the user left the page) can't cancel the request it
started, and a "Cancel" button has nothing to call.

### How React Query does it

`queryFn` receives `signal`; `queryClient.cancelQueries({ queryKey })` aborts it and keeps the
previous data. When the last observer unsubscribes and the `queryFn` consumed the signal, the
fetch is cancelled.

### Proposed API

```ts
store.abort(LoadUser);                    // All in-progress actions of the type (and subclasses).
store.abort(LoadUser, { key: userId });   // Only those with this `statusKeyParams()` (section 7).
action.abort();                            // One instance, for example from `dispatchAll`'s return.
```

- Aborts the `abortSignal`, and the action finishes like an old one under `ignoreOld`: its
  result and error are ignored, the state is unchanged, `isWaiting` goes back to `false`, and
  `isFailed` is not set. `action.isAborted` tells the reducer.
- `useKeepFresh(..., { abortOnUnmount: true })` and, by hand,
  `onUnmount: (store) => store.abort(LoadUser)`.

---

## 11. Paged (infinite) loading

### Why

Loading a list page by page ("load more", infinite scroll) needs: a cursor from the last
page, appending pages, knowing if there's a next page, no two loads of the same list at once,
and reloading all pages in order when the data must be refreshed. Everyone writes this by hand.

### How React Query does it

`useInfiniteQuery({ queryFn: ({ pageParam }), initialPageParam, getNextPageParam,
getPreviousPageParam, maxPages })` keeps `data.pages` and `data.pageParams`, with
`fetchNextPage`, `hasNextPage`, `isFetchingNextPage`. A refetch reloads pages one by one, from
the first, so cursors stay consistent.

### Proposed API

A base action class, in the style of `OptimisticCommand`, plus an immutable `Pages` value to
keep in the state:

```ts
class LoadTodos extends LoadPages<State, Todo[], string | null> {
  constructor(which: Pages.Which = Pages.first) { super(which); }

  getPagesFromState(state: State) { return state.todoPages; }           // Pages<Todo[], string | null>
  applyPagesToState(state: State, pages: Pages<Todo[], string | null>) { return state.copy({ todoPages: pages }); }
  initialCursor() { return null; }
  loadPage(cursor: string | null) { return api.todos(cursor); }
  nextCursor(lastPage: Todo[], pages: Pages<Todo[], string | null>) { return lastPage.at(-1)?.id ?? undefined; } // undefined = no more.
  maxPages = 5; // Optional: drop the oldest page from the other side.
}

dispatch(new LoadTodos(Pages.first));    // Replace everything with the first page.
dispatch(new LoadTodos(Pages.next));     // Append the next page (no-op if `!hasNext`).
dispatch(new LoadTodos(Pages.previous)); // Needs `previousCursor()`; prepend.
dispatch(new LoadTodos(Pages.refresh));  // Reload the loaded pages, first to last.
```

```tsx
const pages = useSelect((s: State) => s.todoPages);
const isLoadingMore = useIsWaiting(LoadTodos);
<button disabled={!pages.hasNext || isLoadingMore} onClick={() => dispatch(new LoadTodos(Pages.next))}>
pages.items  // Flattened, for convenience.
```

- `Pages` holds `pages`, `cursors`, `hasNext`, `hasPrevious`, and `items` (flattened).
- Non-reentrant per key automatically (key from `statusKeyParams()`/class), so two "next" clicks
  load one page. `Pages.first` is `ignoreOld` over a running `next`.
- Works with `fresh`, `retry`, `useKeepFresh` and invalidation: an invalidation does
  `Pages.refresh`.

---

## 12. Suspense and error boundaries

### Why

Some apps prefer React's `<Suspense>` and error boundaries to `isWaiting`/`isFailed` checks.

### How React Query does it

`useSuspenseQuery` suspends until the data exists; `throwOnError` throws the error to the
nearest boundary.

### Proposed API

```tsx
useSuspendWhileWaiting(LoadUser, { key: userId }); // Throws a stable promise while an action
                                                   // of the type (and key) is in progress.
useThrowIfFailed(LoadUser);                        // Throws the `UserException` to the boundary,
                                                   // and clears it (`clearExceptionFor`).
```

- The store must keep one promise per in-progress action key, resolved when it finishes
  (`waitActionType` builds a new one per call, which doesn't work with Suspense).
- Must be `false`/no-op on the server and during hydration, like the other status hooks
  (`serverState`).
- Low priority: Kiss's explicit status hooks are the recommended style. Only if there is demand.

---

## 13. Persisted offline actions

### Why

An action with `unlimitedRetryCheckInternet` waits for the internet, but if the user closes
the app while offline, the pending change is lost.

### How React Query does it

`networkMode: 'offlineFirst'` pauses mutations while offline; `persistQueryClient` persists
them; `resumePausedMutations()` on startup replays them, with `setMutationDefaults` to find the
`mutationFn` by key.

### Proposed API (sketch)

```ts
class SaveNote extends Action {
  unlimitedRetryCheckInternet = true;
  persistent = true;                         // The store persists it while pending.
  toJSON() { return { noteId: this.noteId, text: this.text }; }
  static fromJSON(json) { return new SaveNote(json.noteId, json.text); }
}
createStore({ ..., persistentActions: [SaveNote, DeleteNote] }); // The registry for `fromJSON`.
store.resumePersistentActions(); // After `store.ready()`, re-dispatches them in order.
```

Needs the persistor to store a list of actions beside the state, and a decision on ordering
(probably `sequential` per key). Low priority: sketch only, to be designed when needed.

---

## Already equivalent

| React Query                                            | Kiss                                                                              |
|--------------------------------------------------------|-----------------------------------------------------------------------------------|
| `queryFn` + cache                                      | Async `reduce()` + state                                                          |
| `queryKey`                                             | Action class + `*KeyParams()` (`freshKeyParams`, `nonReentrantKeyParams`...)      |
| `staleTime`                                            | `fresh`                                                                           |
| `refetchOnMount` (stale only)                          | `useStoreEffect({ onMount })` + `fresh`                                           |
| `enabled`, dependent queries, `skipToken`              | Don't dispatch; `dispatchWhen`; `waitCondition`                                   |
| `useQueries`                                           | `dispatchAll`, `dispatchAndWaitAll`                                               |
| `select`, `structuralSharing`                          | `useSelect`, `useObject`                                                          |
| `initialData`, `placeholderData`                       | `initialState`                                                                    |
| `placeholderData: keepPreviousData`                    | `ignoreOld` (state keeps the old value until the newest finishes)                 |
| `retry`, `retryDelay` (exponential)                    | `retry`                                                                           |
| `networkMode: 'online'`, paused while offline          | `checkInternet`, `unlimitedRetryCheckInternet`                                    |
| `onlineManager.setOnline(false)` in tests              | `store.forceInternetOnOffSimulation`                                              |
| `useMutation`, `onSuccess`/`onError`/`onSettled`       | Action; `after()`, `wrapError()`, `useIsFailed`, `useExceptionFor`                |
| `onMutate` + rollback (optimistic updates)             | `OptimisticCommand`, `OptimisticSync`, `OptimisticSyncWithPush`                   |
| Mutation `scope` (serial mutations)                    | `sequential`                                                                      |
| `setQueryData`                                         | A sync action                                                                     |
| `isPending`, `isError`, `error`                        | `useIsWaiting`, `useIsFailed`, `useExceptionFor` (per class; per key: section 7)  |
| `signal` in `queryFn`                                  | `this.abortSignal` (aborted by `ignoreOld`; from outside: section 10)             |
| `prefetchQuery`, `ensureQueryData`                     | `dispatch` / `dispatchAndWait` with `fresh` (for example, on `onMouseEnter`)      |
| `dehydrate`/`hydrate`, streaming SSR, RSC              | `serverState`, `mergeServerState`, the server entry point                         |
| `persistQueryClient`                                   | Persistor                                                                         |
| `QueryClient.clear()`, `removeQueries`                 | `clearInternalActionProps()`, `logOut()`, a reset action                          |
| `gcTime` (forget unused data)                          | Not needed: the state is explicit. Dispatch a clean-up action in `onUnmount`.     |
| Devtools                                               | `actionObserver`, `stateObserver` (no UI)                                         |
| Debounce/throttle (not in React Query)                 | `debounce`, `throttle`                                                            |
