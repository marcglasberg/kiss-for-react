# Bugs found in kiss-for-react

- **Version reviewed:** 2.0.0 (commit `5f50b1b`, branch `main`, on 2026-10-11). The 32 bugs of the previous review (commit `7599cb4`) are all fixed, and were removed from this file.
- **What was reviewed:**
  - Everything in `src/`, including `src/Esserializer/`.
  - The public types exported from `src/index.ts`.
  - The JSDoc, the README and the CHANGELOG, checked against what the code actually does.
  - The docs website in `kissforreact.org` (`react/**/*.md`, the homepage in `src/components/HomepageFeatures/overview-react.mdx`, and the AI docs file `kiss-state-management-docs.md`), checked against the code.
  - Not reviewed: the ESLint plugin in `eslint-plugin/`.
- **Checked:**
  - **Reproduced** means the bug was confirmed by running code that asserts the documented behavior and fails, or, for types and docs examples, by compiling the code and getting the error shown. The code is shown, trimmed, under "How to trigger".
  - **Code reading** means the bug was found by reading the code and has no test.
- **How a bug gets fixed:**
  1. Write BDDs that reproduce it in `__tests__/bdd.<Topic>.test.ts` (see `AGENTS.md`), and check that they **fail** because of the bug.
  2. Fix the bug, and check that those BDDs now pass.
  3. The BDDs stay in `__tests__/` for good, as part of the package's test suite, so the bug can't come back.
  4. In this file, mark the bug as fixed, and point "How to trigger" to the new BDDs.
  - Docs bugs (25 to 47) are fixed in the docs, and need no BDD, unless the fix is to change the code instead.
- Line numbers are from the reviewed version, and may have moved. Docs paths starting with `react/` or `src/components/` are in the `kissforreact.org` repo.

## Summary

| # | Severity | Area | Bug | Checked | Fixed |
|---|---|---|---|---|---|
| 1 | Medium | Persistence / logOut | `persistAndPausePersistor()` during `logOut()` saves the old user's state, and it can stay on disk. | Reproduced | Yes |
| 2 | Medium | Persistence | Going back to the last saved state object while a save is running leaves the wrong state on disk. | Reproduced | Yes |
| 3 | Medium | useDispatch | `onUnmount` runs after the `onMount` of a component mounted in the same commit (unlike `useEffect`). | Reproduced | Yes |
| 4 | Medium | debounce | `debounce` with `nonReentrant`, `throttle` or `fresh` runs the first dispatch, not the last. | Reproduced | No |
| 5 | Medium | Polling | `clearInternalActionProps()`, `setShutDown(true)` and `logOut()` don't stop polling whose controller was still in an async `before()`. | Reproduced | Yes |
| 6 | Medium | ServerPush | A push ignored by `applyServerPushToState` (returns `null`) still blocks the follow-up of a newer local change. | Reproduced | No |
| 7 | Medium | OptimisticCommand | A `sequential` command that fails rolls back past earlier commands that succeeded. | Reproduced | No |
| 8 | Medium | OptimisticSyncWithPush | A push older than the request in flight overwrites a newer local change. | Reproduced | No |
| 9 | Medium | dispatchWhen / logOut | A `dispatchWhen` action is dispatched in the middle of `logOut()`, even when the store is shut down. | Reproduced | Yes |
| 10 | Low | stateObserver | A `stateObserver` that throws leaves the store inconsistent: the state is not persisted, and waits and `dispatchWhen` miss it. | Reproduced | Yes |
| 11 | Low | logOut | `logOut({ actionsThrottle: 0 })` waits forever for running actions, instead of at most 0 ms. | Reproduced | Yes |
| 12 | Low | wrapError | A `wrapError` that returns `undefined` makes the action fail with `undefined`. | Reproduced | Yes |
| 13 | Low | Persistence | `deleteStateFromPersistence()` during a slow save: the save finishes later and puts the deleted state back. | Reproduced | Yes |
| 14 | Low | dispatchWhen | Two `dispatchWhen` met by the same state change: the 2nd is dispatched although the 1st made its condition false. | Reproduced | No |
| 15 | Low | Logging | `logStateChanges` doesn't log changes of a primitive state, or of a `Date`/`Map`/`Set` field. | Reproduced | No |
| 16 | Low | Types | `waitAnyActionTypeFinishes` doesn't compile with an optional `onTimeout`. | Reproduced | No |
| 17 | Low | ServerPush | A push with a non-finite `serverRevision` is accepted, and breaks stale-push protection for its key. | Reproduced | No |
| 18 | Low | isWaiting | `isWaiting(Self)` is `true` inside a SYNC reducer, but the JSDoc says it "always returns `false` when the action is SYNC". | Reproduced | No |
| 19 | Low | ESSerializer | Reading back a `Map`/`Set` filled by its constructor keeps the constructor's entries, so deleted entries come back. | Reproduced | Yes |
| 20 | Low | ESSerializer | An `Error` subclass with an empty message comes back with message `"[object Object]"`. | Reproduced | Yes |
| 21 | Low | ESSerializer | A null-prototype object (`Object.create(null)`) comes back with `Object.prototype`. | Reproduced | Yes |
| 22 | Low | ESSerializer | A class with a static `toString()` is restored without running its constructor (private fields are missing). | Reproduced | Yes |
| 23 | Low | PersistorPrinterDecorator | Every save fails when the state has no prototype. It also prints `[object Object]`. | Reproduced | Yes |
| 24 | Low | ClassPersistor | The "minified class names" check fires for a class named in lowercase in development, and for a listed `Date`. | Reproduced | Yes |
| 25 | High | Docs | The error docs describe the removed `globalWrapError` and the old boolean `errorObserver`. | Reproduced | Yes |
| 26 | High | Docs / README | README and homepage call `this.dispatchAndWaitAll(...)` inside an action, which doesn't exist. | Reproduced | Yes |
| 27 | Medium | Docs | `persistor.md` says persistence errors never crash the app, and describes the old boolean `errorObserver`. | Reproduced | Yes |
| 28 | Medium | Docs | The AI docs file `kiss-state-management-docs.md` is out of date (no `ignoreOld`), and the ai-usage page describes it wrongly. | Reproduced | Yes |
| 29 | Medium | Docs | The `SellAction` example in `wait-fail-succeed.md` always fails. | Reproduced | Yes |
| 30 | Medium | Docs | `isFailed`/`useIsFailed` are documented as true after any failure, but they only count `UserException`s. | Reproduced | Yes |
| 31 | Medium | Docs | `dispatching-actions.md` calls `status.isCompletedOk()`, which is a getter. | Reproduced | Yes |
| 32 | Medium | Docs | `debugging-the-app.md` calls `useStore().actionsInProgress()`, which doesn't exist. | Reproduced | Yes |
| 33 | Medium | Docs | `testing-user-exceptions.md`: the `userExceptionsQueue` example can't pass, and "`isCompletedFailed` equals `!isCompletedOk`" is false. | Reproduced | Yes |
| 34 | Medium | Docs (homepage) | The homepage examples don't compile, or contradict themselves. | Reproduced | Yes |
| 35 | Medium | Docs | The TanStack comparison is out of date with 2.0.0. | Code reading | Yes |
| 36 | Low | Docs | `wait-for-condition.md`: changing the actions set doesn't throw any more, and the `waitActionType` example doesn't compile. | Reproduced | Yes |
| 37 | Low | Docs | `testing-the-app.md` describes `store.record` wrongly. | Reproduced | Yes |
| 38 | Low | Docs | `mocking-actions.md`: the mock-recording loop doesn't compile. | Reproduced | Yes |
| 39 | Low | Docs | `action-status.md` examples don't compile. | Reproduced | Yes |
| 40 | Low | Docs | Syntax errors in `tutorial/async-actions.md` and `changing-state-is-optional.md`. | Reproduced | Yes |
| 41 | Low | Docs | `optimistic-features.md` overrides don't compile under `strict`. | Reproduced | Yes |
| 42 | Low | Docs | `business-logic.md` is cut off. | Code reading | Yes |
| 43 | Low | Docs (tutorial) | The tutorial uses Dart syntax, a wrong class name, and says a dialog pops up by default. | Code reading | Yes |
| 44 | Low | Docs | The MUI `showUserException` example never calls `next()` when there's no container, so the queue gets stuck. | Code reading | Yes |
| 45 | Low | Docs / JSDoc | The NetInfo link points to the wrong package. | Code reading | Yes |
| 46 | Low | README | The README quotes the wrong "no internet" dialog text. | Reproduced | Yes |
| 47 | Low | JSDoc | Stale or wrong JSDoc: `wrapError`, `exceptionFor(...).errorText`, `ClassPersistor.readState`. | Reproduced | Yes |

---

# Code bugs

## 1. `persistAndPausePersistor()` during `logOut()` saves the old user's state, and it can stay on disk (Medium)

