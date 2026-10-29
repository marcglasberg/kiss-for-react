# Changelog

## 2.0.5

### Changes

* **`checkInternet` no longer needs `super.before()`.** Note:
  * The internet is now checked before your `before()` runs. If there is no internet,
    `before()` and `reduce()` don't run, but `wrapError()` and `after()` do, as before.
  * `dispatchSync` of an action with `checkInternet` now throws a `StoreException` that says
    the action uses `checkInternet`, even if the action overrides `before()` with a sync
    method.

* **New `noInternetException()` method, to change the no-internet error of `checkInternet`.**
  Override it in the action to return your own `UserException`. Before, you had to override
  `before()`, call `super.before()` inside a `try`/`catch`, and throw your own error. That
  code doesn't work anymore, since `super.before()` doesn't check the internet now. Move your
  error to `noInternetException()`:

  ```ts
  protected noInternetException() {
    return new UserException('You are offline. The prices could not be loaded.');
  }
  ```

  The `dialog` option of `checkInternet` still decides if the error opens a dialog.

* **Overriding `reduce()` in a subclass of these Kiss base classes now throws a `StoreException`: 
  `OptimisticCommand`, `OptimisticSync`, `OptimisticSyncWithPush`, `ServerPush` or `LoadPages`
  that overrides `reduce()` (or, in a `LoadPages`, the `statusKey` getter). Before, only 
  the docs and the ESLint rule `missing-super-in-override` warned about it.

## 2.0.4

### Bug fixes

* **`store.dispose()` now waits for the async prop disposals that started before it.** When a
  prop with an async `dispose` was removed with `disposeProp`, `disposeProps` or
  `logOut({ disposeProps: true })`, or replaced with `setProp`, and `store.dispose()` was
  called before that disposal finished, the dependencies and the configuration were disposed
  while the resource was still closing, and `store.dispose()` resolved before it closed. Now
  `store.dispose()` waits until no prop disposal is running (including the ones a disposal
  starts, and a prop set during the disposal), and only then disposes the dependencies and the
  configuration.

* **Stopping polling now also stops a start that was still pending.** When an action with
  `Poll.start` or `Poll.runNowAndRestart` was in an async `before()`, and meanwhile polling was
  stopped with `Poll.stop` or `stopAllPolling()`, the action still started polling when its
  `before()` finished. So a component that stopped polling when it unmounted could leave the
  polling running. Now the pending action is aborted (its status has `isDispatchAborted: true`),
  it doesn't run its reducer, and no polling starts. `Poll.stop` only aborts the pending starts
  of its own polling key. This already worked for `store.clearInternalActionProps()`,
  `store.setShutDown(true)` and `store.logOut()`.

* **`StoreSlice` no longer changes the live store while React renders.** It merged the slice
  during the render, so a render React threw away (a transition to a route that suspends, then
  cancelled) left the slice in the store, and the next state change showed it in the route
  still on screen. Now the components inside the slice read the merged state from their first
  render, and the store is only changed when the route commits. With nested slices (a layout
  and its page, each with a `StoreSlice`), the components inside the inner slice also read the
  data of the outer slices from their first render. On the server (no `window`, or a store
  created with `server: true`), the slice is still merged during the render.

* **`StoreSlice` now follows its `StoreProvider` when the provider switches stores.** When the
  `store` prop of `StoreProvider` changed while a `StoreSlice` below it stayed mounted, the
  components inside the slice still read the old store, but their actions changed the new
  store. Now they read and change the new store, and the slice (its current `state` prop) is
  merged into the new store, once, so the route still finds its data there. If the provider
  switches back to a store that the slice already used, the slice is not merged into it again.

* **`OptimisticSyncWithPush` no longer sends another device's old value instead of the latest
  local value.** When a push from another device arrived while a request was in flight, and
  then the echo of that request arrived before its response, the follow-up request sent the
  pushed value, and the local edit was lost. Now the echo marks the pushed value as stale, and
  the latest local value is put back in the state and sent.

* **`OptimisticSync` and `OptimisticSyncWithPush` no longer lose a save dispatched while the
  server response is applied.** For example, a save dispatched by `store.dispatchWhen` when the
  state with the server response meets its condition. That save changed the state, but no
  request sent its value. Now the dispatch that sends the requests sends one more request with
  the new value.

* **The optimistic actions no longer change the state or send requests after they are
  aborted.** When `action.abort()` or `store.abort(ActionType)` aborted an `OptimisticCommand`
  while its server call ran, the server response was still applied (or the value was rolled
  back and reloaded, if the call failed), and with `retry` the abort was reported as
  `store.clearInternalActionProps()`. An aborted `OptimisticSync` or `OptimisticSyncWithPush`
  still sent follow-up requests, applied the server response, and called `onFinish`. Now an
  aborted optimistic action stops when its request finishes, and changes nothing.

* **`ServerPush` now saves the server revision of the device's own latest request in the
  state, when the server response arrives before its echo.** The response informed the
  revision, so the echo was ignored as not newer, and `applyServerPushToState` didn't save the
  revision in the state. After a restart with the persisted state, an older push could then
  overwrite the confirmed value. Now that echo is applied.

* **An action aborted during its `debounce` period, or while `unlimitedRetryCheckInternet`
  checks the internet, no longer runs its reducer.** When `action.abort()` or
  `store.abort(ActionType)` aborted it, the reducer still ran when the wait ended (and its
  result was then discarded), so a request could reach the server after the abort. Now the
  action finishes as aborted without running its reducer. An action aborted during its
  `debounce` period also stops waiting right away, as it already did while waiting to retry.

* **`ClassPersistor` now restores the saved values of read-only fields.** When the constructor
  of a state class called `Object.freeze(this)`, or made a field read-only with
  `Object.defineProperty`, the restored state kept the constructor's default values instead of
  the saved values, and no error was reported. A saved field that the constructor of a frozen
  class doesn't create made the store report an error and delete the saved state. Now the
  restored state has all the saved values, and its fields are still read-only (and the state is
  still frozen). The only exception is a class that extends a built-in class, like `Map`: its
  read-only fields still keep the constructor's values.

## 2.0.0

### New features

