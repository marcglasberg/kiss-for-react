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

* `nonReentrant` actions can now override `nonReentrantKeyParams()`, so that actions of the
  same class but with different parameters can run in parallel, and `computeNonReentrantKey()`,
  so that different action classes share the same key. These keys are shared with
  `OptimisticCommand`.

### Breaking changes

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

* `abortDispatch()` can now read `this.state`, `this.store` and `this.initialState`. Before,
  reading them threw an error, which was swallowed, and the action was silently aborted.

* The set of `actions` returned by `waitActionCondition` and `waitAllActions` is now a copy,
  so it no longer changes after the wait resolves, when actions are dispatched or finish.

* The `UserException` builder methods (`withTitle`, `withMessage`, `addProps` etc.) now keep
  the subclass of the exception, and its fields. Before, they returned a plain `UserException`.

* Bug fixes.
