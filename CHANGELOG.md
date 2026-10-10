# Changelog

## 2.0.0

### New features

* `useDispatch` now accepts the optional `onMount`, `onUnmount`, and `onDepsChange` with its
  `deps`, to dispatch actions when the component mounts, when some values change, and when it
  unmounts. They get the store, run only after the store is ready, and run once even in
  React's `StrictMode`:

  ```tsx
  const dispatch = useDispatch({
    deps: userId,
    onMount: (store) => store.dispatch(new LoadUser(userId)),
    onDepsChange: (store, oldUserId) => {
      store.dispatch(new StopListening(oldUserId));
      store.dispatch(new LoadUser(userId));
    },
    onUnmount: (store) => store.dispatch(new CleanResources()),
  });
  ```

* New hook `useObject()`, to select an object (or array) with some parts of the state. The
  component re-renders only when one of its values changes:
  `useObject((state: State) => ({ name: state.name, age: state.age }))`.

* New hook `useIsStoreReady()`: returns `false` while the store is loading the persisted
  state, and `true` after. Use it to show a loading state, and to disable the buttons that
  dispatch actions, while the store is not ready.

* New `dispatchWhen`, which dispatches an action when a state condition becomes true.
  Available as the `useDispatchWhen()` hook, as `store.dispatchWhen()`, and as
  `this.dispatchWhen()` inside actions.

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
  requests of this device. The device ID is `OptimisticSyncWithPush.deviceId()`, which you can
  change. `ServerPush` can't be combined with any other feature.

* New `debounce` action property. With `debounce = 300` (milliseconds), or `debounce = true`
  for the default 333 milliseconds, the action waits until it stops being dispatched for that
  long, and only the last action runs its reducer. Actions of the same class debounce each
  other, or override `debounceLockBuilder()` to choose the lock. `removeAllDebounceLocks()`
  removes all locks. It can't be combined with `retry`, nor used in an `OptimisticCommand`.

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
  synchronously). The `after` method still runs, but the exception is not passed to
  `wrapError` or the `errorObserver`, the action doesn't count as failed
  for `isFailed`, it's not retried, and `dispatchAndWait` resolves instead of rejecting.

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
  polling, and discards the actions waiting in `sequential` queues. It also stops the actions
  that retry, with `retry` or `unlimitedRetryCheckInternet`: an action waiting to retry is
  aborted right away (with an `AbortDispatchException`, so it doesn't fail or show errors), and
  an action running an attempt is aborted if that attempt fails. Actions already running still
  finish.

* `store.setShutDown(true)` now calls `clearInternalActionProps()` (before, it only stopped
  polling), so it also stops the retries. Setting it back to `false` doesn't resume them.

* `nonReentrant` actions can now override `nonReentrantKeyParams()`, so that actions of the
  same class but with different parameters can run in parallel, and `computeNonReentrantKey()`,
  so that different action classes share the same key. These keys are shared with
  `OptimisticCommand`.

### Breaking changes

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

* When `dispatchSync` throws because the action is async, its async `before()` or `reduce()`
  has already started. Its result is now ignored (it never changes the state), and its errors
  are only logged.

* `action.getLog` is now a method: use `action.getLog()`.

* The type declarations now need TypeScript 5.0 or later.

### Other

* `abortDispatch()` can now read `this.state`, `this.store` and `this.initialState`. Before,
  reading them threw an error, which was swallowed, and the action was silently aborted.

* The set of `actions` returned by `waitActionCondition` and `waitAllActions` is now a copy,
  so it no longer changes after the wait resolves, when actions are dispatched or finish.

* The `UserException` builder methods (`withTitle`, `withMessage`, `addProps` etc.) now keep
  the subclass of the exception, and its fields. Before, they returned a plain `UserException`.

* Bug fixes.
