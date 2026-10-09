# Bugs found in kiss-for-react

- **Version reviewed:** 1.1.0 (commit `91155be`, branch `main`).
- **What was reviewed:**
  - Everything in `src/`.
  - The public types exported from `src/index.ts`.
  - The build: `package.json` exports, `tsconfig.*.json`, `scripts/fix-esm.cjs`, and the ESM and CJS output.
  - The JSDoc, checked against what the code actually does.
- **Checked:**
  - **Reproduced** means the bug was confirmed by running code that asserts the documented behavior and fails.
  - **Code reading** means the bug was found by reading the code and has no test.
- **How a bug gets fixed:**
  1. Write BDDs that reproduce it in `__tests__/bdd.<Topic>.test.ts` (see `AGENTS.md`), and check that they **fail** because of the bug.
  2. Fix the bug, and check that those BDDs now pass.
  3. The BDDs stay in `__tests__/` for good, as part of the package's test suite, so the bug can't come back.
  4. In this file, mark the bug as fixed, and point "How to trigger" to the new BDDs.
- **Has BDD tests:** whether the existing `__tests__/bdd.*.test.ts` already cover the behavior.

## Summary

| # | Severity | Area | Bug | Docs say | Checked | Has BDD tests | Fixed |
|---|---|---|---|---|---|---|---|
| 1 | Medium | Persistence / startup | A change made before the store is ready, followed by an `UpdateStateAction(ifPersists=false)`, is never saved. | `ifPersists=false`: "the persistor will ignore **this** state change" | Reproduced | Yes | Yes |
| 2 | Medium | nonReentrant | A `nonReentrant` action is silently aborted while a *subclass* of it is running. | Aborts "in case the action is still running from a previous dispatch" | Reproduced | Yes | Yes |
| 3 | Medium | dispatch | Re-dispatching the same running `nonReentrant` action object is silently ignored, instead of throwing. | "Dispatching an action that was already dispatched (running or finished) … throws a `StoreException`" | Reproduced | Yes | Yes |
| 4 | Low | Wait helpers | The `actions` set returned by `waitActionCondition`/`waitAllActions` keeps changing after the wait resolves. | "You get back the set of the actions being dispatched that met the condition" | Reproduced | Yes | Yes |
| 5 | Low | UserException | `withTitle`, `withMessage`, `addProps`, etc. return a plain `UserException`, losing the subclass. | (Not stated; breaks `instanceof` on subclasses) | Reproduced | Yes | Yes |
| 6 | Medium | abortDispatch | `abortDispatch()` can't read `this.state`, `this.store` or `this.initialState` on the first dispatch, and the action is silently aborted. | "If method `abortDispatch()` returns true, the action will not be dispatched" | Reproduced | Yes | Yes |

## 1. A change made before the store is ready is lost after `ifPersists=false` (Medium) — FIXED

- **What happens:** `readState` returns null and `saveInitialState` is still running. A normal action changes the state, then an `UpdateStateAction(..., false)` runs. When loading ends, nothing more is saved, so the first change is lost.
- **Cause:** in `ProcessPersistence.process()`, the early return for `!this.isReady` doesn't record that a save is pending. Then the `ifPersists=false` branch sees no pending work and sets `lastPersistedState = newestState`.
- **How it was fixed:** dispatching any action before the store is ready is now a developer error, and throws a `StoreException` (`dispatch`, `dispatchSync` and `dispatchAndWait`). The only dispatch allowed is the store's own, applying the state it read. So no state change can happen before the store is ready, and this bug can't happen.
- **How to trigger:** see `__tests__/bdd.Persistor.test.ts`, scenario "Dispatching an action while the persisted state is being read throws, and changes nothing."

## 2. `nonReentrant` is aborted by a running subclass (Medium) — FIXED

- **Cause:** `_mustAbortDispatch` (`src/Store.tsx`) used `this.isWaiting(action.constructor)`, which matches with `instanceof`. As a side effect, it also added the type to `_awaitableActions`.
- **How it was fixed:** `nonReentrant` now follows the API of AsyncRedux's `NonReentrant` mixin. The check is based on a non-reentrant key, which by default is the exact action class plus `nonReentrantKeyParams()`, and can be changed with `computeNonReentrantKey()`. These keys are shared with `OptimisticCommand`. The check no longer calls `isWaiting`.
- **How to trigger:** see `__tests__/bdd.NonReentrant.test.ts`, scenario "A non-reentrant action is not aborted by a running action of a subclass."