- **Docs say:** the `logOut` JSDoc (`src/Store.tsx:~2796`): "While logOut is running, ... the persistor doesn't persist anything but the initial-state."
- **What happens:** the app calls `persistAndPausePersistor()` while `logOut` waits for its `throttle` (for example, the app goes to the background right after the user taps logout). It calls `persistDifference` with the old user's state: `_startLogOut` cancelled the throttle timer, so there's always an unsaved change. That save overlaps logOut's delete and its save of the initial-state. If the old save finishes last, `logOut` resolves with no error, but the storage and `lastPersistedState` hold the old user's state. With equal delays the result is right, but `{n:7}` is still saved during logOut.
- **Cause:** `ProcessPersistence.persistAndPause` (`src/ProcessPersistence.ts:496-512`) doesn't check `_logOutsRunning`. `Store._logOut` waits for a running save only once, before the throttle wait (`src/Store.tsx:2865`). `_persistLogOutState` (`src/ProcessPersistence.ts:289`) calls `_persist` without waiting for `isPersisting`.
- **Fixed:** `ProcessPersistence.persistAndPause` now waits while a `logOut` is running (`_waitForLogOut`, resolved by `_endLogOut`), and only then checks if the state needs to be saved. Since logOut saves its initial-state, the old user's state is never saved. The persistor stays paused after logOut, as usual. Also, `_deleteLogOutState` and `_persistLogOutState` now wait for a running save first, so two `logOut`s running at the same time don't save their initial-states at the same time. The JSDoc of `persistAndPausePersistor` says so.
- **How to trigger:** see the BDDs in `__tests__/bdd.LogOutPersistAndPause.test.ts`. Before the fix, 3 of them failed: `persistDifference` was called with the old user's `{n: 7}` during logOut (with a slow and with a fast save), and with two concurrent logOuts, the slow save of the 1st one finished last, so the storage had `{n: 1}` while the state was `{n: 2}`.

## 2. Going back to the last saved state object while a save is running leaves the wrong state on disk (Medium)

- **Docs say:** `react/miscellaneous/undo-and-redo.md` recommends `dispatch(new UpdateStateAction(() => stateHistory[41]))`, which goes back to an earlier state object.
- **What happens:** state `A` is saved. Then `B` is being saved, and meanwhile the state goes back to the same `A` object. `process()` returns early because `lastPersistedState === A`, so it doesn't set `isANewStateAvailable`. Then `B`'s save finishes and sets `lastPersistedState = B`. The store shows `A`, but `B` stays on disk until the next state change. If the app is killed before that, the undo is lost on restart.
- **Cause:** `src/ProcessPersistence.ts:324` (`if (this.lastPersistedState === newState) return false;`) runs before the `isPersisting` check at `:346`. Then `:423` records `B` as persisted.
- **Fixed:** while a persistence operation is running, `process()` now remembers to check again when it finishes (`isANewStateAvailable`), before it compares the new state with `lastPersistedState`. When the save finishes, the newest state is compared with the state just saved, so `A` is saved again. This is not done for an `UpdateStateAction` with `ifPersists` false, which is still not saved. The same was fixed in AsyncRedux.
- **How to trigger:** see the BDDs in `__tests__/bdd.PersistenceProcess.test.ts`, which cover the whole persistence process. Before the fix, these 3 failed: going back to the last persisted state while a save is running (with and without a throttle), and an undo to a saved state while a save is running. The others check the cases that already worked, like going back and then changing again, a save that fails, a paused persistor, and a change that should not be persisted.

## 3. `useDispatch`: `onUnmount` runs after the `onMount` of a component mounted in the same commit (Medium)

- **Docs say:** `src/Hooks.tsx:302-303` (and `react/basics/hooks-to-dispatch-actions.md:106-107`): "you can still dispatch actions from a `useEffect`, as usual, if you prefer. These options are just more convenient". So users expect the `useEffect` order: the old cleanup first, then the new mount.
- **What happens:** when one component unmounts and another mounts in the same commit (a route switch, or `<UserProfile key={userId}>`), the order is: new `onMount`, then old `onUnmount`. So the old page's cleanup (for example, clearing the selection) overwrites what the new page's `onMount` just set. Same with and without StrictMode. The plain `useEffect` version works. Also, `onUnmount` doesn't run inside a synchronous `act(() => renderer.unmount())`, only in an async `act`.
- **Cause:** `src/Hooks.tsx:375-383`. The cleanup delays `onUnmount` by a microtask, so that StrictMode's fake unmount can cancel it. But React runs all unmount cleanups and then all mount effects in one synchronous flush, so the new `onMount` (`:365`) runs before the delayed `onUnmount`.
- **Fixed:** `onUnmount` is now delayed by a microtask only when the unmount happens in the same synchronous flush as the mount, which is when StrictMode's fake unmount happens. Any other unmount is real, so `onUnmount` runs right away, like a `useEffect` cleanup: before the `onMount` of a component mounted in the same commit, and inside a synchronous `act`. A component that really mounts and unmounts in the same flush still gets its `onUnmount` a microtask later. The `useDispatch` JSDoc and the CHANGELOG now say `onUnmount` runs before the `onMount` of a component mounted in the same render.
- **How to trigger:** see the BDDs in `__tests__/bdd.UseDispatchUnmountOrder.test.ts`. Before the fix, 6 of the 7 failed, with and without StrictMode: replacing a component by one with another key, and replacing a page by another page, logged `["mount A", "mount B", "unmount A"]` and left the selection `null`, and after a synchronous `act(() => renderer.unmount())` the log had no `unmount A`. The last one checks that, in StrictMode, a component mounted next to another one still calls `onMount` and `onUnmount` once.

## 4. `debounce` with `nonReentrant`, `throttle` or `fresh` runs the first dispatch, not the last (Medium)

- **Docs say:** `react/advanced-actions/control-features.md:453-456`: "Each new dispatch resets the wait time ... Only the last action runs its reducer, after the wait time." Lines 515-517: "It can be combined with nonReentrant, throttle, fresh, ignoreOld and checkInternet." The matrix in `action-features.md:190` marks these combinations ✅ with no caveat.
- **What happens:** the first action takes the non-reentrant key (or the throttle lock, or the fresh key) and starts its debounce wait. Every later dispatch during the wait is aborted before it can reset the wait. So the first action runs its reducer, and debounce becomes a fixed delay. For a search box, the results are for the first letter typed.
- **Cause:** `Store._mustAbortDispatch` (`src/Store.tsx:1237-1253`) checks nonReentrant, throttle and fresh when the action is dispatched, but the debounce wait only starts later, in `_debounceWrapReduce` (`src/Store.tsx:2044`). For `fresh`, it doesn't happen if `freshKeyParams` includes the search text.
- **How to trigger:** with `debounce = 30` plus `nonReentrant = true` (or `throttle`, or `fresh`), dispatch `Search('a')`, `Search('ab')`, `Search('abc')`: the reducer runs for `'a'`, and the `isDispatchAborted` of the three statuses are `[false, true, true]`. Expected: the reducer runs for `'abc'`.

## 5. Clearing, shutting down or logging out doesn't stop polling whose controller was in an async `before()` (Medium)

- **Docs say:** `src/KissAction.ts:2097-2100`: "Polling also stops when you call `store.clearInternalActionProps()`, or when the store is shut down with `store.setShutDown(true)`, and is not restarted if you later turn the shutdown off." `clearInternalActionProps` "Stops all polling" (`src/Store.tsx:574`), "so that the actions of the previous user stop, and don't affect the next user" (`action-features.md`).
- **What happens:** a `Poll.start` (or `Poll.runNowAndRestart`) action that is still in an async `before()` when the props are cleared later reaches `reduce`, finds no polling cycle, and starts a new one. The previous user's polling then keeps going after `logOut`. After `setShutDown(true)`, it ticks (and is blocked) during the shutdown, and then for real once the shutdown is turned off. Any base action with an async `before()` triggers this.
- **Cause:** `_reducePolling` / `_runNowAndStartPollingCycle` (`src/Store.tsx:2123-2164`) don't check `_wereInternalActionPropsCleared(action)`, as retry does with `_clearCountAtDispatch`.
- **Fixed:** `_reducePolling` now checks `_wereInternalActionPropsCleared(action)`, as retry does. A `Poll.start` or `Poll.runNowAndRestart` action dispatched before the props were cleared (by `clearInternalActionProps()`, `setShutDown(true)` or `logOut()`) doesn't start polling when it reaches its reducer, and is aborted. `Poll.stop` and `Poll.once` are not affected. The polling JSDoc in `KissAction` says so.
- **How to trigger:** see the BDDs in `__tests__/bdd.PollingStoppedDuringBefore.test.ts`. Before the fix, all 6 combinations of `Poll.start`/`Poll.runNowAndRestart` with `clearInternalActionProps()`/`setShutDown(true)` then `false`/`logOut()` failed: the polling started, and ticked 5 or 6 times in 150 ms.

## 6. `ServerPush`: an ignored push still blocks the follow-up of a newer local change (Medium)

- **Docs say:** `src/KissAction.ts:5535-5540`: "If the most recent state change was due to a user interaction ... `sendValueToServer` will be called again ... If the most recent state change was due to a server push, no follow-up request is needed." For `applyServerPushToState` (`:6023-6024`, `optimistic-features.md:834-835`): "Return `null` to ignore the push. Its server revision is still recorded". Nothing says the ignored push counts as a state change.
- **What happens:** when `applyServerPushToState` returns `null`, the state doesn't change, but the push is recorded with `isPush: true`. So a local change made after the request was sent is never sent. The UI keeps the user's value, the server keeps the other value, and they never converge.
- **Cause:** `src/KissAction.ts:6065-6069` always records `isPush: true`, even when `newState === null`. The follow-up check at `:5764` then skips the follow-up.
- **How to trigger:**
  ```ts
  store.dispatch(new ToggleLike(true));   // local revision 1, request 1 in flight
  store.dispatch(new ToggleLike(false));  // local revision 2, state false
  store.dispatch(new PushIgnored(true, {serverRevision: 20, localRevision: 3, deviceId: otherDevice})); // returns null
  requests[0].d.resolve({ rev: 11 }); await flush();
  expect(requests.length).toBe(2);   // FAILS: 1 (only `true` was ever sent)
  ```

