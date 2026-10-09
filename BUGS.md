# Bugs found in kiss-for-react

- **Version reviewed:** 1.1.0 (commit `91155be`, branch `main`).
- **What was reviewed:**
  - Everything in `src/`.
  - The public types exported from `src/index.ts`.
  - The build: `package.json` exports, `tsconfig.*.json`, `scripts/fix-esm.cjs`, and the ESM and CJS output.
  - The JSDoc, checked against what the code actually does.
- **Checked:**
  - **Reproduced** means a small test in `bug-repros/` asserts the documented behavior and fails on the current code.
  - **Code reading** means the bug was found by reading the code and has no test.
  - Each repro is written as a BDD. They sit outside `__tests__/` so that the normal `npx jest` run still passes. To run them:
    `npx jest --testRegex "bug-repros/.*\.repro\.tsx?$"`.
- **How a bug gets fixed:**
  1. Turn the repro into BDDs in `__tests__/bdd.<Topic>.test.ts` (see `AGENTS.md`), and check that they **fail** because of the bug.
  2. Fix the bug, and check that those BDDs now pass.
  3. The BDDs stay in `__tests__/` for good, as part of the package's test suite, so the bug can't come back.
  4. Delete the repro from `bug-repros/`, and in this file mark the bug as fixed, and point "How to trigger" to the new BDDs.
- **Has BDD tests:** whether the existing `__tests__/bdd.*.test.ts` already cover the behavior.

## Summary

| # | Severity | Area | Bug | Docs say | Checked | Has BDD tests | Fixed |
|---|---|---|---|---|---|---|---|
| 1 | Medium | Persistence / startup | A change made before the store is ready, followed by an `UpdateStateAction(ifPersists=false)`, is never saved. | `ifPersists=false`: "the persistor will ignore **this** state change" | Reproduced | Yes | Yes |
| 2 | Medium | nonReentrant | A `nonReentrant` action is silently aborted while a *subclass* of it is running. | Aborts "in case the action is still running from a previous dispatch" | Reproduced | No | No |
| 3 | Medium | dispatch | Re-dispatching the same running `nonReentrant` action object is silently ignored, instead of throwing. | "Dispatching an action that was already dispatched (running or finished) … throws a `StoreException`" | Reproduced | No | No |
| 4 | Low | Wait helpers | The `actions` set returned by `waitActionCondition`/`waitAllActions` keeps changing after the wait resolves. | "You get back the set of the actions being dispatched that met the condition" | Reproduced | No | No |
| 5 | Low | UserException | `withTitle`, `withMessage`, `addProps`, etc. return a plain `UserException`, losing the subclass. | (Not stated; breaks `instanceof` on subclasses) | Reproduced | No | No |

## 1. A change made before the store is ready is lost after `ifPersists=false` (Medium) — FIXED

- **What happens:** `readState` returns null and `saveInitialState` is still running. A normal action changes the state, then an `UpdateStateAction(..., false)` runs. When loading ends, nothing more is saved, so the first change is lost.
- **Cause:** in `ProcessPersistence.process()`, the early return for `!this.isReady` doesn't record that a save is pending. Then the `ifPersists=false` branch sees no pending work and sets `lastPersistedState = newestState`.
- **How it was fixed:** dispatching any action before the store is ready is now a developer error, and throws a `StoreException` (`dispatch`, `dispatchSync` and `dispatchAndWait`). The only dispatch allowed is the store's own, applying the state it read. So no state change can happen before the store is ready, and this bug can't happen.
- **How to trigger:** see `__tests__/bdd.Persistor.test.ts`, scenario "Dispatching an action while the persisted state is being read throws, and changes nothing."

## 2. `nonReentrant` is aborted by a running subclass (Medium)

- **Cause:** `_mustAbortDispatch` (`src/Store.tsx`) uses `this.isWaiting(action.constructor)`, which matches with `instanceof`. As a side effect, it also adds the type to `_awaitableActions`.
- **How to trigger:** `class Base { nonReentrant = true; async reduce }`, `class Sub extends Base {}`. If you dispatch `Sub` and then `Base` concurrently, `Base` is dropped.
- **Fix:** compare `a.constructor === action.constructor` over the actions in progress.

## 3. Re-dispatching a running `nonReentrant` action object doesn't throw (Medium)

- **Cause:** `dispatch`, `dispatchAndWait` and `dispatchSync` call `_mustAbortDispatch` before the `status.isDispatched` check.
- **How to trigger:** `const a = new SlowNonReentrant(); store.dispatch(a); store.dispatch(a);`. The second call doesn't throw.
- **Fix:** check `isDispatched` first.

## 4. `waitActionCondition` returns a live view of the actions (Low)

- **Cause:** it resolves with `this.actionsInProgress()`, an `UnmodifiableSetView` over the live set (`_checkAllActionConditions` and the timeout path). The set is empty once the actions finish.
- **Fix:** resolve with a snapshot: `new UnmodifiableSetView(new Set(this._actionsInProgress))`.

## 5. `UserException.with*` methods drop the subclass (Low)

- **Cause:** the private `copy()` in `src/UserException.ts` does `new UserException(...)`.
- **How to trigger:** `class MyEx extends UserException {}`, then `new MyEx('x').withTitle('t') instanceof MyEx` is `false`.
- **Fix:** construct from `this.constructor`, or document that subclasses must override `copy`.

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
