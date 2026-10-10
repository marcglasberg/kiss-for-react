# Bugs found in kiss-for-react

- **Version reviewed:** 2.0.0 (commit `7599cb4`, branch `main`, plus the working tree on 2026-10-09).
- **What was reviewed:**
  - Everything in `src/`, including `src/Esserializer/`.
  - The public types exported from `src/index.ts`.
  - The build: `package.json` exports, `tsconfig.*.json`, `scripts/fix-esm.cjs`, and the ESM and CJS output.
  - The JSDoc and the README, checked against what the code actually does.
  - Not reviewed: the ESLint plugin in `eslint-plugin/`.
- **Checked:**
  - **Reproduced** means the bug was confirmed by running code that asserts the documented behavior and fails. The code is shown, trimmed, under "How to trigger".
  - **Code reading** means the bug was found by reading the code and has no test.
- **How a bug gets fixed:**
  1. Write BDDs that reproduce it in `__tests__/bdd.<Topic>.test.ts` (see `AGENTS.md`), and check that they **fail** because of the bug.
  2. Fix the bug, and check that those BDDs now pass.
  3. The BDDs stay in `__tests__/` for good, as part of the package's test suite, so the bug can't come back.
  4. In this file, mark the bug as fixed, and point "How to trigger" to the new BDDs.
- Line numbers are from the reviewed version, and may have moved.

## Summary

| # | Severity | Area | Bug | Checked | Fixed |
|---|---|---|---|---|---|
| 1 | High | useIsWaiting | The spinner doesn't show when an action that failed is dispatched again. | Reproduced | No |
| 2 | High | Persistence | `persistAndPausePersistor()` freezes the app if `persistDifference` throws synchronously. | Reproduced | No |
| 3 | Medium | Persistence | `ifPersists=false` is ignored while the persistor is paused, so `resumePersistor()` saves that state. | Reproduced | No |
| 4 | Medium | Persistence / startup | Pausing before the store is ready makes the persistor diff against a state that was never saved, and a change is lost. | Reproduced | No |
| 5 | Medium | ESSerializer | A plain object with a `constructor` key can't be serialized, so every save fails from then on. | Reproduced | No |
| 6 | Medium | retry | A `retry` option set to `undefined` replaces its default. `maxRetries: undefined` retries forever. | Reproduced | No |
| 7 | Medium | dispatchSync | `dispatchSync` doesn't throw for an async action when the error is swallowed or converted by `wrapError`/`errorObserver`. | Reproduced | No |
| 8 | Medium | useObject | `useObject` returns a stale value when the selector returns a `Map`, `Set` or `Date`. | Reproduced | No |
| 9 | Medium | useStore | `const { dispatch } = useStore()` crashes when `dispatch` is called. | Reproduced | No |
| 10 | Medium | Wait helpers (docs) | The documented `await this.waitAllActions([])` inside an action always times out. | Reproduced | No |
| 11 | Low | dispatchAndWaitAll | Stops dispatching the rest if one `dispatchAndWait` throws synchronously. | Reproduced | No |
| 12 | Low | ActionStatus | An action that fails with `undefined` is "completed OK", and `throw null` is swallowed. | Reproduced | No |
| 13 | Low | retry / OptimisticCommand | An invalid `retry` option leaves the action half-dispatched: `after()` never runs. | Reproduced | No |
| 14 | Low | retry / dispatchSync | After `dispatchSync` throws, the retry loop keeps calling `reduce()`. | Reproduced | No |
| 15 | Low | nonReentrant | The non-reentrant key is released before `after()`, but only if the state changed. | Reproduced | No |
| 16 | Low | OptimisticCommand | If applying the server response throws, the state is rolled back as if the command failed. | Reproduced | No |
| 17 | Low | OptimisticCommand | A misconfigured command is silently aborted, instead of throwing, when its key is already running. | Reproduced | No |
| 18 | Low | actionObserver | If the `actionObserver` throws when the action finishes, `dispatchAndWait` never settles. | Reproduced | No |
| 19 | Low | logOut | `store.logOut()` does nothing when there is no persistor. | Reproduced | No |
| 20 | Low | logOut | `logOut()` un-pauses a paused persistor, and un-shuts a shut-down store. | Reproduced | No |
| 21 | Low | logOut | If `deleteState` fails, the old user's state stays in the store and is saved again. | Reproduced | No |
| 22 | Low | Persistence | `persistAndPausePersistor()` resolves even when the save failed. | Reproduced | No |
| 23 | Low | Persistence | A failed `saveInitialState` still counts as persisted. | Reproduced | No |
| 24 | Low | ESSerializer | A read-only property holding a class instance or a `Map` is restored wrongly. | Reproduced | No |
| 25 | Low | ESSerializer | A saved field that is now a getter-only property makes reading throw, and the saved state is deleted. | Reproduced | No |
| 26 | Low | useStore | `useStore()` has no `dispatchAll` and no `dispatchAndWaitAll`. | Reproduced | No |
| 27 | Low | useSelect | A selector that returns `NaN` re-renders on every state change. | Reproduced | No |
| 28 | Low | Wait helpers | `UnmodifiableSetView.forEach` hands out the real set, so the store's actions can be deleted. | Reproduced | No |
| 29 | Low | Wait helpers | A timeout larger than about 24.8 days fires after about 1 ms. | Reproduced | No |
| 30 | Low | dispatchWhen | "If the condition is already true, the action is dispatched right away" is not true: it's dispatched in a later microtask. | Reproduced | No |
| 31 | Low | Types | `actionsInProgress()` is typed `Set`, but lacks the ES2025 `Set` methods (`union`, etc.). | Reproduced | No |
| 32 | Low | Types | `store.mocks.remove(ActionType)` doesn't compile if the action's constructor has parameters. | Reproduced | No |

---