## 7. A `sequential` `OptimisticCommand` that fails rolls back past earlier commands that succeeded (Medium)

- **Docs say:** `OptimisticCommand` "can be combined with `sequential`", and the optimistic value is applied "when the action gets its turn". The rollback restores "the value it had when the action was dispatched" (`optimistic-features.md:163-165`), and "we don't undo newer changes".
- **What happens:** `initialState` is taken when the action is dispatched, before it waits in the queue. So a queued command that fails rolls back to the value before the earlier commands, undoing one the server already accepted. Also, if the earlier command failed and rolled back, the later one rolls back to the earlier one's optimistic value, which was never saved.
- **Cause:** `initialState` is set in `_setStore` (`src/KissAction.ts:3416`) at dispatch time. The rollback uses `getValueFromState(this.initialState)` (`:4393`). The queued turn starts later (`src/Store.tsx:1442`). A command with `checkInternet` has the same issue, during the async internet check.
- **How to trigger:**
  ```ts
  // SetName: sequential, nonReentrantKeyParams() returns the name. The initial name is 'initial'.
  store.dispatch(new SetName('a')); store.dispatch(new SetName('b')); await flush();
  ds.a.resolve(null); await flush();             // 'a' is saved on the server
  ds.b.reject(new Error('fail')); await flush();
  expect(store.state.name).toBe('a');            // FAILS: "initial"
  ```

## 8. `OptimisticSyncWithPush`: a push older than the request in flight overwrites a newer local change (Medium)

- **Docs say:** `src/KissAction.ts:5881-5882`: `ServerPush` makes sure "local optimistic updates are not overwritten by stale pushes". The class also promises eventual consistency.
- **What happens:** another device's push arrives while our request is in flight. Its revision (10) is newer than any revision known, so it's applied and overwrites the local value, although it's older than our request (11). Then `informServerRevision(11)` turns `isPush` off (`:5641-5646`), so the follow-up sends the pushed value read from the state (`:5768`), and the user's last tap is lost. In a variant with one tap and a `null` server response, the echo of our own request (rev 11) is then rejected as stale (`:6045`), and the UI shows the wrong value forever.
- **Cause:** a push can only be judged stale against revisions already known (`:6045`, `:6061`). A push older than the request in flight is applied, and its value is then sent or kept. This may be a limitation of the design (the library can't know the push is stale when it arrives, AsyncRedux may share it), but it contradicts the JSDoc.
- **How to trigger:**
  ```ts
  // initial liked = false, server revision 5
  store.dispatch(new ToggleLike(true));  // local revision 1, request 1
  store.dispatch(new ToggleLike(false)); // local revision 2: the user's last choice
  store.dispatch(new PushLike(true, {serverRevision: 10, localRevision: 9, deviceId: otherDevice}));
  requests[0].d.resolve({ rev: 11, liked: true }); await flush();
  expect(requests.map(r => r.value)).toContain(false); // FAILS: requests are [true, true]
  ```

## 9. A `dispatchWhen` action is dispatched in the middle of `logOut()`, even when the store is shut down (Medium)

- **Docs say:** `src/Store.tsx:2796-2799`: "While logOut is running, the store doesn't accept new actions ... If the app ... shuts down the store (`setShutDown`), before or during logOut, they stay that way after it." `setShutDown` (`:461`): "abort any new actions that are dispatched".
- **What happens:** `logOut` applies the initial state with `dispatchSync(UpdateStateAction)` while `_isApplyingLogOutState` is true (`:2885-2890`). `_registerState` then flushes `_dispatchWhenQueue` (`:2571-2575`), and the queued actions run, because `_isShutDown()` returns `false` while `_isApplyingLogOutState` is true (`:491-494`). So the old user's action changes the state right after it was reset, and with a persistor that state is saved. The same happens to anything the `stateObserver` or `actionObserver` dispatches during that step.
- **Fixed:** The store now accepts only the `logOut` action that applies the initial-state: `_isApplyingLogOutState` is set back to `false` as soon as that action starts (in `_processDispatch`). So the actions dispatched while it runs, by `dispatchWhen`, the `stateObserver` or the `actionObserver`, are not accepted. Also, `logOut` now cancels all `dispatchWhen`s that are still waiting (`_cancelAllDispatchWhen`), so a `dispatchWhen` called before logOut is not dispatched after it either, and its `onTimeout` is not called. The JSDoc of `logOut` and `dispatchWhen` says so.
- **How to trigger:** see the BDDs in `__tests__/bdd.LogOutDispatchWhen.test.ts`. Before the fix, 5 of them failed: the `dispatchWhen` action was dispatched while logOut applied the initial-state (with and without `setShutDown(true)`), so did the actions dispatched by the `stateObserver` and the `actionObserver`, and a `dispatchWhen` called before logOut was dispatched after it.

## 10. A `stateObserver` that throws leaves the store inconsistent (Low)

- **Docs say:** the `stateObserver` JSDoc (`src/Store.tsx:228-281`) doesn't say it must not throw (its own example calls `saveMetrics`, which could throw). `persistAndPausePersistor` "Persists the current state (if it's not yet persisted)".
- **What happens:** the state is changed, but then:
  - `dispatch` throws the observer's error, and the action counts as failed. It throws even when the `errorObserver` returns `null`.
  - The observer is called again from `_processWrapsError` (`:1669`). If it throws again, `wrapError` is skipped.
  - The new state is never persisted, and `persistAndPausePersistor()` doesn't save it either, since `newestState` was not updated.
  - `waitCondition` never sees the change, so it times out, and a `dispatchWhen` met by the change is never dispatched.
- **Cause:** `_stateObserver` is called at `src/Store.tsx:2527`, after `this._state = newState`, but before removing the action from in-progress, checking `_waitConditions`, calling `_processPersistence.process` (`:2562`) and flushing `_dispatchWhenQueue`.
- **Fixed:** An error thrown by the `stateObserver` is now ignored (and logged), the same as one thrown by the `actionObserver`. All its calls go through the new `_observeState` in `src/Store.tsx`. So the action runs normally: it completes OK (or fails with its own error, after `wrapError` and the `errorObserver`), the state is persisted, and the wait-conditions and `dispatchWhen` see it. The `stateObserver` JSDoc now says it should not throw, and what happens if it does.
- **How to trigger:** see the BDDs in `__tests__/bdd.StateObserverThrows.test.ts`. Before the fix, all 13 failed: `dispatchAndWait` rejected with `observer error`, `wrapError` was called 0 times, the persistor kept `{n: 0}`, the `waitCondition` was rejected, and the `dispatchWhen` action was not dispatched.

## 11. `logOut({ actionsThrottle: 0 })` waits forever, instead of "at most 0 ms" (Low)

- **Docs say:** "Wait for all actions currently running to finish, but wait at most `actionsThrottle` milliseconds" (`src/Store.tsx:2792-2794`, `react/miscellaneous/persistor.md:563`).
- **What happens:** with an action that never finishes, `logOut` never resolves. Also, `logOut()` called from inside an action always waits the full `actionsThrottle`, because the calling action is in progress, so with `actionsThrottle: 0` it deadlocks.
- **Cause:** `actionsThrottle` is passed as `timeoutMillis` to `waitAllActions` (`src/Store.tsx:2872-2877`), where 0 means "no timeout" (`:3233`).
- **Fixed:** `logOut` now doesn't wait for the running actions at all when `actionsThrottle` is zero or negative, instead of passing it to `waitAllActions`, where it means "no timeout". So an action can now call `logOut({ actionsThrottle: 0 })` and wait for it. The `logOut` JSDoc now says what an `actionsThrottle` of zero does, and that logOut called (and awaited) from inside an action waits the full `actionsThrottle`, since that action is still running.
- **How to trigger:** see the BDDs in `__tests__/bdd.LogOutActionsThrottleZero.test.ts`. Before the fix, `logOut` with an `actionsThrottle` of `0` or `-1` and an action that never finishes was still running after 500 ms, and so was an action that awaited `logOut({ actionsThrottle: 0 })`.

## 12. A `wrapError` that returns `undefined` makes the action fail with `undefined` (Low)