* New **`server` option** of `createStore`, for the store that loads the data of a request in
  server-side rendering (the one the server code creates per request, dispatches the loading
  actions on, renders from, and disposes). The server runs the same action classes as the
  client, and only wants to run their reducers once. So, in a store created with
  `server: true`, the action features that repeat or wait run the reducer once, now, and stop:
  `Poll.start` and `Poll.runNowAndRestart` run the action once and start no polling; `retry`,
  `unlimitedRetryCheckInternet` and the `retry` of an `OptimisticCommand` run once and fail
  right away with the reducer's error; `debounce` runs the reducer right away. The
  `focusSource` and `onlineSource` are not started, and a `persistor` throws a
  `StoreException`. Everything else is unchanged, the validations of the features still run,
  and the store still has to be disposed after rendering. The new `store.isServer` getter
  reads the option, so an action can skip client-only work on the server. The default is
  `false`, and nothing changes for the stores that don't use the option.

  ```ts
  const store = createStore<State>({ initialState: emptyState, server: true });
  try {
    await store.dispatchAndWait(new LoadData());
    return store.state;
  } finally {
    await store.dispose();
  }
  ```

* New **store props**, to keep the long-lived things of the app that are not state, and must
  not go in the state: intervals, WebSockets, `EventSource`s, `AbortController`s, listeners
  (like Firebase's `onSnapshot`), RxJS subscriptions. `setProp(key, value, { dispose? })`,
  `prop(key)`, `props`, `disposeProp(key)` and `disposeProps(predicate?)`, on the store and in
  actions. Kiss knows how to dispose an `AbortController`, a `WebSocket`, `EventSource`,
  `BroadcastChannel`, `MessagePort` or `Worker`, an object with `unsubscribe()`, and an object
  with `[Symbol.dispose]()` or `[Symbol.asyncDispose]()`. Timers and functions need the
  `dispose` option. Setting a prop again with the same key disposes the previous value, so a
  "start" action dispatched twice doesn't leak. A disposal that fails is given to the
  `errorObserver` (with a `null` action), or logged, and the other props are still disposed.
  `logOut` has a new `disposeProps` option (`true`, or a predicate), and keeps the props by
  default. The lint rule `non-state-object-in-state` now suggests `setProp`.

  ```ts
  class StartClock extends Action {
    reduce() {
      const interval = setInterval(() => this.dispatch(new Tick()), 1000);
      this.setProp('clock', interval, { dispose: clearInterval });
      return null;
    }
  }

  class StopClock extends Action {
    reduce() { this.disposeProp('clock'); return null; }
  }
  ```

* New `store.dispose()`, to end the store when the app finishes, or at the end of each test:
  `afterEach(() => store.dispose())`. It shuts down the store (which also clears the internal
  action props, stopping the polling, the retries, the debounce timers and the sequential
  queues), cancels the `dispatchWhen`s that are still waiting, rejects the `waitCondition`s,
  `waitActionCondition`s, `waitAllActions`s and the other waits still pending (with an
  `AbortDispatchException`, so that an action awaiting them is aborted, not failed) and cancels
  their timeouts, pauses the persistor and cancels its pending save, and disposes all the
  props. It returns a promise that waits for the async disposals, and never rejects.
  `store.isDisposed` tells if it was called. The store also implements `[Symbol.dispose]` and
  `[Symbol.asyncDispose]`, so that tests can write `await using store = createStore(...)`.
  On a server, dispose the store of each request after rendering, so that no timer is left
  behind in the Node process.

* The store now knows whether the app is **focused** and **online**: `store.isFocused` (in the
  browser, the document is visible, following the `visibilitychange` event) and
  `store.isOnline` (`navigator.onLine`, following the `online` and `offline` events). Where the
  store can't know (the server, Node, React Native), both are `true`, unless `createStore` is
  given a `focusSource` or an `onlineSource` (a function that gets a setter and returns an
  unsubscribe, for `AppState` and `NetInfo` in React Native, or a ping to your server). The
  sources are started lazily, when the signal is first read, and stopped by `store.dispose()`.
  In tests, `store.setFocused(bool)` and `store.setOnline(bool)` set them by hand (and
  disconnect the source; `null` connects it again).

  - `useStoreEffect` has new callbacks `onFocus`, `onBlur`, `onOnline` and `onOffline`, called
    on the transitions only, while the component is mounted and after `onMount`. Use them to
    reload the data on screen when the user comes back to the tab, or when the internet comes
    back (with a `fresh` period on the action to skip recent data):

    ```tsx
    useStoreEffect({
      onMount: (store) => store.dispatch(new LoadPrices()),
      onFocus: (store) => store.dispatch(new LoadPrices()),
      onOnline: (store) => store.dispatch(new LoadPrices()),
    });
    ```

  - New hooks `useIsFocused()` and `useIsOnline()`, for example for an "offline" banner. Both
    are `true` on the server.

  - The default `hasInternet()` of the actions, used by `checkInternet` and
    `unlimitedRetryCheckInternet`, now returns `store.isOnline`, so an `onlineSource` makes them
    work in React Native with no change to the actions. In the browser the behavior is the same
    as before (`navigator.onLine`). Overriding `hasInternet()` still works, and
    `store.forceInternetOnOffSimulation` still takes precedence.

  - Polling has new options `pollOnlyWhenFocused` and `pollOnlyWhenOnline`, both `true` by
    default: the ticks only run while the app is focused and online. A tick that comes due
    while the user is on another tab, or offline, waits, and runs as soon as the user comes
    back, or the internet is back; the polling then goes on at the normal interval. The
    immediate run of `Poll.start` and `Poll.runNowAndRestart` is not affected. Set them to
    `false` to keep polling anyway. Where the store can't know (the server, Node, React Native
    without sources), the polling never pauses.

* **Server-side rendering**, with React 18 and 19: every hook has a server snapshot, so the
  components render with `renderToString`, `renderToPipeableStream` and
  `renderToReadableStream` (with Suspense boundaries that resolve during the streaming), and
  hydrate with `hydrateRoot` without mismatches. The new `serverState` prop of `StoreProvider`
  (see below) is the state the server HTML was rendered from, which hydration renders even if
  the client store already changed (for example, a persistor restored a newer state). For
  React Server Components (the Next.js app router): the hooks and the `StoreProvider` are
  marked `'use client'`, and the package has a `react-server` export condition, so that server
  components get its server entry, with the store and the actions but no hooks (also exported
  as `kiss-for-react/server`; it also exports the `StoreProvider` and `StoreSlice` components,
  which the bundler turns into client references). See "Server-side rendering" in the README,
  and the examples `examples/nextjs-app-router`, `examples/nextjs-pages-router` and
  `examples/ssr-express`, each with a Playwright test of the server HTML and the hydration.

