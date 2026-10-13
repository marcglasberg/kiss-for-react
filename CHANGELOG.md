# Changelog

## 2.0.0

### New features

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
  the newer information. `isOld` tells if a newer action was dispatched. An action waiting to
  retry stops retrying when it becomes old. Actions of the same class share the key, or
  override `ignoreOldKeyParams()` to separate them by some fields, or `computeIgnoreOldKey()`
  so that different classes share it. It can be combined with `debounce`, `throttle`, `fresh`,
  `retry` and `checkInternet`, but not with `nonReentrant`, `sequential` or
  `unlimitedRetryCheckInternet`, nor used in an `OptimisticCommand`, `OptimisticSync`,
  `OptimisticSyncWithPush` or `ServerPush`.

* New `abortSignal` action getter, an `AbortSignal` that is aborted when an `ignoreOld` action
  becomes old. Pass it to `fetch` (or any API that accepts a signal) to cancel the requests of
  old actions. The `AbortError` that `fetch` then throws is ignored, like any error of an old
  action. For actions without `ignoreOld`, it's never aborted.

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