- **Docs say:** the `errorObserver` JSDoc (`src/Store.tsx:139`) says returning `null`, `undefined` or nothing swallows the error, and `Persistor.wrapError` does the same (`src/ProcessPersistence.ts:436`). The store turns a thrown `null`/`undefined` into an `Error` (`src/Store.tsx:1651-1654`), "since a null error means 'no error'". The action's `wrapError` JSDoc only mentions `null`.
- **What happens:** a `wrapError` that falls through (a common TS mistake) makes `dispatch` throw `undefined`, or `dispatchAndWait` reject with `undefined`. `status.wrappedError` stays `null`, but the action is in the failed list. With the documented pass-through `errorObserver` (`({error}) => error`), the error is instead silently swallowed.
- **Cause:** `src/Store.tsx:1694-1725` only checks `error !== null`, then throws it.
- **Fixed:** a `wrapError` that returns `undefined` now swallows the error, the same as returning `null`, which is also what the `errorObserver` and `Persistor.wrapError` do (`src/Store.tsx`, right after calling `wrapError`). So the `errorObserver` is not called, the action is not in the failed list, and `dispatch`/`dispatchAndWait` don't throw. Also, the return type of `KissAction.wrapError` is now `NonNullable<unknown> | null` instead of `any`, so a `wrapError` that may fall through doesn't compile (an override typed `: any` still does, and then gets the runtime fix). A `wrapError` that always throws now needs `: never`, since TypeScript infers `void`; the two in the ESLint plugin demos were changed. The JSDoc and the CHANGELOG say all this.
- **How to trigger:** see the BDDs in `__tests__/bdd.WrapErrorReturnsUndefined.test.ts`. Before the fix, all the ones that return `undefined` failed: `dispatchAndWait` rejected with `undefined` (sync and async actions), `dispatch` threw `undefined`, an async `dispatch` caused an unhandled rejection with `undefined`, and the `errorObserver` was called with `undefined`. The type scenario didn't compile: `Unused '@ts-expect-error' directive` for a `wrapError` that falls through, and `Type 'false' is not assignable to type 'true'` for "the return type doesn't accept `undefined`". The examples that return `null` check that both behave the same.

## 13. `deleteStateFromPersistence()` during a slow save: the save finishes later and puts the state back (Low)

- **Docs say:** `deleteStateFromPersistence` deletes the persisted state.
- **What happens:** a save that's in progress is not waited for. It finishes after the delete, and writes the state back to storage. `saveInitialStateInPersistence` has the same cause (not tested). This was in the "Plausible" list of the previous review, and is now reproduced.
- **Fixed:** `deleteStateFromPersistence()`, `saveInitialStateInPersistence()` and `readStateFromPersistence()` now wait for a running save to finish first, and no save starts while they run (`ProcessPersistence._runAlone`). State changes made while they run are saved after they finish. Also, a `PersistAction` dispatched while a save is running now saves the state when it finishes, ignoring the throttle (before, it was ignored). The same was fixed in AsyncRedux.
- **How to trigger:** see the BDDs in `__tests__/bdd.PersistenceProcess.test.ts`. Before the fix, 7 of them failed: deleting the state while a save is running put the state back; a state change while the state was being deleted or read was saved at the same time; saving the initial state while a save is running was overwritten by it; reading the state while a save is running returned the state before it (and also when the read failed); and a `PersistAction` while a save is running waited for the throttle.

## 14. Two `dispatchWhen` met by the same state change: the 2nd is dispatched although the 1st made its condition false (Low)

- **Docs say:** "dispatched synchronously, right after the state change that meets the condition, so no other action can change the state in between" (`src/Store.tsx:3624-3625`, `src/KissAction.ts:384-386`).
- **What happens:** the queued actions are all dispatched one after the other, without checking their condition again. So the 2nd runs on a state that no longer meets its condition. This is arguable, but the guarantee in the docs is exactly what users rely on to avoid this.
- **Cause:** `src/Store.tsx:2571-2575` and `:3685-3688`.
- **How to trigger:**
  ```ts
  store.dispatchWhen(new Buy(), s => s.cash >= 100, {timeoutMillis: 0});  // Buy: cash -= 100
  store.dispatchWhen(new Buy(), s => s.cash >= 100, {timeoutMillis: 0});
  store.dispatch(new SetCash(100));
  expect(store.state.cash).toBeGreaterThanOrEqual(0);  // FAILS: -100 (each Buy saw cash 100 and 0)
  ```

## 15. `logStateChanges` doesn't log some state changes (Low)

- **Docs say:** "If `true`, will use Store.log() to log all state changes" (`src/Store.tsx:108`). It's on by default.
- **What happens:** a number or string state (as in the docs' `createStore<number>` and the README's `createStore<string>` examples) logs nothing. A changed `Date`, `Map` or `Set` field produces no description.
- **Cause:** `describeStateChange` returns `''` for non-objects (`src/Store.tsx:2750`), and only compares `Object.keys` (`:2758`).
- **How to trigger:**
  ```ts
  const store = new Store<number>({ initialState: 0, logger: o => logs.push(o) });
  store.dispatch(new Inc());          // logs is ['1) Inc()'], with no state line
  Store.describeStateChange({d: new Date(0)}, {d: new Date(1000)})   // returns ""
  ```

## 16. Types: `waitAnyActionTypeFinishes` doesn't compile with an optional `onTimeout` (Low)

- **What happens:** passing an `onTimeout` that may be `undefined` gives `TS2769: No overload matches this call ... 'onTimeout' does not exist in type '{ timeoutMillis?: ... }'`.
- **Cause:** the overloads at `src/Store.tsx:3564-3571` and `src/KissAction.ts:3385-3392` accept either a required `onTimeout: () => void`, or no `onTimeout` property.
- **How to trigger:**
  ```ts
  async function f(store: Store<number>, onTimeout?: () => void, timeoutMillis?: number) {
    await store.waitAnyActionTypeFinishes([A], { timeoutMillis, onTimeout }); }   // TS2769
  ```

## 17. `ServerPush` accepts a non-finite `serverRevision`, which breaks stale-push protection for its key (Low)

- **Docs say:** `informServerRevision` rejects non-finite revisions (`src/KissAction.ts:5626-5629`). `ServerPush` checks nothing.
- **What happens:** a push with an `undefined` or `NaN` `serverRevision` is applied and recorded. From then on, `Math.max(...)` in `_revisionOf` (`:5872`) is `NaN`, so `serverRevision <= NaN` is false for every push: stale pushes are applied. And responses fail `informed >= NaN` (`:5776`), so they're never applied.
- **How to trigger:** push `true` with revision 20, then push `true` with revision `undefined`, then push `false` with revision 3. `expect(store.state.liked).toBe(true)` fails: the stale revision-3 push was applied.

## 18. `isWaiting(Self)` is `true` inside a SYNC reducer, but the JSDoc says it's always `false` for SYNC actions (Low)

- **Docs say:** `src/Hooks.tsx:542` (`useIsWaiting`), `src/Store.tsx:~2680` and `src/KissAction.ts:592`: "it always returns `false` when the action is SYNC".
- **What happens:** every action, sync ones included, is in `_actionsInProgress` while it runs (`src/Store.tsx:1567`). So `this.isWaiting(SyncA)` inside `SyncA.reduce()` is `true`. Components are not affected: `useIsWaiting(SyncAction)` never renders `true`. The docs example of bug 29 relies on the documented behavior.
- **How to trigger:** `reduce() { seen = this.isWaiting(SyncA); return null; }`, then `store.dispatch(new SyncA()); expect(seen).toBe(false)` fails: received `true`.

## 19. ESSerializer: reading back a `Map`/`Set` filled by its constructor keeps the constructor's entries (Low)

- **What happens:** for a `Map`/`Set` subclass, or a read-only `Map`/`Set` property updated in place (the fix of the previous bug 24), the saved entries are added on top of the entries the constructor created. So entries the user deleted come back after a restart.
- **Cause:** the `fill` of `Map` and `Set` (`src/Esserializer/builtins.ts:156`, `:165`) adds without clearing first. It's called from `src/Esserializer/deserializer.ts:117` and `:238`.
- **Fixed:** the `fill` of `Map` and `Set` now calls `clear()` before adding the saved entries, so only the saved entries are kept.
- **How to trigger:** see the BDDs in `__tests__/bdd.SerializeMapSetFilledByConstructor.test.ts`. Before the fix, all of them failed: a `Map`/`Set` subclass, and a read-only `Map`/`Set` property, got back the entries the constructor added (also when they were all removed), including through a `ClassPersistor` save and read.

## 20. ESSerializer: an `Error` subclass with an empty message comes back with message `"[object Object]"` (Low)

- **Cause:** `_encodeError` saves the message only `if (error.message)` (`src/Esserializer/builtins.ts:67`). When reading, `_createInstance` passes `{}` for the missing constructor parameter (`src/Esserializer/deserializer.ts:39`, `:150`), so `super({})` sets the message to `"[object Object]"`.
- **Fixed:** `_encodeError` now always saves the message, even when it's empty, so the saved message replaces the one the constructor gave. This also fixes a subclass whose constructor has a default message (`constructor(m = 'Something went wrong')`), which came back with the default message instead of the empty one.
- **How to trigger:** see the BDDs in `__tests__/bdd.SerializeErrorEmptyMessage.test.ts`. Before the fix, the ones with an `Error` subclass failed: the message came back as `"[object Object]"`, or as the default message of the constructor. The BDDs also check that `Error` and `TypeError` with an empty message, and an error with a message, still work.

## 21. ESSerializer: a null-prototype object comes back with `Object.prototype` (Low)

- **What happens:** a dictionary made with `Object.create(null)` (so it has no inherited keys) comes back as `{}`. After a restart, `dict['constructor']` is the `Object` function, so a check like `if (dict[word])` is true for the word "constructor".
- **Cause:** the serializer saves it as a plain object (`src/Esserializer/serializer.ts:279`), and the deserializer always creates `{}` (`src/Esserializer/deserializer.ts:79`).
- **Fixed:** an object with no prototype is now saved with the new type `@nullPrototype` (`TYPE_NULL_PROTOTYPE` in `src/Esserializer/constant.ts`), and its properties are saved as usual. The deserializer reads it into `Object.create(null)`. Plain objects are still saved with no type, and data saved before the fix is still read as plain objects.
- **How to trigger:** see the BDDs in `__tests__/bdd.SerializeNullPrototype.test.ts`. Before the fix, all of them failed except the last: the null-prototype object came back with `Object.prototype` (nested, top-level, inside a class with nested values, and with a `__proto__` key). The last one checks that plain objects are still saved and read as before.