## 1. The spinner doesn't show when an action that failed is dispatched again (High)

- **Docs say:** `useIsWaiting` "returns true if an ASYNC action of the specific type is currently being processed" (`src/Hooks.tsx`). README: "To show a spinner while an asynchronous action is running, use `useIsWaiting(ActionType)`."
- **What happens:** action `X` fails, and some component uses `useIsFailed(X)` or `useExceptionFor(X)`. Then `X` is dispatched again (a retry). A component that uses `useIsWaiting(X)`, but not `useIsFailed(X)`, is not re-rendered, and shows `false` for the whole run, even though `store.isWaiting(X)` is `true`. It only works when both hooks are in the same component, as in the README example.
- **Cause:** in `_calculateIsWaitingIsFailed` (`src/Store.tsx:1047`), when the action is failable and was in the failed list, `_rebuildFromStoreHooks()` runs **before** `this._actionsInProgress.add(action)`. So the `isWaiting` selectors see no change. Then `theUIHasAlreadyUpdated = true` skips the second rebuild.
- **How to trigger:**
  ```tsx
  class Load extends KissAction<number> {
    async reduce() {
      await new Promise<void>(r => finish = r);
      if (shouldFail) throw new UserException('fail');
      return (s: number) => s + 1;
    }
  }
  const Spinner = () => <p>{`waiting=${useIsWaiting(Load)}`}</p>;
  const Err = () => <p>{`failed=${useIsFailed(Load)}`}</p>;
  // Render both under StoreProvider (store with showUserException: () => {}).
  await act(async () => { store.dispatch(new Load()); });  // waiting=true
  await act(async () => { finish(); await new Promise(r => setTimeout(r, 0)); });  // failed=true
  shouldFail = false;
  await act(async () => { store.dispatch(new Load()); });
  expect(store.isWaiting(Load)).toBe(true);  // Passes.
  expect(text()).toContain('waiting=true');  // Fails: "waiting=false".
  ```

## 2. `persistAndPausePersistor()` freezes the app if `persistDifference` throws synchronously (High)

- **Docs say:** `persistDifference` "should save the new state ... and return a `Promise`" (`src/Persistor.tsx:70`). `persistAndPausePersistor`: "The returned promise completes when the current state is persisted" (`src/Store.tsx:1915`).
- **What happens:** a `persistDifference` that is not `async`, and throws before returning its promise, leaves `_persisting` set to a promise that never goes back to `null`. The next `persistAndPausePersistor()` then runs `while (this._persisting) await this._persisting.catch(...)` forever. Each pass is only a microtask, so timers and I/O never run again: the whole app freezes. A real persistor that does `return storage.set('k', JSON.stringify(s))` triggers this with a `BigInt` or a cycle in the state.
- **Cause:** `src/ProcessPersistence.ts:355-359`. When `_doPersist` throws synchronously, its `finally` (which sets `_persisting = null`, `:390-394`) runs **before** `_persist` stores the returned promise in `this._persisting`. The loop is at `:446-449`.
- **How to trigger:**
  ```ts
  class JsonPersistor extends Persistor<S> {
    async readState() { return null; }
    async deleteState() {}
    persistDifference(_l: S | null, next: S): Promise<void> { JSON.stringify(next); return Promise.resolve(); }
    get throttle() { return null; }
  }
  class Inc extends KissAction<S> { reduce() { return { n: 10n }; } }
  const store = new Store<S>({ initialState: { n: 0 }, persistor: new JsonPersistor(), logger: null, errorObserver: () => false });
  await store.ready();
  store.dispatch(new Inc());
  await tick(10);
  expect((store as any)._processPersistence._persisting).toBeNull();  // Fails: Promise {}
  await store.persistAndPausePersistor();  // Never returns. Jest's own timeout never fires.
  ```

## 3. `ifPersists=false` is ignored while the persistor is paused (Medium)

- **Docs say:** "if `ifPersists` is false, the persistor will ignore this state change, and won't persist the state change" (`src/KissAction.ts:2363`).
- **What happens:** `pausePersistor()`, then `UpdateStateAction(fn, false)`, then `resumePersistor()` calls `persistDifference` with that state.
- **Cause:** `src/ProcessPersistence.ts:298` returns early when `isPaused`, before the `ifPersists` branch (`:300-307`). So `lastPersistedState` is not updated, and `resume()` (`:462`) sees a difference.
- **How to trigger:**
  ```ts
  await store.ready();
  const n = persistor.calls.length;
  store.pausePersistor();
  store.dispatch(new UpdateStateAction<S>(() => ({ a: 7, b: 7 }), false));
  store.resumePersistor();
  await tick();
  expect(persistor.calls.length).toBe(n);  // Fails: n + 1
  ```

## 4. Pausing before the store is ready makes the persistor diff against a state that was never saved (Medium)

- **Docs say:** `getLastPersistedStateFromPersistor()` returns "the last state that was saved to the local persistence" (`src/Store.tsx:1959`). `persistAndPausePersistor()` may be called while the state is still being read (`src/Store.tsx:1912`).
- **What happens:** this has the same cause as bug 3, but hits the store's own `UpdateStateAction(readState, false)` that applies the state it read (`src/ProcessPersistence.ts:100-104`). If the persistor is paused before the store is ready:
  - `getLastPersistedStateFromPersistor()` returns the `initialState`, not the state read from storage.
  - `resumePersistor()` and `persistAndPausePersistor()` re-save the read state as `persistDifference(initialState, readState)`.
  - A persistor that writes only the changed keys loses data, as shown below.
- **How to trigger:**
  ```ts
  persistor.stored = { a: 5, b: 5 };  // readState is held until open() is called.
  const store = new Store<S>({ initialState: { a: 0, b: 0 }, persistor, ... });
  store.pausePersistor();
  open();
  await store.ready();               // State is {a:5, b:5}.
  store.dispatch(new SetA(0));       // State is {a:0, b:5}.
  store.resumePersistor();
  await tick();
  expect(persistor.stored).toEqual({ a: 0, b: 5 });  // Fails: {a:5, b:5}. The diff is against {a:0, b:0}, so a=0 is never written.
  ```

