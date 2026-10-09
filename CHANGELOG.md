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

### Breaking changes

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
  unless the error is swallowed (a `UserException` with no `errorObserver`, or when the
  `errorObserver` returns `false`). Before, a sync action threw synchronously, and an async
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

* Bug fixes.