## 22. ESSerializer: a class with a static `toString()` is restored without running its constructor (Low)

- **What happens:** its private `#fields` and field initializers are missing.
- **Cause:** `src/Esserializer/deserializer.ts:141` decides that it's an ES6 class with `REGEXP_BEGIN_WITH_CLASS.test(classObj.toString())`. A static `toString` (own or inherited) makes it take the function-style path, where `constructor.apply` throws "Class constructor cannot be invoked without 'new'". That error is swallowed, and it falls back to `Object.create(prototype)`. It should use `Function.prototype.toString.call(classObj)`.
- **Fixed:** `_createInstance` now uses `Function.prototype.toString.call(classObj)`, so a static `toString` is ignored.
- **How to trigger:** see the BDDs in `__tests__/bdd.SerializeStaticToString.test.ts`. Before the fix, both examples of the first one failed (a static `toString` of its own, and one inherited from the parent class): reading the private field threw `TypeError: Cannot read private member #secret`. The second one checks a static `toString` that returns text starting with `class`.

## 23. `PersistorPrinterDecorator` makes every save fail when the state has no prototype (Low)

- **What happens:** the decorator only logs, but its template literals `${lastPersistedState}` / `${newState}` (`src/Persistor.tsx:199-201`) throw `TypeError: Cannot convert object to primitive value` for an `Object.create(null)` state, so `persistDifference` is never called. For normal states it prints a useless `[object Object]`.
- **Fixed:** the decorator now describes the states with a new `describeValue` helper in `src/utils.ts` (moved from `KissAction._describeValue`, which `KissAction.toString()` already used). It prints the states as JSON (BigInts as `7n`), and never throws: if JSON fails, as for a circular state, it falls back to `String(value)`, and then to `[object]`. The message is now built with `Store._logLazy`, so the states are not described at all when the logger is `null`.
- **How to trigger:** see the BDDs in `__tests__/bdd.PersistorPrinterDecorator.test.ts`. Before the fix, these failed: a state with no prototype was never saved, and an error was reported; and the printed message had `[object Object]` instead of the states. The BDDs also check that a circular state and a state with a BigInt are saved without errors, and that the states are not described when logging is off.

## 24. `ClassPersistor`: the "minified class names" check has false positives (Low)

- **Docs say:** `react/miscellaneous/persistor.md:402-407`: "this can only happen in production builds". The docs also say native classes don't need to be listed, but listing `Date` is allowed (`isClass` accepts it).
- **What happens:**
  - Any class whose name starts with a lowercase letter (for example `myState` or `todoItem`) throws "Class names are being minified (found class "myState")", even in development.
  - In a minified build, listing `Date` in `classesToSerialize` throws "Class names are being minified (found class "Date")", and `Date` can't be given a `typeName`.
- **Cause:** `src/ClassPersistor.tsx:116`: `else if (minified || /^[a-z]/.test(key ?? ''))`, which doesn't skip built-in classes.
- **Fixed:** in a build that is not minified, a class with no `typeName` now throws only if its name looks minified: one or two characters, starting with a lowercase letter, `_` or `$` (like `e`, `ab`, `_e` or `$e`). So `myState` and `todoItem` are accepted. This keeps catching class names minified by a bundler that left the Kiss code unminified, which the old check was there for. Built-in classes (any native function, like `Date` or `Map`) are now skipped by the check, as they are saved as `@Date` etc., not by their name. The `ClassPersistor` JSDoc now says this. The docs in `persistor.md` now say the check normally only fails in production builds, except for a class with no `typeName` whose name looks minified, which also fails in development. They also say built-in classes, like `Date`, are not checked.
- **How to trigger:** see the BDDs in `__tests__/bdd.ClassPersistorClassNames.test.ts`. Before the fix, these failed: classes named `myState`, `todoItem` and `abc` threw in a build that is not minified, and listing `Date` or `Map` threw when class names are minified. The scenario "The ClassPersistor throws when a class name looks minified" replaces the old one about lowercase names. Its `_e` and `$e` examples are newly detected, and also failed before the fix.

---

# Docs bugs

## 25. The error docs describe the removed `globalWrapError` and the old boolean `errorObserver` (High)

- **Where:**
  - `react/advanced-actions/errors-thrown-by-actions.md:264-282, 323-334` pass `globalWrapError` to `createStore`, and lines 284-307 and 340 describe it.
  - Line 361: `function errorObserver(error: any, action: Action | null, store: Store<State>)`. Lines 349-350 and 377-397: return `true` to throw, `false` to swallow, "including `UserException`s", and persistor errors are logged with `Store.log()`.
  - Line 390 gives the order "wrapError, globalWrapError, after, and errorObserver".
  - `react/miscellaneous/log-and-metrics.md:53`: "before the action's `wrapError()`, and before the `globalWrapError()`."
  - The homepage `src/components/HomepageFeatures/overview-react.mdx:653-678` (copied into the AI docs file) uses `globalWrapError` and `errorObserver: (error, action, store) => ...`.
- **Code:** `globalWrapError` was removed (`CHANGELOG.md:189`). The signature is `errorObserver?({error, originalError, action, store}): any` (`src/Store.tsx:197-202`). Its result is used as the error, and only `null`/`undefined` swallows it (`:1701-1743`). A returned `UserException` is shown, never thrown. The real order is `wrapError`, `errorObserver`, then `after()` (`:1693-1705`, `:1745`). Persistor errors are covered in bug 27.
- **How to trigger:** compiling gives `TS2353: ... 'globalWrapError' does not exist in type 'ConstructorParams<State>'`, and for the observer `TS2322 ... Target signature provides too few arguments`. In JS, an observer that returns `false` (documented as "swallow") makes `dispatch` throw `false`, and `true` makes it throw `true`, even for a `UserException`. Recording the calls gives `wrapError -> errorObserver -> after`.
- **Fixed:** In the website, `errors-thrown-by-actions.md`, `log-and-metrics.md` and the homepage no longer mention `globalWrapError`. Converting errors for all actions is now shown with the `errorObserver({error, originalError, action, store})`, which returns the error to use, or `null` to swallow it. The order is now `wrapError`, `errorObserver`, then `after()`. The `wrapError` JSDoc (`src/KissAction.ts`) now points to the `errorObserver`.

## 26. README and homepage call `this.dispatchAndWaitAll(...)` inside an action, which doesn't exist (High)

- **Where:** `README.md:307` and `src/components/HomepageFeatures/overview-react.mdx:288`: `await this.dispatchAndWaitAll([new BuyAction('IBM'), new SellAction('TSLA')])`.
- **Code:** `KissAction` only has `dispatch`, `dispatchWhen`, `dispatchAndWait` and `dispatchSync` (`src/KissAction.ts:378-442`). Either the docs are wrong, or `KissAction` should get `dispatchAll` and `dispatchAndWaitAll`, like `useStore()` got them (previous bug 26).
- **Fixed:** The code was changed, not the docs. `KissAction` now has `dispatchAll` and `dispatchAndWaitAll`, which call the ones in the store, like the other dispatch methods. Also, `dispatchSync` is now `protected`, like the others.
- **How to trigger:** see the BDDs in `__tests__/bdd.ActionDispatchAll.test.ts`. Before the fix, they didn't compile: `TS2551: Property 'dispatchAll' does not exist on type 'DispatchAllAction'. Did you mean 'dispatch'?`, and the same for `dispatchAndWaitAll`.

## 27. `persistor.md` says persistence errors never crash the app, and describes the old boolean `errorObserver` (Medium)

- **Where:** `react/miscellaneous/persistor.md:227`: "Kiss never lets these errors crash your app." Lines 248-256: the `UserException` is shown, then "Finally, the error is given to the errorObserver"; "returning `true` logs the error with `Store.log()`, and returning `false` ignores it. If you didn't define an `errorObserver`, errors that are not `UserException`s are logged with `Store.log()`." Also `advanced-actions/errors-thrown-by-actions.md:384-386`.
- **Code:** the `errorObserver` runs before the `UserException` is shown, and a non-null error that is not a `UserException` becomes an unhandled rejection (`src/Store.tsx:2658-2670`). The `Persistor` JSDoc (`src/Store.tsx:150-153`) is correct.
- **How to trigger:** a persistor whose `persistDifference` throws "disk full": with no observer, Jest fails with an unhandled "disk full" rejection, and nothing is logged. With `() => false`, it fails with an unhandled "thrown: false".
- **Fixed:** `persistor.md` no longer says these errors never crash the app. It now gives the real order: the persistor's `wrapError`, then the `errorObserver` (with a `null` action). Then a `UserException` is shown, and any other error becomes an unhandled promise rejection, unless the observer returns `null`. The persistence part of `errors-thrown-by-actions.md` says the same.

## 28. The AI docs file is out of date, and the ai-usage page describes it wrongly (Medium)