## 5. ESSerializer: a plain object with a `constructor` key can't be serialized (Medium)

- **Docs say:** the README says it "supports serialization of JavaScript objects" (`README.md:470`).
- **What happens:** `ESSerializer.serialize({ the: 3, constructor: 1 })` throws `TypeError: Function.prototype.toString requires that 'this' be a Function`. With `ClassPersistor`, every save then fails, and state changes are no longer saved. Any dictionary keyed by user text (word counts, tags) can hit this.
- **Cause:** `_getConstructor` (`src/Esserializer/serializer.ts:162-169`) returns `target.constructor` (here, the number `1`) when the prototype's constructor is `Object`. That value reaches `isNativeFunction` (`:87`). It should check `typeof target.constructor === 'function'`.
- **How to trigger:**
  ```ts
  const value = { the: 3, constructor: 1 };
  expect(ESSerializer.deserialize(ESSerializer.serialize(value), [])).toEqual(value);  // Throws TypeError.
  ```

## 6. A `retry` option set to `undefined` replaces its default (Medium)

- **Docs say:** "`maxRetries` is `3`, meaning it will try a total of 4 times" (`src/KissAction.ts:661`). "Options that are not set (`undefined`) use their defaults" (`src/KissAction.ts:1498`). An `OptimisticCommand` with "unlimited retries ... throws a `StoreException`" (`src/KissAction.ts:1962`).
- **What happens:** with `retry = { initialDelay: 1, maxRetries: config.maxRetries }` and `config.maxRetries === undefined`:
  - The reducer is retried forever.
  - `initialDelay: undefined` gives 0 ms delays, `multiplier: undefined` gives `NaN` delays, `maxDelay: undefined` removes the cap, and `on: undefined` turns retry off.
  - On an `OptimisticCommand`, the unlimited-retries check (`maxRetries === -1`) doesn't fire. The command retries forever and never releases its non-reentrant key, so every later dispatch with that key is silently aborted.
- **Cause:** `src/KissAction.ts:1491`, `this._retry = { ...this._retry, on: true, ...this.retry }`. Spreading copies the explicit `undefined` values over the defaults, and validation skips `undefined`. Then `maxRetries >= 0` (`src/Store.tsx:1435`) and `attempts > undefined` (`src/KissAction.ts:2305`) are always false.
- **How to trigger:**
  ```ts
  const config: { maxRetries?: number } = {};
  let count = 0;
  class Load extends KissAction<number> {
    retry = { initialDelay: 1, maxRetries: config.maxRetries };
    async reduce(): Promise<(s: number) => number> { count++; throw new Error('fail'); }
  }
  const store = new Store<number>({ initialState: 0, errorObserver: () => false });
  const action = new Load();
  store.dispatchAndWait(action).catch(() => {});
  await new Promise(r => setTimeout(r, 300));
  expect(count).toBe(4);                         // Fails: 9, and still going.
  expect(action.status.isCompleted).toBe(true);  // Fails.
  ```

## 7. `dispatchSync` doesn't throw for an async action when the error is swallowed or converted (Medium)