* New **`StoreSlice`** component, for server-rendered apps with several routes: each route
  loads its own data on the server (a server component, `getServerSideProps`, a loader) and
  renders its content inside `<StoreSlice state={{ user }} key={user.id}>`. The slice is merged
  into the store once per mount, before the children render: on the server, the HTML shows the
  route's data; on the client, hydration matches, and client-side navigation shows the new
  route's data in its first render. It's a `MergeServerStateAction`, dispatched by the new
  `store.mergeServerState(slice)`, with the new `mergeServerState` option of `createStore` (the
  default is a shallow merge for plain-object states; class-based states need the option). A
  slice merged before the store is ready (persistor still reading) is merged again into the
  persisted state when it arrives.

* New **environment, dependencies and configuration**, injected into the store, so that the
  actions get their services (API clients, repositories, analytics...) from the store, instead
  of importing them from modules. Each test creates its own store with its own dependencies
  (fakes, for example), with nothing global to set up or reset. `createStore` takes
  `environment` (any value, usually an enum), `configuration` (a factory that gets the store,
  for feature flags) and `dependencies` (a factory that gets the store, and can read the
  environment and the configuration, which is created first). Read them with
  `store.environment`, `store.configuration` and `store.dependencies` (typed `unknown`: declare
  typed getters in your base action), and in components with the new hooks `useEnvironment()`
  and `useConfiguration()`, which never re-render. The `errorObserver` can read
  `store.environment`, to send errors to a monitoring service only in production.
  `store.dispose()` disposes the dependencies and the configuration when they have a
  `dispose()`, `[Symbol.dispose]()` or `[Symbol.asyncDispose]()` method, and `logOut` keeps
  them. New lint rules `dependencies-cast-in-action` and `error-observer-without-environment`
  (opt-in).

  ```ts
  const store = createStore<State>({
    initialState: State.initialState,
    environment: Environment.production,
    configuration: (store) => new Config(),
    dependencies: (store) => new Dependencies(),
  });

  abstract class Action extends KissAction<State> {
    get deps() { return this.store.dependencies as Dependencies; }
  }
  ```

* New **events**, for an action to ask the UI to do something once, that is not a state change:
  scroll a list, clear or focus an input, open a dialog. The action puts a `new Evt()` (or a
  `new Evt(value)`) in the state, and the component handles it with the new `useEvent` hook,
  whose callback runs once per event, even if the component mounts after the action ran. The
  store remembers which events were already handled (spent), so the event and the state stay
  immutable, and nothing is spent during render (React may throw a render away). Also:
  `useLayoutEvent` (runs the callback before the browser paints), `EvtState` (an event that
  all the mounted components react to), `Evt.spent()` and `EvtState.spent()` for the initial
  state, and `store.isEventSpent(evt)` for tests. The `ClassPersistor` saves events as spent, so
  an old event doesn't fire when the app restarts. New lint rules `event-name-suffix` and
  `event-not-spent-initially`.

  ```tsx
  class ScrollFeedToTop extends Action {
    reduce() { return this.state.copy({ scrollToTopEvt: new Evt() }); }
  }

  useEvent((state: State) => state.scrollToTopEvt, () => listRef.current?.scrollTo({ top: 0 }));
  ```

* New hook `useStoreEffect()`, to use instead of a `useEffect` to dispatch actions when the
  component mounts (`onMount`), when some values change (`deps` and `onDepsChange`), and when
  it unmounts (`onUnmount`). They get the store, run only after the store is ready, and run
  once even in React's `StrictMode`. Like a `useEffect` cleanup, `onUnmount` runs before the
  `onMount` of a component mounted in the same render (in a route switch, for example):

  ```tsx
  useStoreEffect({
    deps: userId,
    onMount: (store) => store.dispatch(new LoadUser(userId)),
    onDepsChange: (store, oldUserId) => {
      store.dispatch(new StopListening(oldUserId));
      store.dispatch(new LoadUser(userId));
    },
    onUnmount: (store) => store.dispatch(new CleanResources()),
  });
  ```

* New hook `useObject()`, to select an object (or an array, `Map` or `Set`) with some parts of
  the state. The component re-renders only when one of its values changes:
  `useObject((state: State) => ({ name: state.name, age: state.age }))`. Its type doesn't
  accept other values, like class instances or a `Date`. The lint rule
  `new-values-in-use-object` reports values created inside the result, like `state.items.filter(...)`.

* New hook `useIsStoreReady()`: returns `false` while the store is loading the persisted
  state, and `true` after. Use it to show a loading state, and to disable the buttons that
  dispatch actions, while the store is not ready.

* New `dispatchWhen`, which dispatches an action when a state condition becomes true.
  Available as the `useDispatchWhen()` hook, as `store.dispatchWhen()`, and as
  `this.dispatchWhen()` inside actions. The action is dispatched right after the state change
  that meets the condition. If the same state change meets several conditions, their actions
  are dispatched one after the other, and each condition is checked again right before its
  action is dispatched: if an earlier action made it false, it keeps waiting.

* New `onTimeout` option for all wait methods (`waitCondition`, `waitActionCondition`,
  `waitAllActions`, `waitActionType`, `waitAllActionTypes`, `waitAnyActionTypeFinishes`) and
  for `dispatchWhen`. If given, it's called when the wait times out, and the wait resolves
  with `null` instead of rejecting with a `TimeoutException`.

* `TimeoutException` is now exported, so you can catch it, and change
  `TimeoutException.defaultTimeoutMillis`.

* `isWaiting` and `useIsWaiting` now accept abstract action classes, and return `true` while
  any subclass of them is running.

* New `OptimisticCommand` abstract class, for actions that send a command to the server
  (create, delete, submit, upload, checkout...). It applies an optimistic value right away,
  rolls it back if the command fails (unless the value was changed meanwhile), and can apply
  the server response and reload from the server. It's always non-reentrant (per class, or
  per key with `nonReentrantKeyParams()` or `computeNonReentrantKey()`). With `retry`, only
  the server call is retried, so the optimistic value is not rolled back between attempts.