- **Where:** `kiss-state-management-docs.md` and its copy in `static/` say "Last updated: 2026-10-10", and have no mention of `ignoreOld`, which the `react/` pages document. Regenerating it with `scripts/generate-consolidated-docs.js` changes about 20 places, all about `ignoreOld` (new sections, the compatibility matrix, `clearInternalActionProps`, the incompatibility lists). Since it includes the homepage, it also carries bugs 25, 26, 31 and 34.
- **Also:** `react/ai-usage/using-ai-documentation.md:25` says the file includes "Migration guides - Comparing with Redux, Zustand, MobX, and TanStack", but the generator's `SECTION_ORDER` (`scripts/generate-consolidated-docs.js:17-25`) has no comparisons section. Line 196 says "~259KB", but it's about 363KB.
- **Fixed:** Regenerated with `npm run generate:docs` (the file is git-ignored, and the website build regenerates it), so it now has `ignoreOld` and the docs fixes in this file. `using-ai-documentation.md` no longer says it has comparisons, and gives the size as ~370KB.

## 29. The `SellAction` example in `wait-fail-succeed.md` always fails (Medium)

- **Where:** `react/basics/wait-fail-succeed.md:36-46`: `if (this.isWaiting(SellAction) || this.isWaiting(BuyAction)) throw new UserException('Please wait for the current order to complete.')`, meaning "if there is already a SellAction running".
- **Code:** the running action is itself in progress (`src/Store.tsx:1567`), so `this.isWaiting(SellAction)` is always `true` inside it. See also bug 18.
- **How to trigger:** `(await store.dispatchAndWait(new SellAction('IBM'))).originalError` is `UserException: Please wait for the current order to complete.`, instead of `null`.
- **Fixed:** The example now only checks `this.isWaiting(BuyAction)`, says why `this.isWaiting(SellAction)` can't work inside a `SellAction`, and shows `nonReentrant` to avoid two `SellAction`s at once.

## 30. `isFailed`/`useIsFailed` are documented as true after any failure, but they only count `UserException`s (Medium)

- **Where:** `react/basics/wait-fail-succeed.md:23`: "Is true if the given action type just failed", and the same for `useIsFailed` at line 108. The `LoadText` examples at lines 154-168 promise a "Loading failed..." message. Also check `tutorial/async-actions.md:115-128`, `comparisons/comparing-tanstack.md:316-320` and `comparing-redux.md:208-221`.
- **Code:** `isFailed` is `exceptionFor(type) !== null`, and `exceptionFor` only returns a `UserException` (`src/Store.tsx:2705-2721`). The JSDoc (`src/Store.tsx:2702`, `src/Hooks.tsx:591`) is correct.
- **How to trigger:** after an async action throws `TypeError('Failed to fetch')`, `isFailed` is `false` and `exceptionFor` is `null`.
- **Fixed:** `wait-fail-succeed.md` now says `isFailed`, `exceptionFor` and `useIsFailed` only consider `UserException`s, and its `LoadText` example uses `wrapError` to turn any error into a `UserException`. `tutorial/async-actions.md`, `comparing-redux.md` and `comparing-tanstack.md` say the same, and their examples now show `?.message` instead of the `errorText` the action never sets.

## 31. `dispatching-actions.md` calls `status.isCompletedOk()`, which is a getter (Medium)

- **Where:** `react/basics/dispatching-actions.md:65, 74, 119`. Line 119, `expect(sellAction.status.isCompletedOk()).toBe(true));`, also has an extra `)`.
- **How to trigger:** `TS6234: This expression is not callable because it is a 'get' accessor`, and in JS `TypeError: status.isCompletedOk is not a function`. Line 119 also gives `TS1005: ';' expected`.
- **Fixed:** Now uses the getter `isCompletedOk`, and the extra `)` is removed.

## 32. `debugging-the-app.md` calls `useStore().actionsInProgress()`, which doesn't exist (Medium)

- **Where:** `react/testing/debugging-the-app.md:41-48`: "using `actionsInProgress()` from inside any component: `const store = useStore(); console.log(store.actionsInProgress());`". It also says it returns "an array".
- **Code:** `useStore()` returns `StoreDispatchers` (`src/Hooks.tsx:733-788`), which has no `actionsInProgress`. `Store.actionsInProgress()` returns a `Set` (`src/Store.tsx:3617`).
- **How to trigger:** `TS2339: Property 'actionsInProgress' does not exist on type 'StoreDispatchers<any>'`, and a `TypeError` at runtime.
- **Fixed:** Now uses `const { store } = useStore(); store.actionsInProgress()`, and says it returns a `Set` (a copy).

## 33. `testing-user-exceptions.md`: the queue example can't pass, and `isCompletedFailed` is not `!isCompletedOk` (Medium)

- **Where:** `react/testing/testing-user-exceptions.md:56-77` dispatches 3 failing actions, and expects `store.userExceptionsQueue` to have length 3. Line 26 says `isCompletedFailed` equals `!isCompletedOk`.
- **Code:** each exception is taken out of the queue when it's shown (`src/Store.tsx:2606-2641`, `:2614`), and the default `showUserException` calls `next()` right away (`:872-875`). Both getters require `isCompleted` (`src/KissAction.ts:3836-3851`).
- **How to trigger:** the length is 0 with the default UI, and 2 with a dialog that never calls `next`. While an action is running, or not yet dispatched, `isCompletedOk` and `isCompletedFailed` are both `false`.
- **Fixed:** The page now says the queue only holds the exceptions not yet shown. The example uses a `showUserException` that never calls `next()`, so it expects 1 exception shown and 2 in the queue (checked with a test). It now says `isCompletedFailed` is `isCompleted && !isCompletedOk`.

## 34. The homepage examples don't compile, or contradict themselves (Medium)

- **Where:** `src/components/HomepageFeatures/overview-react.mdx`:
  - `:604-608`: `persistor: new Persistor()`, but `Persistor` is abstract (`src/Persistor.tsx:26`): `TS2511: Cannot create an instance of an abstract class`.
  - `:658`: `createStore<string>({...})` has no `initialState`, which is required (`src/Store.tsx:30`): `TS2345`.
  - `:623-642`: the test declares `selectedItem: number`, then expects `.toBe('B')`. And the only `SelectItem` on the page (`:726-733`) throws a plain `Error`, so `dispatchAndWait` rejects, and `status.originalError` at `:642` is never reached.
  - `:221-222` and `:669-670` say a dialog pops up for a `UserException`, but by default nothing opens: `_defaultShowUserException` only logs (`src/Store.tsx:872-875`). `handling-action-errors.md:232-236` says this correctly.
  - See also bugs 25 and 26.
- **Fixed:** The homepage now uses `new MyPersistor()` (as the README), gives `createStore` an `initialState`, and its test and `SelectItem` agree (items with an `id`, `selectedItem` is the id, and `SelectItem` throws a `UserException`). It no longer says a dialog opens by default.

## 35. The TanStack comparison is out of date with 2.0.0 (Medium)