## 3. Re-dispatching a running `nonReentrant` action object doesn't throw (Medium) — FIXED

- **Cause:** `dispatch`, `dispatchAndWait` and `dispatchSync` called `_mustAbortDispatch` before the `status.isDispatched` check.
- **How it was fixed:** the "already dispatched" check is now the first check of `dispatch`, `dispatchAndWait` and `dispatchSync`, before the store-ready and shut-down checks, the mock, and `abortDispatch`/`nonReentrant`. If the action is mocked, the mock is also checked, right after mocking. So re-dispatching an action always throws, even if it would now be aborted, or the store is shut down.
- **How to trigger:** see `__tests__/bdd.DispatchTwice.test.ts`, scenarios "Dispatching a non-reentrant action that is still running throws.", "... even if it would now abort its dispatch.", "... even if the store is shut down." and "... even if it is now mocked."

## 4. `waitActionCondition` returns a live view of the actions (Low) — FIXED

- **Cause:** it resolved with `this.actionsInProgress()`, an `UnmodifiableSetView` over the live set (in `_checkAllActionConditions`, the `completeImmediately` path and the timeout path). The set was empty once the actions finished.
- **How it was fixed:** all three paths now resolve with a copy, made by the new private `_actionsInProgressSnapshot()` (`src/Store.tsx`). The condition itself still gets the live view, since it runs right away. The JSDoc of `waitActionCondition` now says the returned set is a copy.
- **How to trigger:** see `__tests__/bdd.WaitActionsSnapshot.test.ts`. Its scenarios cover `waitActionCondition` resolving on a dispatch, completing immediately and timing out, and `waitAllActions`.

## 5. `UserException.with*` methods drop the subclass (Low) — FIXED

- **Cause:** the private `copy()` in `src/UserException.ts` did `new UserException(...)`.
- **How it was fixed:** `copy()` now creates an object with the same prototype as the exception (`Object.create(Object.getPrototypeOf(this))`), copies all its own properties (including the fields of the subclass), and then applies the changes. It doesn't call `this.constructor`, since a subclass constructor may take different parameters. The copy gets its own stack trace, as before. The builder methods now return `this`, so TypeScript also knows that the subclass is kept.
- **How to trigger:** see `__tests__/bdd.UserExceptionBuilders.test.ts`, scenarios "Builder methods keep the subclass of the exception." and "Builder methods work on a subclass whose constructor takes different parameters."

## 6. `abortDispatch()` can't read the state (Medium) — FIXED

- **Cause:** the store calls `abortDispatch()` (in `_mustAbortDispatch`, `src/Store.tsx`) before `_injectStore`, which is what sets the store in the action. So inside `abortDispatch()`, `this.state` and `this.store` throw `Store not set in action`, and `this.initialState` is not set. The error is logged and swallowed, and the dispatch is aborted.
- **How it was fixed:** `_mustAbortDispatch` now calls `action._setStore(this)`, which sets the store and the initial state, before calling `abortDispatch()`. This is what AsyncRedux does with `setStore`. It runs after the "already dispatched" checks, so it never changes the store of an action that is already running.
- **How to trigger:** see `__tests__/bdd.AbortDispatch.test.ts`, scenarios "The action can use the state to decide if it aborts its dispatch." and "Inside abortDispatch, the action can read its store and its initial state."

### Plausible, not confirmed

- `dispatchAndWaitAll` stops dispatching the rest if one `dispatchAndWait` throws synchronously. The docs say "all actions are still dispatched".
- An invalid `retry` option throws in `_injectStore` after `isDispatched` is set and the observer was called, so `after()` and the final observer call never run.
- `persistAndPause()` resolves even when the save failed.
- `ifPersists=false` while paused: the next `resume()` saves that state anyway.
- Overriding `before()` without calling `super.before()` silently disables `checkInternet`.

### Checked and found OK

- **Build:** `npm run build` works. The ESM output loads with `import()` and the CJS output loads with `require()`.
- **StrictMode:** running effects twice is safe.
- **Dispatch hooks:** the functions they return keep the same identity for a given store.
- **`useIsFailed`/`useExceptionFor`:** they behave as their JSDoc says.
- **SSR:** neither the README nor the JSDoc claims SSR support, so it was not assessed.