* New `OptimisticSync` abstract class, for rapid toggles like a "like" button. Every dispatch
  applies its value to the state right away, but only one request per key is in flight. When
  it finishes, if the state changed, a follow-up request sends the latest value, until the
  state stabilizes. It can apply the server response, and calls `onFinish` at the end (with
  the error, if a request failed). Separate keys with `optimisticSyncKeyParams()`, or share
  them between classes with `computeOptimisticSyncKey()`. It can only be combined with
  `checkInternet`. `store.clearInternalActionProps()` releases its keys.

* New `OptimisticSyncWithPush` and `ServerPush` abstract classes, for apps that receive server
  pushes (WebSockets, SSE, Firebase), and where more than one device may change the same value.
  `OptimisticSyncWithPush` works like `OptimisticSync`, but each dispatch increments a
  local-revision of its key, and `sendValueToServer(value, localRevision, deviceId)` must call
  `informServerRevision()`. When a request finishes, a follow-up request is sent if the latest
  change is local and newer than the one sent, but not if it came from a push. The server
  response is only applied if no newer server revision is known. Pushes are applied by actions
  that extend `ServerPush`, which ignore stale and out-of-order pushes, and the echoes of older
  requests of this device. A push whose server revision is not a finite number fails with a
  `StoreException`, and doesn't change the state. The device ID is
  `OptimisticSyncWithPush.deviceId()`, which you can change. `ServerPush` can't be combined with
  any other feature.

* New `LoadPages` abstract class, for lists loaded page by page ("load more", infinite
  scroll). It keeps the loaded pages in the state, in an immutable `Pages` value (`pages`,
  `pageParams`, `hasNextPage`, `hasPreviousPage`). Implement `getPagesFromState`,
  `applyPagesToState`, `initialPageParam`, `loadPage` and `nextPageParam` (and
  `previousPageParam` for the other direction), and dispatch it with the pages to load:
  `'refresh'` (the default: loads again the pages in the state, one after the other from the
  first, or the first page if there are none), `'next'`, `'previous'` or `'first'` (starts
  over). Only one load per list runs at a time: a `'next'` or `'previous'` is aborted while
  the list is loading, and a `'first'` or `'refresh'` aborts the running loads. `maxPages`
  limits the pages kept, dropping the page at the other end. `pagesKeyParams()` separates the
  lists loaded by the same class, and is also the `statusKey`. `fresh` and `throttle` only
  apply to `'first'` and `'refresh'`. It can't be combined with `nonReentrant` or
  `ignoreOld`. If the state is persisted with a `ClassPersistor`, add `Pages` to its classes.

* New `debounce` action property. With `debounce = 300` (milliseconds), or `debounce = true`
  for the default 333 milliseconds, the action waits until it stops being dispatched for that
  long, and only the last action runs its reducer. Actions of the same class debounce each
  other, or override `debounceLockBuilder()` to choose the lock. `removeAllDebounceLocks()`
  removes all locks. It can't be combined with `retry`, nor used in an `OptimisticCommand`.
  When combined with `nonReentrant`, `throttle` or `fresh`, their checks happen when the
  debounce period ends, right before the reducer runs, so the replaced actions don't take the
  key, and the last action is aborted if the key is taken when its wait time ends.

* New `ignoreOld` action property. With `ignoreOld = true`, when the action is dispatched
  again, the actions of the previous dispatches (with the same key) that are still running
  become old: their results and errors are ignored, and they are aborted silently. Only the
  newest dispatch changes the state, so a slow request that finishes late doesn't overwrite
  the newer information. `isAborted` tells if the action became old. An action waiting to
  retry stops retrying when it becomes old. Actions of the same class share the key, or
  override `ignoreOldKeyParams()` to separate them by some fields, or `computeIgnoreOldKey()`
  so that different classes share it. It can be combined with `debounce`, `throttle`, `fresh`,
  `retry` and `checkInternet`, but not with `nonReentrant`, `sequential` or
  `unlimitedRetryCheckInternet`, nor used in an `OptimisticCommand`, `OptimisticSync`,
  `OptimisticSyncWithPush` or `ServerPush`.

* New `store.abort(ActionType)`, which aborts all the actions of the type (or of a subclass)
  that are in progress, and new `action.abort()`, which aborts one action instance. An aborted
  action finishes silently: its `abortSignal` is aborted (so a `fetch` that got it is
  cancelled right away), its result is ignored, and so are its errors (no error dialog, it
  doesn't count as failed, and it isn't retried). Its status has `isDispatchAborted: true`,
  and `dispatchAndWait` resolves. A request that ignores the signal still finishes, and only
  then its result is ignored. An action aborted during `before` doesn't run its reducer, one
  aborted while waiting to retry stops retrying, and one aborted before it's dispatched
  doesn't run at all. Pass `{ statusKey }` to abort only the actions with that key. Use it
  for a "Cancel" button, or in `useStoreEffect` with `onUnmount: (store) => store.abort(LoadUser)`,
  to cancel the request a component started when it unmounts.

* New `abortSignal` action getter, an `AbortSignal` that is aborted when the action is
  aborted: by `ignoreOld`, by `store.abort` or by `action.abort()`. Pass it to `fetch` (or
  any API that accepts a signal) to cancel the request. The `AbortError` that `fetch` then
  throws is ignored, like any error of an aborted action. New `isAborted` action getter,
  `true` when the action was aborted, to check inside the reducer after an `await`.

* The internal members of `KissAction` and `Store` (the ones named with a leading underscore,
  like `_abortController`) are no longer in the published typings, so they don't show up in
  autocompletion. They still exist at runtime, for Kiss itself.

* New `throttle` action property. With `throttle = 5000` (milliseconds), or `throttle = true`
  for the default 1000 milliseconds, the action runs at most once per throttle period, and
  the dispatches inside the period are aborted. Override `ignoreThrottle` to run it anyway.
  The lock is kept if the action fails, unless `removeThrottleLockOnError = true`. Actions of
  the same class throttle each other, or override `throttleLockBuilder()` to choose the lock.
  `removeThrottleLock()` and `removeAllThrottleLocks()` remove the locks. It can't be combined
  with `nonReentrant`, nor used in an `OptimisticCommand`.