- **Where:** `react/comparisons/comparing-tanstack.md`:
  - Lines 146-169 do freshness with `throttle`. There is now a dedicated `fresh` feature (`src/KissAction.ts:1609`), which behaves differently on failure (a failed `fresh` action doesn't stay fresh).
  - Line 37: "Smart refetches ... Yes (soon)". Lines 209-265 say `refetchOnMount` and `refetchInterval` are "not yet present", and show a hypothetical `useAutoDispatch`. 2.0.0 has `useDispatch({deps, onMount, onDepsChange, onUnmount})` (`src/Hooks.tsx:323`) and polling (`src/KissAction.ts:2356`).
  - Line 309 links to `http://localhost:3000/react/basics/wait-fail-succeed`.
- **Fixed:** Freshness is now done with `fresh`. The "soon" and "not yet present" parts, and the hypothetical `useAutoDispatch`, are replaced by `useDispatch({ onMount })` with `fresh`, and a polling example with `Poll.start`/`Poll.stop`. The localhost link is now relative.

## 36. `wait-for-condition.md`: changing the actions set doesn't throw any more, and the `waitActionType` example doesn't compile (Low)

- **Where:** `react/miscellaneous/wait-for-condition.md:433-435`: "Your condition function should not try and modify the set ... If you do, Kiss will throw an error." Lines 366-370: `let action = await store.waitActionType(MyAction); expect(action.status.isCompletedOk)...`. The `waitActionType` JSDoc (`src/Store.tsx:~3365`, `~3383`) has the same example.
- **Code:** since commit `5f50b1b`, the condition gets a copy of the set (`src/Store.tsx:3138-3141`), so changing it doesn't throw. `waitActionType` returns `Promise<KissAction<St> | null>` (`:3405-3417`).
- **How to trigger:** `clear()` and `add()` inside the condition don't throw, and the wait resolves. The example gives `TS18047: 'action' is possibly 'null'`.
- **Fixed:** `wait-for-condition.md` now says the condition gets a copy of the set, so changing it has no effect. The `waitActionType` examples, in the page and in the JSDoc (`src/Store.tsx`, `src/Hooks.tsx`, `src/KissAction.ts`), now use `action?.status`.

## 37. `testing-the-app.md` describes `store.record` wrongly (Low)

- **Where:** `react/testing/testing-the-app.md:80` says `store.record.result` "contains an array", and lines 116-124 show the output numbered from "1.".
- **Code:** `result` is a function (`result: () => this.record.changes`), and `toString()` numbers from 0 (`src/Store.tsx:834-862`).
- **How to trigger:** `store.record.result[0]` gives `TS7053`. The output starts with `0. SetN ini(1): ...`.
- **Fixed:** Now says `store.record.result()` returns the array, and the output matches `toString()`, numbered from 0. Also fixed a missing comma in its `it(...)` examples.

## 38. `mocking-actions.md`: the mock-recording loop doesn't compile (Low)

- **Where:** `react/testing/mocking-actions.md:99-104`: `for (const actionType of [AddAction, IncrementAction, LoadUserAction]) store.mocks.add(actionType, ...)`.
- **Code:** `add<T>(actionType: new (...args) => T, ...)` (`src/Store.tsx:3747`). TypeScript infers `T` from only one member of the union.
- **How to trigger:** with a sync action, an action with constructor parameters and an async action: `TS2345: Argument of type 'typeof IncrementAction | typeof AddAction | typeof LoadUserAction' is not assignable ...`.
- **Fixed:** The loop now goes over an array typed as `Array<new (...args: any[]) => KissAction<State>>`.

## 39. `action-status.md` examples don't compile (Low)

- **Where:** `react/advanced-actions/action-status.md:16-23` declares `let status` twice in the same block (`TS2451`). Line 60: `console.log(action.isCompletedOk);` should be `action.status.isCompletedOk` (`TS2339`).
- **Fixed:** The two variables are now `statusBefore` and `statusAfter`, and it uses `action.status.isCompletedOk`.

## 40. Syntax errors in `tutorial/async-actions.md` and `changing-state-is-optional.md` (Low)

- **Where:** `react/tutorial/async-actions.md:134-141` (React tab of "Combining isWaiting and isFailed"): the `<button onClick=... disabled={isLoading}` tag has no closing `>`. Gives `TS1005` and `TS17002: Expected corresponding JSX closing tag for 'div'`.
- `react/basics/changing-state-is-optional.md:35`: `: state.copy({counter: state.counter + amount}));` has an extra `)`. Gives `TS1005: ';' expected`.
- **Fixed:** Added the missing `>`, and removed the extra `)`.

## 41. `optimistic-features.md` overrides don't compile under `strict` (Low)

- **Where:** `react/advanced-actions/optimistic-features.md:205` (`rollbackState`), `:219` (`shouldRollback`), `:258` (`shouldApplyReload`), `:527` (`ifShouldSendAnotherRequest`), and the `shouldReload` JSDoc (`src/KissAction.ts:4308`) destructure their parameter without types. Overrides don't get their types from the base class.
- **How to trigger:** `TS7031: Binding element 'initialValue' implicitly has an 'any' type.`
- **Fixed:** The overrides in `optimistic-features.md`, and the `shouldReload` JSDoc example, now type their parameters.

## 42. `business-logic.md` is cut off (Low)

- **Where:** `react/miscellaneous/business-logic.md:95-96` ends with "Finally, here is the code that actually toggles the todo item..." and no code follows.
- **Fixed:** The page now explains that `toggleTodo()` calls `TodoItem.toggleCompleted()`, shows the `TodoItem` class, and has a short ending.

## 43. The tutorial uses Dart syntax, a wrong class name, and says a dialog pops up by default (Low)

- `react/tutorial/handling-action-errors.md:222`: `UserException("message", errorText: "errorText")` is Dart. It should be `new UserException(message, { errorText })` (`src/UserException.ts:73-82`).
- `react/tutorial/persisting-the-state.md:142, 159` call it `ClassSerialized`. It's `ClassPersistor`. Line 159 also says the npm `esserializer` package is "used internally", but it's now an adapted copy in `src/Esserializer/`.
- `react/tutorial/sync-actions.md:360` says a dialog pops up automatically for a `UserException`, at a step where the store has no `showUserException`. By default nothing opens (see bug 34).
- **Fixed:** Now `new UserException("message", { errorText: "errorText" })` and `ClassPersistor`, and it says Kiss includes an adapted copy of esserializer. `sync-actions.md` now says the message is only logged by default. The same "opens a dialog automatically" claim was also fixed in `errors-thrown-by-actions.md` and `basics/user-exceptions.md`.

## 44. The MUI `showUserException` example never calls `next()` when there's no container (Low)

- **Where:** `react/basics/user-exceptions.md:121` and `react/tutorial/handling-action-errors.md:75`: `if (!container) return;`.
- **What happens:** the store waits for `next()` to show the next exception, so if `dialog-root` is missing once, no `UserException` is ever shown again.
- **Fixed:** Both examples now call `next()` before returning when there's no container.

## 45. The NetInfo link points to the wrong package (Low)

- **Where:** `react/advanced-actions/internet-features.md:81` and the JSDoc at `src/KissAction.ts:144` link to `@rescript-react-native/netinfo`, but the code next to it uses `@react-native-community/netinfo`.
- **Fixed:** Both links now point to `@react-native-community/netinfo`.

## 46. The README quotes the wrong "no internet" dialog text (Low)

- **Where:** `README.md:411-412`: "There is no internet connection. Please check your connection."
- **Code:** `src/KissAction.ts:121` and the website say "There is no Internet" / "Please, verify your connection.".
- **Fixed:** The README now quotes the title "There is no Internet" and the message "Please, verify your connection.".

## 47. Stale or wrong JSDoc (Low)

- `src/KissAction.ts:241-242` (`wrapError`): "you can also define a global `wrapError` as a store parameter when you create the Store." That parameter was removed. It's now the `errorObserver`.
- `src/UserException.ts:57, 182`: `store.exceptionFor(MyAction).errorText` gives `TS2531: Object is possibly 'null'`. It should be `?.errorText`.
- The `ClassPersistor.readState` JSDoc says to call it "only once ... before the store is created", while the `Persistor` JSDoc and the website say the store calls `readState` itself.
- **Fixed:** The `wrapError` JSDoc now points to the `errorObserver`, the `UserException` JSDoc uses `exceptionFor(MyAction)?.errorText`, and the `ClassPersistor.readState` JSDoc now says the store calls it, and what happens when it throws.

---

### Plausible, not confirmed, or arguably by design

- Overriding `before()` without calling `super.before()` silently disables `checkInternet`. The `before()` JSDoc mentions it, but the `checkInternet` JSDoc, the README and the `OptimisticCommand` docs don't say you must call `super.before()`. This is a docs gap rather than a bug.
- `ActionStatus`: when the function returned by an async `reduce` throws, or `abortReduce` throws, both `hasFinishedMethodReduce` and `isCompletedFailed` are `true`. This is arguable: `reduce()` itself returned, and what threw was the function it returned. Also, `hasFinishedMethodReduce` is `true` when `reduce()` never ran: a debounced action replaced during its wait, `Poll.stop`, and `Poll.start` while polling is already active.
- When an async reducer resolves to a function, and that function throws when the store applies it, `retry` doesn't retry. The docs only say "retry the `reduce` method when it throws".
- `useIsFailed` may stay stale if the error happens after the state was applied (for example, a `stateObserver` that throws inside `_registerState`, see bug 10). The action is no longer in progress, so `_processWrapsFinally` doesn't rebuild.
- `StoreProvider` ignores a new `store` prop (`useState(store)`), for example after Fast Refresh or in tests. It's not documented either way.
- No `useSyncExternalStore`: under concurrent rendering, sibling components can briefly show different states (tearing), until the layout effect re-checks.
- React 19 `<Activity mode="hidden">`: now reproduced. Hiding and showing it again gives `['mount', 'unmount', 'mount']`, while the docs say `onMount` and `onUnmount` run once. Arguably by design, since React destroys the effects of a hidden Activity. `useSelect` updates correctly after showing it again.
- An `onMount` that throws synchronously, when the store wasn't ready at mount, runs inside `store.ready().then(mount)` (`src/Hooks.tsx:368`), so its error is an unhandled rejection instead of reaching the React error boundary. When the store is ready, it reaches the boundary.
- `action.status.isDispatchAborted` stays `false` when the dispatch is aborted before running (`abortDispatch`, `nonReentrant`, `throttle`, `fresh`, a `null` mock, shutdown). Only the status returned by `dispatchAndWait` has it `true`, so with `dispatch()` there's no way to see the abort. The `CHANGELOG.md:129-132` says exactly this, but the `ActionStatus.isDispatchAborted` JSDoc (`src/KissAction.ts:3751-3763`) and the `status` getter docs (`:355-368`) read as if `action.status` is updated too.
- A `wrapError` (or `errorObserver`) that returns an `AbortDispatchException` makes the action fail with it, and `status.isDispatchAborted` stays `false`. The `AbortDispatchException` docs (`src/StoreException.ts:18, 28`) only talk about throwing it from `before`/`reduce`, but `wrapError(e) { return e.name === 'AbortError' ? new AbortDispatchException() : e }` is a natural thing to write.
- `removeThrottleLockOnError` also removes the lock when the action is aborted (for example by `checkInternet = {abort: true}`), though aborted actions "don't fail". Probably desirable.
- `sequential` with `discardQueueOnError`: an action dispatched from the failing action's own `after()` is discarded. The docs say "Actions dispatched after this action finished are not affected", and it's unclear if `after()` counts as finished.
- Polling: if the controller's `before()` throws on `Poll.start`, polling is not started. The docs say "if it [the immediate run] fails, the polling is started anyway". It's unclear if a failing `before()` counts.
- `_processWrapsFinally` (`src/Store.tsx:1764-1771`): if a user getter (for example `removeThrottleLockOnError`) throws there, the rest of the cleanup is skipped, leaking the non-reentrant key and `_actionsInProgress`, and `dispatchAndWait` never settles. Code reading only.
- `ignoreOld` with `checkInternet`: a new dispatch takes the `ignoreOld` order before `before()` runs (`src/Store.tsx:1869`), so a dispatch that then fails or aborts in `checkInternet` still makes the older running action old. `control-features.md:580-583` doesn't list this case. Not run.
- `OptimisticSyncWithPush`: `_optimisticSyncRevisions` (`src/Store.tsx:749`) keeps one entry per key forever, until `clearInternalActionProps`, and lookups are linear deep compares. After `clearInternalActionProps`, local revisions restart at 0 but the device ID stays the same, so an echo of a request sent before the clear can be taken as the echo of the latest request.
- The `next()` given to `showUserException` is not idempotent: calling a stale `next` twice shows the next two exceptions at once. Arguably misuse.
- `dispatchAll` stops at the first sync action that throws. Same in AsyncRedux.
- A mock function that throws makes `dispatchAndWait` throw synchronously, instead of returning a rejected promise.
- A `dispatchWhen` whose condition is met by the persisted state being read is dispatched before the store is ready (`isApplyingReadState` skips `_throwIfNotReady`). Arguably wanted.
- `waitAllActions([original])` on a mocked action never sees it in progress, since only the mock is dispatched.
- The `stateObserver`'s `dispatchCount` is the store's current count, not the action's own number. Same in AsyncRedux.
- Before `ready()`, `getLastPersistedStateFromPersistor()` returns the `initialState`, though nothing was saved yet.
- If the first `saveInitialState` fails and the state never changes, `persistAndPausePersistor()`/`resumePersistor()` don't save the initial-state. Harmless: the next run saves it.
- A class missing from `classesToSerialize` saves fine, but at the next start `readState` throws and the whole saved state is deleted. This is documented ("You HAVE to list..."), but nothing warns at save time.
- A plain object whose own `constructor` property holds a class (`{constructor: K, v: 2}`) is saved as a `K` instance. This is the intended big.js handling.
- The docs' `deleteSerialized: async () => window.localStorage.clear()` (and `AsyncStorage.clear()`, and the `ClassPersistor` JSDoc) wipe all the app's storage, not just the saved state.
- Two `logOut`s running at once can run their initial-state saves at the same time. Same state, so harmless.
- A class that calls `Object.freeze(this)` in its constructor comes back from `ESSerializer` with the constructor's default values. This is intentional (there's a test for it), but the user docs don't warn about it.
- If a condition function itself dispatches or calls a wait, a wait it registers while `_registerState` or `_checkAllActionConditions` rebuilds the condition list could be lost.
- `describeStateChange` overflows the stack on a state with cycles. Inside `_registerState` that's caught, but a direct call throws.
- If `dispatchSync` gets an action with `retry` and a sync reducer, the error message says "'reduce' method returned a Promise", which is misleading.
- `CHANGELOG.md:38-39` says that with `onTimeout` "the wait resolves with `null`". In fact `waitActionCondition` and `waitAllActions` resolve with `{actions, triggerAction: null}`, and `waitAllActionTypes` with `void`. The JSDoc is correct.
- The `PersistAction` docs say it is "ignored" while a save is in progress. In fact the state is saved later, respecting the throttle. No harm.
- The shipped `.d.ts.map` files point to `src/`, which is not published.
- Docs, minor or not run:
  - `action-status.md:298, 310-318` don't say that `isCompleted` stays `false` forever for a dispatch aborted before running, nor that `isCompletedFailed` is also `true` for every `AbortDispatchException` (the JSDoc says it).
  - `wait-for-condition.md:443-445` says `completeImmediately` defaults to `false`, but inside actions `this.waitActionType`/`waitAllActionTypes` default to `true` (`src/KissAction.ts:3157, 3270`). Line 37 calls `waitCondition(...)` as a free function, which is not exported.
  - `persistor.md:546-571` doesn't say that `logOut()` rejects when the delete or save fails, or that it throws before `store.ready()`.
  - `testing-user-exceptions.md:34-35` says `wrappedError` is the error after `wrapError`. It is also changed by the `errorObserver`.
  - `internet-features.md:100`: `NetInfo.fetch().then(s => s.isConnected)` may be `null`, so probably not a `Promise<boolean>`.
  - `optimistic-features.md:839-855`: "The request in flight ... won't send a follow-up" refers to a request that already finished. Lines 685-707 don't say which device sent the push; if it's this device's own echo, the code does the opposite of the diagram. Line 672 says pushes don't increment the local revision, but a self-echo can raise it.
  - `basics/user-exceptions.md:87` says "All UserException errors" open a dialog, but not those with `noDialog`.
  - `creating-the-state.md:74` and `sync-actions.md:294` describe `isEmpty` as filter-aware, but the code ignores the filter. `log-and-metrics.md:6` says `actionObservers` (plural). `useDispatchSync` and `useDispatcher` (deprecated) are exported but not documented. `StoreDispatchers` has a public `store` property, although the `useStore` JSDoc says the state is "NOT available".
  - The CodeSandbox embeds in the tutorial and homepage may use the old API. Not checked.