- **Docs say:** it "will throw a `StoreException` if the action is ASYNC" (`src/Store.tsx:887`, `src/KissAction.ts:324`), and its only use is "to guarantee (in runtime) that your action is SYNC" (`src/Store.tsx:891`).
- **What happens:** the `StoreException` goes through `wrapError`, `globalWrapError` and `errorObserver`, like a normal action error:
  - With `errorObserver: () => false` (the JSDoc's own "production" example), `dispatchSync` returns silently.
  - With a `wrapError` that converts errors to `UserException` (also a JSDoc example), the user sees that dialog, `isFailed(A)` becomes true, and nothing is thrown.
  - This happens for both an async `reduce()` and an async `before()`.
- **Cause:** the exception is thrown inside `_runFromStart` (`src/Store.tsx:1309-1311` and `1337-1340`), which runs inside `_wraps`, so it goes to `_processWrapsError`. The other developer errors ("already dispatched", "not ready") are thrown outside that pipeline.
- **How to trigger:**
  ```ts
  const store = new Store<St>({ initialState: new St(), logger: null, errorObserver: () => false });
  expect(() => store.dispatchSync(new AsyncInc())).toThrow(StoreException);  // Fails: doesn't throw.
  ```

## 8. `useObject` returns a stale value when the selector returns a `Map`, `Set` or `Date` (Medium)

- **Docs say:** `useObject` "compares the new object with the previous one, value by value … If they have the same values, it returns the previous object" (`src/Hooks.tsx:43-60`). The comment of `_shallowEqual` says it compares "both arrays (or both plain objects)".
- **What happens:** two different `Map`s have the same prototype, and `Object.keys()` is `[]` for both, so they are always "equal". `useObject(s => s.tags)` keeps returning the first `Map`, and the component never re-renders. The same happens with `Set`, `Date`, and class instances whose fields are all `#private`.
- **Cause:** `_shallowEqual` (`src/Hooks.tsx:78-100`) only compares the prototype and the own enumerable keys. It never checks the objects are plain.
- **How to trigger:**
  ```tsx
  class State { constructor(readonly tags: Map<string, number>) {} }
  class SetTag extends KissAction<State> {
    constructor(readonly k: string, readonly v: number) { super(); }
    reduce() { return new State(new Map(this.state.tags).set(this.k, this.v)); }
  }
  const C = () => { seen = useObject((s: State) => s.tags); return null; };
  act(() => store.dispatch(new SetTag('a', 1)));
  expect(store.state.tags.size).toBe(1);
  expect(seen.size).toBe(1);  // Fails: 0 (the old Map).
  ```

## 9. `const { dispatch } = useStore()` crashes when `dispatch` is called (Medium)

- **Docs say:** the project's own ESLint plugin treats `const { dispatch } = useStore()` as a supported pattern (`eslint-plugin/src/components.ts:304,327`), and its demo uses it. All other dispatch hooks return bound functions.
- **What happens:** calling it throws `TypeError: Cannot read properties of undefined (reading 'store')`. This applies to `dispatch`, `dispatchAndWait`, `dispatchSync`, `dispatchWhen` and the `wait*` methods.
- **Cause:** the methods of `StoreDispatchers` (`src/Hooks.tsx:672`) are prototype methods that use `this.store`, and are not bound.
- **How to trigger:**
  ```tsx
  let dispatch!: (a: KissAction<any>) => void;
  const C = () => { ({ dispatch } = useStore()); return null; };
  act(() => { dispatch(new SetTag('a', 1)); });  // TypeError.
  ```

## 10. The documented `await this.waitAllActions([])` inside an action always times out (Medium)

- **Docs say:** the JSDoc of every wait method of the action (`src/KissAction.ts:814, 827, 926, 939, 1052, 1065, 1168, 1181, 1277, 1290, 1393, 1406`) has this example: "Dispatches actions and wait until no actions are in progress. `this.dispatch(new BuyAction('IBM')); this.dispatch(new BuyAction('TSLA')); await this.waitAllActions([]);`".
- **What happens:** the action that calls it is itself in progress, so "no actions in progress" is never true. The wait always rejects with a `TimeoutException`, or never resolves if the timeout is 0.
- **Cause:** `Store.waitAllActions` (`src/Store.tsx:2279-2288`) waits for `actions.size === 0`, and the calling action is in `_actionsInProgress`. Either the example is wrong, or the action's version should ignore the action itself.
- **How to trigger:**
  ```ts
  class Outer extends KissAction<St> {
    async reduce() {
      this.dispatch(new BuyAction('IBM'));
      this.dispatch(new BuyAction('TSLA'));
      await this.waitAllActions([], { timeoutMillis: 300 });
      return null;
    }
  }
  const status = await store.dispatchAndWait(new Outer());
  expect(status.originalError).toBe(null);  // Fails: TimeoutException.
  ```

## 11. `dispatchAndWaitAll` stops dispatching the rest if one dispatch throws synchronously (Low)

- **Docs say:** "all actions are still dispatched and allowed to finish. Only then the Promise rejects, with the error of the first failed action" (`src/Store.tsx:838-840`).
- **What happens:** if one `dispatchAndWait` throws synchronously (the action was already dispatched, the store is not ready, or a mock throws), the later actions are never dispatched. The promises of the earlier actions are not awaited either, so their errors become unhandled rejections.
- **Cause:** no `try/catch` around `this.dispatchAndWait(action)` in `src/Store.tsx:850-852`.
- **How to trigger:**
  ```ts
  const used = new Inc();
  store.dispatch(used);
  const later = new AsyncInc();
  await store.dispatchAndWaitAll([new AsyncFail(), used, later]).catch(() => {});
  expect(later.status.isDispatched).toBe(true);  // Fails. And AsyncFail's error is an unhandled rejection.
  ```

## 12. An action that fails with `undefined` is "completed OK", and `throw null` is swallowed (Low)

- **Docs say:** `isCompletedOk` is "true only if the action has completed, and none of the 'before' or 'reduce' methods have thrown an error" (`src/KissAction.ts:1674`). The `stateObserver`'s `error` is null only if there was no error (`src/Store.tsx:181`).
- **What happens:**
  - A reducer that rejects with no reason (`await Promise.reject()`, which some promise wrappers do): `dispatchAndWait` rejects, but `isCompletedOk` is `true`, `isCompletedFailed` is `false`, and the `stateObserver` gets `error = undefined`.
  - `throw null`: `wrapError(null)` returns `null`, which means "disable the error", so the failure is swallowed and the status is OK.
- **Cause:** the `ActionStatus` constructor and `copy` use `??` (`src/KissAction.ts:1719, 1736`), so a `null` or `undefined` `originalError` can't be stored. Then `src/Store.tsx:1166` treats `null` as "disabled".
- **How to trigger:**
  ```ts
  class A extends KissAction<St> {
    async reduce() { await Promise.reject(); return (s: St) => s; }
  }
  const a = new A();
  await store.dispatchAndWait(a).catch(() => {});  // Rejects.
  expect(a.status.isCompletedOk).toBe(false);      // Fails: true.
  ```

## 13. An invalid `retry` option leaves the action half-dispatched (Low)

- **Docs say:** `after()` "will always be called when the action is dispatched" (`src/KissAction.ts:145`). The `actionObserver` is "called whenever actions are dispatched, and also when they finish" (`src/Store.tsx:143`).
- **What happens:** with an invalid `retry` (for example `maxRetries: -5`), or a misconfigured `OptimisticCommand`, `status.isDispatched` is `true`, but `after()` never runs, `isCompleted` never becomes `true`, and neither `actionObserver` call happens. The dispatch does throw (or reject) the `StoreException`, as documented. Nothing leaks: the action never enters the in-progress set.
- **Cause:** `src/Store.tsx:1028` sets `isDispatched`, and then `_injectStore` (`:1031`) throws, in `_validateRetry` (`src/KissAction.ts:1489`) or the `OptimisticCommand` override (`:2314-2325`). This is outside `_wraps`.
- **How to trigger:**
  ```ts
  class Bad extends KissAction<St> {
    retry = { maxRetries: -5 };
    async reduce() { return (s: St) => s; }
    after() { calls.push('after'); }
  }
  const bad = new Bad();
  await store.dispatchAndWait(bad).catch(() => {});
  expect(calls).toEqual(['after']);  // Fails: [].
  ```

## 14. After `dispatchSync` throws, the retry loop keeps calling `reduce()` (Low)

- **Docs say:** when `dispatchSync` throws for an async action, "the async method has already started, and any side effects it has will still happen. Its result is ignored" (`src/Store.tsx:896-899`).
- **What happens:** for an action with `retry` whose async reducer fails, `dispatchSync` throws and `after()` runs. But the retry loop is still running, so `reduce()` is called again after each delay: 3 more server calls for an action that already completed.
- **Cause:** `src/Store.tsx:1338-1341` only attaches a `.catch` to the discarded promise. The retry loop (`:1437-1439`) doesn't know it was discarded.
- **How to trigger:**
  ```ts
  let count = 0;
  class A extends KissAction<number> {
    retry = { initialDelay: 1, maxRetries: 3 };
    async reduce(): Promise<(s: number) => number> { count++; throw new Error('fail'); }
  }
  try { store.dispatchSync(new A()); } catch {}
  await new Promise(r => setTimeout(r, 100));
  expect(count).toBe(1);  // Fails: 4.
  ```

## 15. The non-reentrant key is released before `after()`, but only if the state changed (Low)

- **Docs say:** "The key is released when the action finishes, with or without errors" (`src/KissAction.ts:567`), and `isCompleted` means `after()` already ran (`src/KissAction.ts:1666`).
- **What happens:** inside `after()`:
  - If the reducer changed the state, `isWaiting(Self)` is `false`, and dispatching the same non-reentrant action runs it.
  - If the reducer returned `null` or failed, `isWaiting(Self)` is `true`, and the same dispatch is silently aborted.

  So a polling action that re-dispatches itself in `after()` works or not, depending on whether the poll changed the state.
- **Cause:** `_registerState` deletes the action from `_actionsInProgress` (`src/Store.tsx:1622`) before `_processWrapsFinally` calls `after()` (`:1231`). The unchanged and error paths delete it only after `after()` (`:1243`).
- **How to trigger:**
  ```ts
  class NR extends KissAction<number> {
    nonReentrant = true;
    constructor(readonly n: number) { super(); }
    async reduce() { log.push('reduce ' + this.n); await flush(); return (s: number) => s + 1; }
    after() { if (this.n === 1) this.dispatch(new NR(2)); }
  }
  await store.dispatchAndWait(new NR(1));
  await flush(5);
  expect(log).not.toContain('reduce 2');  // Fails. With `return null` in reduce, it passes.
  ```

## 16. `OptimisticCommand`: if applying the server response throws, the state is rolled back (Low)

- **Docs say:** `rollbackState` and `shouldRollback` are "called only when `sendCommandToServer` throws" (`src/KissAction.ts:2057, 2092`).
- **What happens:** `sendCommandToServer` succeeds, and then `applyServerResponseToState` (or `getValueFromState`) throws. `shouldRollback` and `rollbackState` run, and the state goes back to the old value, even though the server saved the new one.
- **Cause:** the `try` that catches the command's errors also wraps applying the server response (`src/KissAction.ts:2211-2245`).
- **How to trigger:**
  ```ts
  class Save extends OptimisticCommand<State, string> {
    optimisticValue() { return 'new'; }
    getValueFromState(s: State) { return s.value; }
    applyValueToState(s: State, v: string) { return new State(v); }
    async sendCommandToServer() { return 'resp'; }
    applyServerResponseToState(): State | null { throw new Error('bad apply'); }
    shouldRollback(p: any) { log.push('shouldRollback'); return super.shouldRollback(p); }
  }
  await store.dispatchAndWait(new Save()).catch(() => {});
  expect(log).not.toContain('shouldRollback');  // Fails. And the state is 'old'.
  ```

## 17. A misconfigured `OptimisticCommand` is silently aborted, instead of throwing (Low)

- **Docs say:** dispatching an `OptimisticCommand` with `nonReentrant`, or with unlimited retries, "throws a `StoreException`" (`src/KissAction.ts:574, 1962`).
- **What happens:** if another command with the same key is running, the misconfigured command is silently aborted, and nothing is thrown. So the developer error only shows up sometimes.
- **Cause:** the check is in `OptimisticCommand._injectStore` (`src/KissAction.ts:2317-2325`), which runs after `_mustAbortDispatch` (`src/Store.tsx:754, 800, 922`) has already aborted the dispatch because of the shared key.
- **How to trigger:**
  ```ts
  store.dispatch(new Save2());  // OptimisticCommand with key 'k', still running.
  expect(() => store.dispatch(new SaveNR())).toThrow(StoreException);  // nonReentrant = true, key 'k'. Fails: doesn't throw.
  ```

## 18. If the `actionObserver` throws when the action finishes, `dispatchAndWait` never settles (Low)

- **What happens:** `after()` has run and the action has left the in-progress set, but the promise of `dispatchAndWait` stays pending forever. The library guards the other user callbacks (`after`, `showUserException`, wait conditions, selectors, the persistence `errorObserver`), but not this one.
- **Cause:** `src/Store.tsx:1252` calls the observer with no `try/catch`, before `action._resolvePromise(failure)` at `:1256`.
- **How to trigger:**
  ```ts
  const store = new Store<St>({
    initialState: new St(), logger: null,
    actionObserver: (_a, _c, ini) => { if (!ini) throw new Error('obs'); },
  });
  let settled = false;
  store.dispatchAndWait(new AsyncInc()).finally(() => { settled = true; }).catch(() => {});
  await new Promise(r => setTimeout(r, 200));
  expect(settled).toBe(true);  // Fails.
  ```

## 19. `store.logOut()` does nothing when there is no persistor (Low)

- **Docs say:** it deletes "the persisted state, and return[s] the store state to the given initial-state" (`src/Store.tsx:1859`).
- **What happens:** without a persistor, it resolves right away, and the state is not reset.
- **Cause:** `src/Store.tsx:1890`, `return this._processPersistence?.logOut(...)`.
- **How to trigger:**
  ```ts
  store.dispatch(new Inc());
  await store.logOut({ initialState: new St(100), throttle: 0, actionsThrottle: 0 });
  expect(store.state.n).toBe(100);  // Fails: 1.
  ```

## 20. `logOut()` un-pauses a paused persistor, and un-shuts a shut-down store (Low)

- **Docs say:** after `pausePersistor`, the persistor "will not start a new persistence process, until method resumePersistor is called" (`src/Store.tsx:1898`).
- **What happens:** after `logOut()`, the persistor is running again, even if the app had paused it. Also, a store the app had shut down before `logOut()` accepts dispatches again.
- **Cause:** the `finally` of `logOut` always calls `this.resume()` (`src/ProcessPersistence.ts:279`) and `store.setShutDown(false)` (`:275`), instead of restoring what was there before.
- **How to trigger:**
  ```ts
  store.pausePersistor();
  await store.logOut({ initialState, throttle: 0, actionsThrottle: 0 });
  const n = persistor.calls.length;
  store.dispatch(new SetA(5));
  await tick();
  expect(persistor.calls.length).toBe(n);  // Fails: n + 1.
  ```

## 21. If `deleteState` fails, `logOut` leaves the old user's state, and saves it again (Low)

- **Docs say:** `logOut` deletes the persisted state "and return[s] the store state to the given initial-state" (`src/Store.tsx:1859`).
- **What happens:** `logOut` rejects, the store keeps the old user's state, and the persistor saves that state again.
- **Cause:** `deleteState()` throws at `src/ProcessPersistence.ts:258`, so the reset at `:264` never runs. `lastPersistedState` was already set to `null` (`:182`), so `resume()` in the `finally` sees a difference and saves.
- **How to trigger:**
  ```ts
  // Saved state is {a: 7}. persistor.failDelete = true.
  await expect(store.logOut({ initialState: { a: 0 }, throttle: 0, actionsThrottle: 0 })).rejects.toThrow('del');
  await tick();
  expect(store.state).toEqual({ a: 0 });  // Fails: {a: 7}.
  expect(persistor.stored).toBeNull();    // Fails: {a: 7}.
  ```

## 22. `persistAndPausePersistor()` resolves even when the save failed (Low)

- **Docs say:** "The returned promise completes when the current state is persisted" (`src/Store.tsx:1915`, `src/ProcessPersistence.ts:427`).
- **What happens:** the save fails, the error goes only to the `errorObserver`, and the promise resolves. The caller (for example, an app going to the background) can't tell that the save failed.
- **Cause:** `_doPersist` catches and reports the error, and never rethrows (`src/ProcessPersistence.ts:377-388`). `persistAndPause` returns that promise (`:453`).
- **How to trigger:**
  ```ts
  persistor.fail = true;
  store.dispatch(new SetA(1));
  await tick();
  await expect(store.persistAndPausePersistor()).rejects.toBeDefined();  // Fails: resolves.
  ```

## 23. A failed `saveInitialState` still counts as persisted (Low)

- **Docs say:** `getLastPersistedStateFromPersistor` returns "the last state that was saved" (`src/Store.tsx:1959`). For `persistDifference`, a failed save "will NOT be considered persisted" (`src/Persistor.tsx:84`).
- **What happens:**
  - At startup, `readState` returns `null` and `saveInitialState` throws, but `lastPersistedState` stays as the `initialState`. It's set in the constructor (`src/Store.tsx:646`), and the failure path (`src/ProcessPersistence.ts:85-90`) doesn't clear it.
  - `saveInitialStateInPersistence(x)` sets `lastPersistedState = x` before awaiting the save (`src/ProcessPersistence.ts:157`), so it stays `x` if the save fails.

  A persistor that writes only the changes then diffs against a state that was never saved.
- **How to trigger:**
  ```ts
  persistor.failInitial = true;  // readState returns null.
  await store.ready();
  expect(store.getLastPersistedStateFromPersistor()).toBeNull();  // Fails: {a: 0}.
  ```

## 24. ESSerializer: a read-only property holding a class instance or a `Map` is restored wrongly (Low)

- **What happens:** under a property with `writable: false`:
  - A class instance comes back with extra fields `type` (and `value`), taken from the metadata.
  - A `Map` comes back empty, with fields `type: '@Map'` and `value: [...]` instead of its entries.
- **Cause:** `_copyWritableFields` (`src/Esserializer/deserializer.ts:422-431`) loops over all keys, including `*type` and `*value`, unescapes them to `type` and `value`, and never decodes built-ins.
- **How to trigger:**
  ```ts
  class Holder {
    constructor() { Object.defineProperty(this, 'm', { value: new Map(), writable: false, enumerable: true }); }
  }
  const h = new Holder();
  (h as any).m.set('k', 1);
  const out = ESSerializer.deserialize(ESSerializer.serialize(h), [Holder]);
  expect(out.m.get('k')).toBe(1);  // Fails: undefined.
  ```

## 25. ESSerializer: a saved field that is now a getter-only property makes reading throw (Low)

- **What happens:** if a class field became a getter in a later version of the app, `readState` throws "Cannot set property total of #<Cart> which has only a getter". Kiss then **deletes the saved state** (`src/ProcessPersistence.ts:70-79`).
- **Cause:** `_copyDeserializedValues` (`src/Esserializer/deserializer.ts:403-414`) checks for setters and read-only properties with `getOwnPropertyDescriptor`, which only sees the object's own properties, not the prototype's. Its comment says "Properties with a setter ... keep the value the constructor gave them".
- **How to trigger:**
  ```ts
  class Cart {
    items: number[] = [];
    get total() { return this.items.length; }
  }
  expect(() => ESSerializer.deserialize('{"*type":"Cart","items":[1,2,3],"total":3}', [Cart])).not.toThrow();  // Fails.
  ```

## 26. `useStore()` has no `dispatchAll` and no `dispatchAndWaitAll` (Low)

- **Docs say:** the `useStore` JSDoc says "You can get the store to use all dispatch and wait methods" (`src/Hooks.tsx:122`). The ESLint plugin's `DISPATCH_METHODS` (`eslint-plugin/src/storeUsage.ts:18`) includes both.
- **What happens:** `useStore().dispatchAll` and `useStore().dispatchAndWaitAll` are `undefined`.
- **Cause:** `StoreDispatchers` (`src/Hooks.tsx:672`) doesn't have them.
- **How to trigger:**
  ```tsx
  const C = () => { kind = typeof useStore().dispatchAll; return null; };
  expect(kind).toBe('function');  // Fails: 'undefined'.
  ```

## 27. A `useSelect` selector that returns `NaN` re-renders on every state change (Low)

- **Docs say:** "The component will rebuild only when the `name` changes, ignoring the change in other parts of the state" (`src/Hooks.tsx:14`).
- **What happens:** since `NaN !== NaN`, the component re-renders on every state change. `useObject` and the `useDispatch` deps use `Object.is`, so they don't have this problem.
- **Cause:** `newSelectedValue !== currentValue` in `src/Store.tsx:330, 364` and `src/Hooks.tsx:625`. It should use `Object.is`.
- **How to trigger:**
  ```tsx
  // State is new State(NaN, 0). The component uses useSelect(s => s.a) and counts its renders.
  act(() => store.dispatch(new IncB()));
  act(() => store.dispatch(new IncB()));
  expect(renders).toBe(1);  // Fails: 3.
  ```

## 28. `UnmodifiableSetView.forEach` hands out the real set (Low)

- **Docs say:** "Your condition function should NOT try and modify the set of actions it got in the `actionsInProgress` parameter. If you do, Kiss will throw an error" (`src/Store.tsx:2090`). `UnmodifiableSetView` "prevents that set from being changed through the view" (`src/UnmodifiableSetView.ts:3`).
- **What happens:** `forEach((x, _, set) => set.delete(x))` gets the store's own `_actionsInProgress`, and deletes from it with no error. The running action disappears from `isWaiting`. When it finishes, the wait conditions are not checked for it, so waits on it hang until they time out.
- **Cause:** `src/UnmodifiableSetView.ts:23-25` calls `this._set.forEach(callbackfn, thisArg)` directly. It should wrap the callback, and pass the view as the third argument.
- **How to trigger:**
  ```ts
  store.dispatch(new Slow());  // Async action, 30 ms.
  store.actionsInProgress().forEach((x, _y, set) => set.delete(x));  // Doesn't throw.
  expect(store.isWaiting(Slow)).toBe(true);  // Fails: false.
  ```

## 29. A timeout larger than about 24.8 days fires after about 1 ms (Low)

- **Docs say:** the wait rejects (or `dispatchWhen` doesn't dispatch) only "if the condition is not met in `timeoutMillis` milliseconds".
- **What happens:** for a timeout above `2^31 - 1` ms, Node prints a `TimeoutOverflowWarning` and fires after 1 ms, so the wait rejects with a `TimeoutException` almost at once. `Infinity` and `Number.MAX_SAFE_INTEGER` behave the same. A `dispatchWhen` with a "30 days" timeout silently drops its action.
- **Cause:** the raw `setTimeout(..., timeoutMillis)` at `src/Store.tsx:2064` and `2185`. The value is not clamped, and `Infinity` is not treated as "no timeout".
- **How to trigger:**
  ```ts
  const p = store.waitCondition(s => s.n === 1, { timeoutMillis: 30 * 24 * 3600 * 1000 });
  let err: unknown = null;
  p.catch(e => { err = e; });
  await new Promise(r => setTimeout(r, 50));
  expect(err).toBe(null);  // Fails: TimeoutException.
  ```

## 30. `dispatchWhen` doesn't dispatch "right away" when the condition is already true (Low)

- **Docs say:** "If the condition is already true, the action is dispatched right away" (`src/Store.tsx:2577`).
- **What happens:** the action is dispatched in a later microtask. Right after `dispatchWhen(...)` returns, the state has not changed. In the meantime (also when the condition becomes true later), another synchronous dispatch can make the condition false again, and the action is still dispatched.
- **Cause:** `dispatchWhen` is built on the async `waitCondition`, and dispatches in `.then()` (`src/Store.tsx:2622-2624`). It needs a synchronous check of the condition first, and a synchronous callback when it becomes true. If the delay is intended, the docs should say so instead.
- **How to trigger:**
  ```ts
  store.dispatchWhen(new SetN(5), s => s.n === 0, { timeoutMillis: 0 });  // SetN is sync.
  expect(store.state.n).toBe(5);  // Fails: 0.
  ```

## 31. `actionsInProgress()` is typed `Set`, but lacks the ES2025 `Set` methods (Low)

- **What happens:** the return type is `Set<KissAction<St>>`. With `lib: ESNext` (or `ES2025`), TypeScript shows `.union`, `.intersection`, `.difference`, etc., and the code compiles. At runtime (Node 22+), it throws `TypeError: set.union is not a function`. The same applies to the `actions` set given to and returned by the wait helpers.
- **Cause:** `UnmodifiableSetView implements Set<T>` (`src/UnmodifiableSetView.ts:8`) is compiled against an older `lib`, so it doesn't implement them.
- **How to trigger:**
  ```ts
  expect(() => (store.actionsInProgress() as any).union(new Set())).not.toThrow();  // Fails on Node 24.
  ```

## 32. `store.mocks.remove(ActionType)` doesn't compile if the action's constructor has parameters (Low)

- **Docs say:** `remove(actionType)` is documented next to mocking `AddAction(value)` (`src/Store.tsx:561-563, 583-584`).
- **What happens:** `store.mocks.remove(AddAction)`, where `AddAction` has `constructor(readonly value: number)`, fails with TS2345: "'new (value: number) => AddAction' is not assignable to 'new () => KissAction<St>'". The same type is used by `get`.
- **Cause:** `src/Store.tsx:2663` and `:2671` use `new () => KissAction<St>`, while `add` correctly uses `new (...args: any[]) => T`.
- **How to trigger:** compile `store.mocks.remove(AddAction)` with `tsc --strict`.

---

### Plausible, not confirmed

- Overriding `before()` without calling `super.before()` silently disables `checkInternet`. The `before()` JSDoc mentions it, but the `checkInternet` JSDoc, the README and the `OptimisticCommand` docs don't say you must call `super.before()`. This is a docs gap rather than a bug.
- `ActionStatus`: when the function returned by an async `reduce` throws, or `abortReduce` throws, both `hasFinishedMethodReduce` and `isCompletedFailed` are `true`. This is arguable: `reduce()` itself returned, and what threw was the function it returned.
- When an async reducer resolves to a function, and that function throws when the store applies it, `retry` doesn't retry. The docs only say "retry the `reduce` method when it throws".
- `useIsFailed` may stay stale if the error happens after the state was applied (for example, a `stateObserver` that throws inside `_registerState`). The action is no longer in progress, so `_processWrapsFinally` doesn't rebuild.
- `StoreProvider` ignores a new `store` prop (`useState(store)`, `src/Store.tsx:2644`), for example after Fast Refresh or in tests. It's not documented either way.
- No `useSyncExternalStore`: under concurrent rendering, sibling components can briefly show different states (tearing), until the layout effect re-checks.
- React 19 `<Activity mode="hidden">`: hiding and showing it again may call `useDispatch`'s `onUnmount` and `onMount` again, while the docs say they run once.
- `deleteStateFromPersistence` and `saveInitialStateInPersistence` don't wait for a save that's in progress, which can finish later and overwrite the storage or `lastPersistedState`.
- A class that calls `Object.freeze(this)` in its constructor comes back from `ESSerializer` with the constructor's default values. This is intentional (there's a test for it), but the user docs don't warn about it.
- If a condition function itself dispatches or calls a wait, a wait it registers while `_registerState` or `_checkAllActionConditions` rebuilds the condition list (`src/Store.tsx:1287, 1631`) could be lost.
- `describeStateChange` overflows the stack on a state with cycles. Inside `_registerState` that's caught, but a direct call throws.
- If `dispatchSync` gets an action with `retry` and a sync reducer, the error message says "'reduce' method returned a Promise", which is misleading.
- `CHANGELOG.md:38-39` says that with `onTimeout` "the wait resolves with `null`". In fact `waitActionCondition` and `waitAllActions` resolve with `{actions, triggerAction: null}`, and `waitAllActionTypes` with `void`. The JSDoc is correct.
- The `PersistAction` docs say it is "ignored" while a save is in progress. In fact the state is saved later, respecting the throttle. No harm.
- The shipped `.d.ts.map` files point to `src/`, which is not published.

### Checked and found OK

- **Dispatch:** sync and async `dispatch`/`dispatchAndWait`, errors rejecting or being swallowed as documented, `abortDispatch`, mocks (including mocked as `null`), the "already dispatched" and "not ready" checks, shutdown, and the user exception queue (order, `showUserException` throwing, `noDialog`).
- **Status and waiting:** `isWaiting` (including subclasses), `isFailed`, `exceptionFor`, `clearExceptionFor`, and no in-progress leaks on any error path tried.
- **Retry:** attempt counts, the delay sequence and its cap, `unlimitedRetries`, `{on: false}`, and a custom `wrapReduce` called on each attempt.
- **nonReentrant and OptimisticCommand:** keys compared by content, subclasses not blocked, keys shared and held across retries, rollback only when the value is still the optimistic one, and no optimistic value applied without internet.
- **Wait helpers:** conditions and timers are removed on success, on timeout and when the condition throws. `onTimeout`, the default timeout, `completeImmediately`, the returned `actions` snapshot and `triggerAction`, and resuming only after `after()` ran.
- **Hooks:** under `React.StrictMode`, `useDispatch`'s `onMount`/`onDepsChange`/`onUnmount` run once, `useSelect`/`useObject` update and unsubscribe after unmount, and `useIsStoreReady` works with a slow persistor. Stable hook functions, a changing selector, and a selector that throws in a zombie child are all fine.
- **UserException:** the builders keep the subclass and its fields, don't change the original, and chain callbacks in order.
- **Persistence:** the throttle is respected and the final state is always saved, saves never overlap, the newest state is saved after a slow save, and after a failed save the next diff uses the last state really saved. `ready()` never rejects.
- **ESSerializer:** round-trips of `Date`, `Map` (with `NaN`, `undefined`, `BigInt` and object keys), `Set`, typed arrays (including partial views and `NaN`/`-0`/`Infinity`), `undefined`, `Error`s and their subclasses, subclasses of `Map`/`Set`/`Date`/`Array`, inherited user classes, `String` objects, and `Intl` formatters. Prototype pollution through `__proto__` and `constructor.prototype` is blocked, only registered classes are constructed, and circular references throw a clear error.
- **Build:** `npm run build` works. ESM `import()` and CJS `require()` both load and export the same names. The `.d.ts` files compile with `skipLibCheck: false` under `node16`, `nodenext`, `bundler` and `node10`, on TS 5.0 and TS 6.0. Everything the README and JSDoc tell users to import is exported.