* New `fresh` action property. With `fresh = 5000` (milliseconds), or `fresh = true` for the
  default 1000 milliseconds, the action's result is fresh for that period, and the dispatches
  while it's fresh are aborted. Override `ignoreFresh` to run it anyway. If the action fails,
  its data doesn't stay fresh. Actions of the same class share the fresh period, or override
  `freshKeyParams()` to separate them by some fields, or `computeFreshKey()` so that different
  classes share it. `removeFreshKey()` and `removeAllFreshKeys()` remove the keys. It can't be
  combined with `nonReentrant` or `throttle`, nor used in an `OptimisticCommand`.

* New `sequential` action property. With `sequential = true`, actions run one at a time, in
  the exact order they were dispatched. All sequential actions share a single queue, or
  override `sequentialKeyParams()` to have independent queues per key. Override
  `discardQueueOnError()` to discard the actions waiting in the queue when an action fails.
  Waiting actions count as in progress for `isWaiting`, and `isWaitingInSequentialQueue` and
  `wasDiscardedFromSequentialQueue` tell an action's state in the queue. Sequential actions
  are always async, so they can't be dispatched with `dispatchSync`. It can't be combined
  with `debounce`.

* New `AbortDispatchException`. Throw it from an action's `before` or `reduce` to abort the
  action silently, for example after some async check (`abortDispatch()` must decide
  synchronously). The `after` method still runs, the action doesn't count as failed
  for `isFailed`, it's not retried, and `dispatchAndWait` resolves instead of rejecting. Like
  in AsyncRedux, the exception first goes through `wrapError` and the `errorObserver`, which
  may turn it into another error. And they may also return an `AbortDispatchException` to
  abort the action silently. The `AbortDispatchException`s that Kiss itself uses to abort
  actions (`ignoreOld`, `sequential`, `checkInternet` with `abort`, and when retries stop) are
  not given to `wrapError` or the `errorObserver`.

* New `ActionStatus.isDispatchAborted`. It's `true` when the action threw an
  `AbortDispatchException`, and in the status returned by `dispatchAndWait` when the dispatch
  was aborted before running: by `abortDispatch()`, `nonReentrant`, `throttle`, `fresh`, a
  `null` mock, or a shut down store.

* New `checkInternet = { abort: true }` option. When there is no internet, the action aborts
  silently (with an `AbortDispatchException`), as if it had never been dispatched, instead of
  failing with a `UserException`. It can't be used together with `dialog`.

* New `store.forceInternetOnOffSimulation`, to simulate the internet connection in tests. Set
  it to `() => false` (no internet) or `() => true` (internet) for all actions that use
  `checkInternet` or `unlimitedRetryCheckInternet`, or to `() => null` (the default) to use the
  real connection. It takes precedence over `hasInternet()`. To simulate it for a single
  action, override its `internetOnOffSimulation` getter. The ESLint plugin's
  `testing-feature-in-production` rule reports both outside tests.