### Checked and found OK

- **Dispatch:** sync and async `dispatch`/`dispatchAndWait`, errors rejecting or being swallowed as documented, `abortDispatch`, mocks (including mocked as `null`), the "already dispatched", "not ready" and shutdown checks (in the right order for `dispatch`, `dispatchAndWait` and `dispatchSync`), and the user exception queue (order, `showUserException` throwing, `noDialog`).
- **Status and waiting:** `isWaiting` (including subclasses and abstract bases), `isFailed`, `exceptionFor`, `clearExceptionFor`, and no in-progress leaks on any error path tried (apart from bug 10).
- **Retry:** attempt counts, the delay sequence and its cap, `unlimitedRetries`, `{on: false}`, re-injection on re-dispatch, a custom `wrapReduce` called on each attempt, and stopping on clear, shutdown or `isOld`.
- **Control features:** sequential with unlimited retry and clear; fresh keys removed when aborted or failed; `ignoreOld` numbering, release, and combination with debounce, retry, throttle and fresh; expired throttle locks and fresh keys cleaned up; `abortDispatch` runs before a lock or key is taken; no empty sequential queues left behind. The compatibility matrix in `action-features.md` matches every `_injectStore`/`_validate*` check.
- **nonReentrant and OptimisticCommand:** keys compared by content, subclasses not blocked, keys shared and held across retries, rollback only when the value is still the optimistic one, no optimistic value applied without internet, the order and errors of rollback/reload/applying the response, and the incompatible-feature checks.
- **OptimisticSync / OptimisticSyncWithPush:** the `maxFollowUpRequests` boundary, the key released on every path, synchronous throws of `sendValueToServer`, the response applied only when the state is stable, the follow-up decision, own echo before or after the response, stale-response rejection, and `informServerRevision` validation.
- **Wait helpers:** conditions and timers are removed on success, on timeout and when the condition throws. `onTimeout`, `Infinity` and long timeouts, the default timeout, `completeImmediately`, the returned `actions` snapshot and `triggerAction`, resuming only after `after()` ran, and inside actions ignoring the action itself.
- **Hooks:** under `React.StrictMode`, `useDispatch`'s `onMount`/`onDepsChange`/`onUnmount` run once, `useSelect`/`useObject`/`useAllState` update and unsubscribe after unmount, and `useIsStoreReady` works with a slow persistor. Stable hook functions, a changing selector, and a selector that throws in a zombie child are all fine. No hook leaks after unmount. All `useDispatch`, `useObject` and `useStore` examples from the docs, README and CHANGELOG type-check.
- **UserException:** the builders keep the subclass and its fields, don't change the original, and chain callbacks in order. `withMessage` updates `toString` and the first line of the stack.
- **Persistence:** the throttle is respected and the final state is always saved, saves don't overlap (except in bug 1), the newest state is saved after a slow save, and after a failed save the next diff uses the last state really saved. `ready()` never rejects. Pausing and resuming with a pending throttle timer, overlapping `persistAndPause` calls, `resumePersistor` during logOut and before `ready()`, and `ifPersists=false` with a pending timer, a running save or after a failed save.
- **ESSerializer:** round-trips of `Date` (including invalid ones), `Map` (with `NaN`, `undefined`, `BigInt` and object keys), `Set`, typed arrays (including partial views and `NaN`/`-0`/`Infinity`), `undefined`, `Error`s and their subclasses (including `cause`), subclasses of `Map`/`Set`/`Date`/`Array` (including sparse arrays), inherited user classes, a class with `toJSON`, special keys (`*type`, `**value`, `''`), `String`, `Number` and `Boolean` objects, and `Intl` formatters. Prototype pollution through `__proto__` and `constructor.prototype` is blocked, only registered classes are constructed, and circular references throw a clear error.
- **Docs:** `tutorial/full-code.md` compiles and works when rendered. The README examples compile (except bug 26). The other examples of the basics, control-features, internet, optimistic, persistor, wrapping-the-reducer and before-and-after pages compile, and behave as described. `linter.md` is consistent with `eslint-plugin/`.
- **Build (previous review, not re-checked):** `npm run build` works. ESM `import()` and CJS `require()` both load and export the same names. The `.d.ts` files compile with `skipLibCheck: false` under `node16`, `nodenext`, `bundler` and `node10`, on TS 5.0 and TS 6.0. Everything the README and JSDoc tell users to import is exported.