* New `shouldRetry(error, attempt)` action method, to give up retrying on some errors. By
  default, `retry` retries every error, including `UserException`s. Override `shouldRetry` to
  return `false` for errors that will fail again anyway (like a 404 or a 401), and the action
  fails right away with that error. It's called after each failed attempt that still has retries
  left, with the error and the attempt number (starting at 1). It also works with
  `unlimitedRetryCheckInternet` (where it's the only way to stop a permanent error from being
  retried forever; it's not called when there is no internet) and with an `OptimisticCommand`
  with `retry` (which then rolls back and fails right away). An `AbortDispatchException` is
  never retried, and doesn't reach `shouldRetry`.

  ```ts
  class LoadUser extends Action {
    retry = { on: true };

    shouldRetry(error: unknown, attempt: number) {
      return !(error instanceof NotFoundError);
    }
  }
  ```

* New `unlimitedRetryCheckInternet` action property. With `unlimitedRetryCheckInternet = true`,
  the internet is checked before each attempt. If there is no internet, the reducer doesn't
  run, and the action retries unlimited times until there is internet. It also retries
  unlimited times when there is internet but the action fails. Note `retry` plus
  `checkInternet` doesn't retry when there is no internet. The action is non-reentrant for the
  whole time until it succeeds, sharing the keys of `nonReentrant`. Pass an object to change
  the `initialDelay` (default 350 milliseconds), `multiplier` (default 2), `maxDelay` (default
  5000 milliseconds) and `maxDelayNoInternet` (default 1000 milliseconds). It needs an async
  reducer, and can't be combined with `retry`, `checkInternet`, `nonReentrant`, `debounce`,
  `throttle`, `fresh`, `sequential` or polling, nor used in an `OptimisticCommand`.

* New `poll` action property, to dispatch an action periodically. Dispatch the action with
  `Poll.start` to run it right away and start polling, with `Poll.stop` to stop, with
  `Poll.runNowAndRestart` to run it now and restart the timer, or with `Poll.once` to run it
  once without affecting the polling. Override `createPollingAction()` to return the action
  each tick dispatches. The interval is `pollInterval` (default 10000 milliseconds). By
  default, each tick waits for the previous run to finish, so runs never overlap. Set
  `pollWaitsForRun = false` to tick at a fixed rate instead. Actions of the same class share
  the polling, or override `pollingKeyParams()` to separate them by some fields, or
  `computePollingKey()` so that different classes share it. `stopAllPolling()` stops all
  polling, and so does `store.setShutDown(true)`. It can't be combined with `retry`,
  `debounce` or `OptimisticCommand`.

* New `store.clearInternalActionProps()`, to call on logout. It clears the information the
  store keeps for the action features: it removes all `fresh` keys and `throttle` locks, makes
  the `debounce` actions that are waiting finish without running their reducer, stops all
  polling, discards the actions waiting in `sequential` queues, and forgets the `ignoreOld`
  keys. It also stops the actions
  that retry, with `retry` or `unlimitedRetryCheckInternet`: an action waiting to retry is
  aborted right away (with an `AbortDispatchException`, so it doesn't fail or show errors), and
  an action running an attempt is aborted if that attempt fails. The same goes for an
  `OptimisticCommand` with `retry`, which then doesn't roll back or reload. Actions already
  running still finish.

* `store.setShutDown(true)` now calls `clearInternalActionProps()` (before, it only stopped
  polling), so it also stops the retries. Setting it back to `false` doesn't resume them.

* `nonReentrant` actions can now override `nonReentrantKeyParams()`, so that actions of the
  same class but with different parameters can run in parallel, and `computeNonReentrantKey()`,
  so that different action classes share the same key. These keys are shared with
  `OptimisticCommand`.

* New **`statusKey`** on actions, to tell apart the actions of the same class in `isWaiting`,
  `isFailed`, `exceptionFor` and `clearExceptionFor` (on the store, in actions, and in the
  hooks `useIsWaiting`, `useIsFailed`, `useExceptionFor` and `useClearExceptionFor`). Override
  the getter to return a value made from the action's own fields, like `get statusKey() {
  return this.userId; }`, and pass the same value in the new options parameter:
  `useIsWaiting(LoadUser, { statusKey: userId })`. Without the option, the functions consider
  all actions of the type, as before. Arrays and plain objects used as keys are compared by
  content. The key must always return the same value for the same action.

  - The store now keeps, for each failure, only the action type, its `statusKey` and the error,
    instead of the whole action object. Without `statusKey` there is at most one record per
    action class; with it, one per key that failed, replaced when the same key fails again and
    removed when an action with that key is dispatched again.
  - `clearExceptionFor(Type, { statusKey })` clears one key; `clearExceptionFor(Type)` clears
    all keys of the type. New `clearAllExceptions()` (store and action) clears all types.
    `clearInternalActionProps()` now calls it, so `logOut()`, `setShutDown(true)` and
    `dispose()` clear the failures too.
  - New exported type `StatusOptions` (`{ statusKey?: unknown }`).

* New hook `useSuspense(ActionType, { statusKey?, throwErrors? })`, for apps that prefer
  React's `<Suspense>` and error boundaries to `useIsWaiting`/`useIsFailed` checks, like
  TanStack Query's `useSuspenseQuery`. While an action of the type (or of a subclass) is in
  progress, the hook throws a stable promise, so the nearest `<Suspense>` shows its fallback
  until the action finishes. If the action failed (with any error), the hook throws the error
  to the nearest error boundary; pass `throwErrors: false` to not throw it. The failure stays
  recorded, like with `useIsFailed`, until the action is dispatched again or
  `clearExceptionFor` is called. On the server and while hydrating, it never suspends or
  throws. The store creates a promise only when a component suspends, and releases it when
  the action finishes, so apps that don't use the hook pay nothing. New exported type
  `SuspenseOptions`.

  ```tsx
  function UserName({ userId }: { userId: string }) {
    useSuspense(LoadUser, { statusKey: userId });
    const user = useSelect((state: State) => state.users[userId]);
    return <p>{user.name}</p>;
  }
  ```

### Breaking changes

* `isFailed` (and `useIsFailed`) is now `true` when the action failed with **any** error, not
  only with a `UserException`. Before, an action that failed with a plain `Error` was not
  reported as failed, so a component could not show "Loading failed" unless the action turned
  the error into a `UserException` in `wrapError`. `exceptionFor` (and `useExceptionFor`) still
  returns only a `UserException`, or `null` for other errors. Errors swallowed by `wrapError` or
  the `errorObserver`, and `AbortDispatchException`, still don't count as failures.

* `globalWrapError` was removed, and `errorObserver` now does its job too, like the
  `GlobalErrorObserver` of AsyncRedux. It's now called with
  `{ error, originalError, action, store }`, and returns the error to use, instead of a
  boolean: the same one, a different one, or `null` (or nothing) to swallow it. Then, a
  `UserException` is shown to the user and not thrown, and any other error is thrown by
  `dispatch`. It also gets the errors of the `Persistor`, with a `null` action. A persistence
  error that is not a `UserException`, and is not swallowed, is now thrown as an unhandled
  promise rejection. Before, it was only logged. To migrate, an `errorObserver` that returned
  `true` should return the error, one that returned `false` should return `null`, and a
  `globalWrapError` should be moved into the `errorObserver`. Note that returning `null`
  also means a `UserException` is not shown, and the action doesn't count as failed. To keep
  that, return the `UserException`.

* A `nonReentrant` action is no longer aborted while an action of one of its subclasses is
  running. The non-reentrant check now uses the exact action class (or the key, see above).

* Dispatching an action that was already dispatched now always throws a `StoreException`.
  Before, it was silently ignored if the action was then aborted (by `abortDispatch()` or
  `nonReentrant`), mocked, or the store was shut down.

* Dispatching a misconfigured action (for example, an `OptimisticCommand` with `nonReentrant`,
  or an action with an invalid `retry` option) now always throws a `StoreException` (or, with
  `dispatchAndWait`, rejects with it), and the action is not marked as dispatched. Before, it
  was silently aborted if its dispatch would be aborted anyway (by `abortDispatch()`, or
  because an action with the same non-reentrant key was running, or by `throttle` or `fresh`).

* `OptimisticUpdate` was removed. Use `OptimisticCommand` instead: `newValue()` is now
  `optimisticValue()`, `applyState(value, state)` is now `applyValueToState(state, value)`,
  `saveValue()` is now `sendCommandToServer()`, and `reloadValue()` is now
  `reloadFromServer()`. Note the reload now runs only when the command fails (override
  `shouldReload` to change this), and the action is now non-reentrant.

* Dispatching an action before the store is ready (see `store.ready()`) now throws a
  `StoreException`. Before, the action ran, but its state changes could be overwritten when
  the persisted state was loaded. Wait for `store.ready()` before dispatching, and use
  `useIsStoreReady()` in components.

* `store.logOut()` now throws a `StoreException` if called before the store is ready.

* `store.logOut()` now works without a persistor: it waits, and returns the store state to the
  initial-state, like it does with a persistor (before, it did nothing). Also, a persistor
  paused by the app (`pausePersistor`), or a store shut down by the app (`setShutDown`),
  before or during `logOut()`, now stays that way after it. Before, `logOut()` always resumed
  the persistor and restarted the store. A persistor resumed during `logOut()` no longer saves
  the old user's state again.

* `waitCondition` now takes an options object, and `timeoutMillis` is required:
  `waitCondition(condition, { timeoutMillis: 5000 })`. Use `{ timeoutMillis: 0 }` for no
  timeout.

* The default timeout of `waitActionCondition`, `waitAllActions`, `waitActionType`,
  `waitAllActionTypes` and `waitAnyActionTypeFinishes` is now 3 seconds (it was 10 minutes).
  These are mostly meant for tests.

* Inside actions, `waitActionType` and `waitAllActionTypes` now default to
  `completeImmediately: true`, so they resolve right away when no action of that type is
  running, instead of throwing.

* `dispatchAndWait` now rejects with the action's error, for both sync and async actions,
  unless the error is swallowed (a `UserException`, or when `wrapError` or the
  `errorObserver` returns `null`). Before, a sync action threw synchronously, and an async
  action resolved while its error became an unhandled promise rejection.

* `dispatchAndWaitAll` now lets all actions finish, and then rejects with the error of the
  first failed action.

* A wait condition that throws now rejects only that wait. The action whose state change
  triggered the check is not affected.

* `retry` now requires an async reducer. An action with `retry` and a sync reducer fails with
  a `StoreException`.

* A `retry` option set to `undefined` now uses its default, as if it was not set. Before, it
  replaced the default: for example, `retry = {maxRetries: config.maxRetries}` retried forever
  when `config.maxRetries` was `undefined`, and `on: undefined` turned retry off.

* An action whose `before()` or `reduce()` throws `null` or `undefined` (or rejects with no
  reason) now fails with an `Error` that says so. Before, it counted as "completed OK", the
  `stateObserver` got no error, and `throw null` was swallowed, since `wrapError` got `null`.

* The return type of the action's `wrapError` is now `NonNullable<unknown> | null`, so it
  can't return `undefined`. This catches a `wrapError` that forgets to return the error in
  some cases, like `if (e instanceof UserException) return e;`. If `undefined` is returned
  anyway (for example, from JavaScript), the error is swallowed, the same as returning `null`.
  Before, the action failed with `undefined`: `dispatch` threw `undefined`, and
  `dispatchAndWait` rejected with it. A `wrapError` that always throws must now declare its
  return type as `never`, since TypeScript infers it as `void`.

* An error thrown by the `actionObserver` is now ignored (and logged), and the action runs
  and finishes normally. Before, if it threw when the action finished, `dispatchAndWait` of
  an async action never settled, and a sync action's `dispatch` threw the observer's error. If
  it threw when the action started, the action never ran.

* An error thrown by the `stateObserver` is now ignored (and logged), and the action runs
  and finishes normally. Before, the state was changed, but the action failed with the
  observer's error, `wrapError` was skipped, the new state was not persisted, and
  `waitCondition` and `dispatchWhen` didn't see it.

* `logOut({ actionsThrottle: 0 })` (or negative) now doesn't wait for the running actions.
  Before, it waited for them with no time limit, so it never finished while an action was
  stuck, or when called from inside an action that waits for it.

* `logOut()` now discards the actions dispatched before it, so they can't put the previous
  user's data into the state of the next user. When one of them finishes, during or after
  logOut, it's aborted: its result is not applied (and not persisted), and its errors are
  ignored, not shown. Also, the store doesn't accept the actions they dispatch after logOut
  (with `this.dispatch` and the others). For example, an `OptimisticCommand` whose request
  finishes after logOut doesn't apply the server response, or roll back. Before, an action
  still running when `actionsThrottle` ended changed the state after logOut. Note an action
  that calls logOut can't change the state or dispatch actions after it, so call logOut from
  outside of actions if you need that.

* `logOut()` now cancels the `dispatchWhen`s that are still waiting, so their actions are not
  dispatched, and their `onTimeout` is not called. Before, a `dispatchWhen` met by the
  initial-state of logOut was dispatched while logOut applied it, even when the store was
  shut down, so the previous user's action changed (and persisted) the state right after it
  was reset. The same happened to actions dispatched by the `stateObserver` or the
  `actionObserver` at that moment. These are now not accepted.

* `persistAndPausePersistor()` called while `logOut()` is running now waits for logOut to
  finish, and doesn't persist the previous user's state. Before, it saved that state at the
  same time as logOut deleted the persisted state and saved its initial-state, and if that
  save finished last, the previous user's state stayed on disk. Also, two `logOut()`s running
  at the same time no longer save their initial-states at the same time.

* If the state goes back to the last persisted state object (for example, with an undo)
  while a save is running, it's now saved again when that save finishes. Before, the saved
  state was the one before the undo, until the next state change.

* `deleteStateFromPersistence()`, `saveInitialStateInPersistence()` and
  `readStateFromPersistence()` now wait for a running save to finish first. Before, the
  running save could finish later and put the deleted state back, or overwrite the initial
  state. And the read could return the state before that save, while the save then changed
  the last persisted state, so the next save got the wrong `lastPersistedState`. State
  changes made while they run are saved after they finish.

* A `PersistAction` dispatched while a save is running now saves the state as soon as that
  save finishes, ignoring the throttle. Before, it was ignored, and the state waited for the
  throttle.

* An action with `Poll.start` or `Poll.runNowAndRestart` that was still in an async `before()`
  when `clearInternalActionProps()`, `setShutDown(true)` or `logOut()` was called no longer
  starts polling when it reaches its reducer. It's aborted. Before, the previous user's
  polling kept going after the logout.

* When `dispatchSync` throws because the action is async, its async `before()` or `reduce()`
  has already started. Its result is now ignored (it never changes the state), and its errors
  are only logged. It's also not retried anymore: before, an action with `retry` (or an
  `OptimisticCommand` with `retry`) kept calling `reduce()` (or `sendCommandToServer()`) after
  `dispatchSync` threw, and an action with `unlimitedRetryCheckInternet` ran its reducer, and
  without internet kept checking forever.

* When `dispatchSync` throws because the action is async, the `StoreException` is now always
  thrown. Before, it went to the action's `wrapError` and the `errorObserver`, which could
  swallow it (so `dispatchSync` returned silently), or turn it into a `UserException` (so the
  user saw an error dialog, and the action counted as failed). Now they don't see it, and
  `isFailed` and `exceptionFor` stay `null`/`false`. The action still finishes: `after()` runs.

* Inside an action, `this.waitAllActions` and `this.waitAllActionTypes` now need a non-empty
  list, and reject right away with a `StoreException` when the list is empty (or `null`).
  Before, they waited until no actions were in progress, which never happens since the action
  itself is in progress, so they always timed out (the docs had this as an example). They now
  also ignore the action itself (or its own type) if it's in the list. The store's
  `store.waitAllActions([])` and `store.waitAllActionTypes([])` still wait until no actions
  are in progress.

* Inside an action, `this.waitActionType` with the action's own type now rejects right away
  with a `StoreException`. Before, it waited for the action itself to finish, which never
  happens while it waits, so it always timed out. To run actions of the same type one at a
  time, use `sequential = true`.

* `action.getLog` is now a method: use `action.getLog()`.

* The lifecycle methods of the actions are now `protected`, like in AsyncRedux, since only
  Kiss should call them, when the action is dispatched. These are `reduce`, `before`, `after`,
  `wrapError`, `wrapReduce`, `abortDispatch`, `abortReduce`, the `...KeyParams`,
  `compute...Key` and `...LockBuilder` methods, `discardQueueOnError`, `createPollingAction`,
  and the methods that `OptimisticCommand`, `OptimisticSync`, `OptimisticSyncWithPush` and
  `ServerPush` ask you to implement. To run an action, dispatch it, for example with
  `dispatchAndWait`. Your overrides may stay public, or be declared `protected`. Overriding one
  as `private` doesn't compile. The new lint rule `lifecycle-method-call` also reports calling
  them on an action whose override is public.

* The type declarations now need TypeScript 5.0 or later.

### Other

* The hooks that read the store (`useSelect`, `useSelector`, `useObject`, `useAllState`,
  `useIsWaiting`, `useIsFailed`, `useExceptionFor` and `useIsStoreReady`) now use React's
  `useSyncExternalStore`, with the React team's `use-sync-external-store/with-selector` helper
  for the selectors (a new runtime dependency). React reads the store and decides what to
  render: a render that React paused (a transition) is checked against the store before it's
  committed, so a screen never shows parts of two different states. Selectors must be pure,
  and may be called more than once per render. Store updates are rendered with React's
  synchronous priority, even when dispatched inside `startTransition`. The store no longer
  runs the selectors itself, nor keeps the components' render functions. A selector that
  throws is handled by React (an error boundary), and never fails the action. The changes a
  sync action makes are published together when `dispatch` returns, so a `useIsWaiting` of a
  sync action type never renders.

* `StoreProvider` now follows its `store` prop: if it changes, the components below switch to
  the new store. Before, the first store was kept. It also has a new `serverState` prop, for
  server-side rendering and hydration: the state the server HTML was rendered from. On the
  server and while hydrating, the status hooks say no action is waiting or failed, and the
  store is ready. See "Server-side rendering" in the README.

* `store.isWaiting()`, `store.isFailed()` and `store.exceptionFor()` are now pure reads. Before,
  they also registered the action type, so that the store knew which components to rebuild.

* `useStoreEffect` no longer uses a layout effect to keep its latest callbacks, so it doesn't
  warn on the server with React 18 ("useLayoutEffect does nothing on the server"). Its
  behavior is the same.

* `abortDispatch()` can now read `this.state`, `this.store` and `this.initialState`. Before,
  reading them threw an error, which was swallowed, and the action was silently aborted.

* The set of `actions` returned by `waitActionCondition` and `waitAllActions` is now a copy,
  so it no longer changes after the wait resolves, when actions are dispatched or finish.

* The `UserException` builder methods (`withTitle`, `withMessage`, `addProps` etc.) now keep
  the subclass of the exception, and its fields. Before, they returned a plain `UserException`.

* The `ClassPersistor` can now save a plain object with a `constructor` key, like a
  dictionary of word counts where one of the words is "constructor". Before, serializing it
  threw a `TypeError`, so every save failed from then on.

* The `ClassPersistor` now reads back a read-only property holding a `Map`, `Set`, `Date`,
  array or class instance, with its content and fields. Before, a `Map` came back empty, and a
  class instance got extra `type` and `value` fields.

* The `ClassPersistor` can now read a saved field that is a getter-only property in a newer
  version of the app. The saved value is ignored, and the getter is kept. Before, reading threw
  a `TypeError`, and the saved state was deleted. A property with a setter in the class also
  keeps the value the constructor gave it, and its setter is not called.

* The `ClassPersistor` now reads back a `Map` or `Set` filled by its constructor (a subclass,
  or a read-only property) with only the saved entries. Before, the saved entries were added
  to the ones the constructor created, so entries the user deleted came back after a restart.

* The `ClassPersistor` now reads back an `Error` subclass with an empty message with an empty
  message. Before, it came back as `"[object Object]"`, or as the default message of its
  constructor.

* The `ClassPersistor` now reads back an object with no prototype (made with
  `Object.create(null)`) with no prototype. Before, it came back as a plain object, so keys
  like `constructor` were inherited from `Object.prototype`.

* The `ClassPersistor` now runs the constructor of a class with a static `toString()` method
  when reading it back. Before, the constructor was skipped, so its private `#fields` were
  missing, and reading them threw a `TypeError`.

* The `PersistorPrinterDecorator` now prints the states it saves as JSON. Before, it printed
  `[object Object]`, and for a state with no prototype it threw, so the state was never saved.
  When the logger is `null`, it no longer describes the states at all.

* The `ClassPersistor` no longer throws "Class names are being minified" for a class whose name
  starts with a lowercase letter, like `myState`, in a build that is not minified. It still
  throws for a class with no `typeName` whose name looks minified, like `e` or `ab`. Built-in
  classes listed in `classesToSerialize`, like `Date`, are no longer checked, so they can be
  listed when class names are minified.

* `logStateChanges` now logs the changes of a state that is a number, a string, or another
  primitive, and the changes inside `Date`, `Map` and `Set` fields. Before, they were not
  logged. `Store.describeStateChange()` describes them like `State: 0 → 1; ` and
  `State prices[IBM]: 100 → 110; `.

* `waitAnyActionTypeFinishes` now compiles with an `onTimeout` that may be `undefined`, like
  `{ timeoutMillis, onTimeout }` when `onTimeout` is an optional parameter. Its result type is
  then `KissAction | null`. Before, it didn't compile, and when the options were in a variable,
  the result type was wrongly not nullable.

* `store.mocks.remove(actionType)` and `store.mocks.get(actionType)` now accept an action
  whose constructor has parameters, like `store.mocks.remove(AddAction)`. Before, it didn't
  compile. Also, the function returned by `get` now accepts that action type.

* Bug fixes.
