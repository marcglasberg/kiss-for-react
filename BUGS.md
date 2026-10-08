# Bug report: kiss-for-react 1.1.0

Reviewed: everything in `src/`, plus the build config, the test suite, and the docs at https://kissforreact.org/ (including `kiss-state-management-docs.md`, dated 2025-10-27).

**How each bug was checked:**

- **Reproduced:** a small failing test or script shows the bug happening. All repros were run against the current working tree, using Node 24.5, React 19.1 and TypeScript 4.8.4.
- **Code reading:** the bug comes from reading the code only. No repro was run.

The **Docs** line in each bug shows what kissforreact.org promises, when the docs mention it. An entry in the *Docs say* column of the summary table means the docs promise behavior that the code does not deliver.

The **Has BDD tests** column says whether a test in `__tests__/` checks for the bug, so it would catch it coming back. **Yes** means a test targets the bug directly. **Partial** means existing tests touch the bug, or fail because of it, without testing it on purpose. **No** means no test covers it.

---

## Summary

| #  | Severity | Area | Bug | Docs say | Checked | Has BDD tests |
|----|----------|------|-----|----------|---------|---------------|
| 1  | High   | Types | `logger` and `logStateChanges` are required, so `createStore({ initialState })` does not compile. The whole test suite fails to compile too. | Both are optional | **Fixed** | Yes |
| 2  | High   | Build | The ESM build cannot be loaded (Node ESM, Vitest, webpack 5) | — | **Fixed** | Not applicable |
| 3  | High   | Persistence | `logOut()` never resets the store state | "your initial store state will be restored" | **Fixed** | Yes |
| 4  | High   | Persistence | `logOut()` leaves the persistor paused for good. Nothing is saved after logout. | — | **Fixed** | Yes |
| 5  | High   | Persistence | `store.logOut()` returns before the logout work is done | Shown with `await` | **Fixed** | Yes |
| 6  | High   | Persistence | A failed `persistDifference` crashes Node (unhandled rejection), and the unsaved state is marked as saved | — | **Fixed** | Yes |
| 7  | High   | ClassPersistor | A state containing a `Map` can never be read back, so all saved state is wiped at the next start | — | **Fixed** | Yes |
| 8  | Medium | ClassPersistor | Classes are matched by `constructor.name`, so minified class names collide or change between builds | — | **Fixed** | Yes |
| 9  | Medium | Persistence | `PersistAction` does nothing | "call persistDifference() right away" | **Fixed** | Yes |
| 10 | Medium | Persistence | Reading the saved state at startup races with early dispatches. The JSDoc and the website disagree on setup, and following the JSDoc reads the state twice. | — | **Fixed** | Yes |
| 11 | High   | Retry | Retry delays are always 0 ms, not 350/700/1400 ms | "350 millis, 700 millis, and 1.4 seg" | **Fixed** | Yes |
| 12 | Low    | Retry | `retry = {on: false}` still retries. `unlimitedRetries` is ignored. `multiplier <= 1` is silently replaced by 2. | — | **Fixed** | Yes |
| 13 | High   | Hooks | `useSelect` keeps using the first selector it got, so prop changes are ignored | — | **Fixed** | Yes |
| 14 | High   | Hooks | `useSelect` misses state changes made between render and subscribe (for example, a child dispatching on mount) | — | **Fixed** | Yes |
| 15 | High   | Hooks | "Zombie child": a selector that throws makes the action fail, and skips persistence and wait conditions | — | **Fixed** | Yes |
| 16 | Medium | Hooks | `useDispatch()` (and the other hooks that return functions) returns a new function on every render, which causes effect loops | — | **Fixed** | Yes |
| 17 | Low    | Hooks | `useIsWaiting(BaseClass)` does not re-render when a subclass action starts | — | **Fixed** | Yes |
| 18 | Medium | Actions | An `after()` that is `async` and throws crashes Node, and fails the repo's own test suite | "the error will be swallowed, but logged" | **Fixed** | Yes |
| 19 | Medium | Actions | `nonReentrant` is skipped by `dispatchAndWait` and `dispatchSync` | "prevent an action from being dispatched while it's already running" | **Fixed** | Yes |
| 20 | Medium | Actions | Dispatch throws when an action has a circular or BigInt field (from `toString`), even with logging turned off | — | **Fixed** | Yes |
| 21 | Medium | Actions | `checkInternet` always fails on React Native | JSDoc: "for other environments it returns true" | **Fixed** | Yes |
| 22 | Medium | Actions | `OptimisticUpdate` swallows the save error, and its rollback overwrites the value reloaded from the server | "a notification can inform the user" | **Fixed** | Yes |
| 23 | Medium | UserException | `withTitle`, `withMessage`, `withDialog`, `noDialog`, `withHardCause` and `withErrorText` lose `onOk`, `onCancel` and `props` | — | **Fixed** | Yes |
| 24 | Medium | Wait | `waitActionCondition` is not checked when an action is dispatched | "checked when some action is dispatched or finishes" | **Fixed** | Yes |
| 25 | Medium | Wait | `store.waitAnyActionTypeFinishes([X])` throws a TypeError | Documented call is exactly this | **Fixed** | Yes |
| 26 | Medium | Testing | `store.mocks.add(Type, null)` makes every dispatch of `Type` throw | Documented form | **Fixed** | Yes |
| 27 | Low    | Wait | Timeout timers are never cleared, and conditions stay registered after a timeout | — | Reproduced | No |
| 28 | Low    | Wait | `dispatchWhen` produces an unhandled rejection after 10 minutes | — | Code reading | No |
| 29 | Low    | Exports | `TimeoutException` is not exported. Its stack trace is also empty. | "modify TimeoutException.defaultTimeoutMillis" | Reproduced | No |
| 30 | Low    | Logging | `describeStateChange` ignores every nested change | — | Reproduced | No |
| 31 | Low    | Actions | `getLog` is a getter, but the docs call `action.getLog()` | `action.getLog()` | Code reading | No |
| 32 | Low    | Actions | A sync reducer that returns `undefined` sets the whole state to `undefined` | — | Reproduced | No |
| 33 | Low    | Dispatch | `dispatchAndWait` errors behave differently for sync and async actions | — | Code reading | No |
| 34 | Low    | Dispatch | Calling `dispatchAndWait` again on an action that is still running makes the first promise hang forever | — | Code reading | No |
| 35 | Low    | Store | `Store.log` is static, so creating any new store replaces the logger of all stores | — | Code reading | No |
| 36 | Low    | Persistence | `persistAndPausePersistor()` returns `void`, so callers cannot wait for the save | — | **Fixed** | Yes |
| 37 | Low    | Retry | The JSDoc says retrying makes sync actions async, but sync reducers with retry always fail | — | Reproduced (existing test) | Partial |
| 38 | Low    | Actions | In the ESM build, every action's `toString()` prints `checkInternet:undefined`. This fails 3 test suites. | — | Reproduced | Partial |
| 39 | Medium | Persistence | A state change made while the store is still loading the persisted state at startup can be overwritten on disk by the initial-state. | — | **Fixed** | Yes |

There is also a list of mismatches between the docs and the API, and of test-suite problems, at the end.

---

## High severity

### 1. `logger` and `logStateChanges` are required in the TypeScript types

**Status: fixed.** Both fields are now optional (`logger?:` and `logStateChanges?:` in `src/Store.tsx`). `tsc` passes for the ESM and CJS configs, and `npx jest` no longer reports TS2345. The docs at kissforreact.org were already correct, so they need no change. For the failures this fix exposed, see test-suite item 1.

**Where:** `src/Store.tsx:96` and `src/Store.tsx:113`. The published types are in `lib/*/types/Store.d.ts`.

```ts
interface ConstructorParams<St> {
  ...
  logger: (obj: any) => void;      // not optional
  logStateChanges: boolean;        // not optional
```

**Docs:** "Most are optional, but you must at least provide the initial state: `createStore<State>({ initialState: ... })`". The JSDoc also says "if you don't define a logger yourself, the default is ... `console.log()`" and that `logStateChanges` "is true (turned on) by default". The constructor already handles both being missing (`logger || this._defaultLogger`, `logStateChanges ?? true`).

**Impact:**

- Every TypeScript user hits `TS2345: Property 'logStateChanges' is missing...` when following the docs. The repo's own examples hit it too, for example `examples/todo-app-example/src/infra/App.tsx`.
- **The whole Jest suite fails to compile.** `npx jest` reports every `bdd.*` suite as failed with this error, so no test in the repo currently runs. This has been true since the initial commit.

**Fix:** use `logger?:` and `logStateChanges?:`.

---

### 2. The ESM build cannot be loaded

**Where:** `package.json` → `build:esm`, and `tsconfig.esm.json`.

The ESM build renames only `lib/esm/index.js` to `index.mjs`. The other files stay `.js` (the package has no `"type": "module"`), and every import inside them has no file extension (`from './Persistor'`).

**Repro:**

```
$ node --input-type=module -e "import('./lib/esm/index.mjs')"
ERR_MODULE_NOT_FOUND Cannot find module '...\lib\esm\Persistor' imported from ...\lib\esm\index.mjs
```

**Impact:**

- Anything that loads the `"import"` condition with Node's native ESM fails. That includes SSR, and Vitest, which leaves `node_modules` packages to Node's own loader.
- Webpack 5 treats `.mjs` files as `fullySpecified`. By that rule it should also refuse the extensionless imports with "failed to resolve only because it was resolved as fully specified". That was not run here.
- Even with extensions added, the `.js` files would be loaded as CommonJS, because there is no `"type": "module"`.

**Fix:** pick one:

- Emit `.mjs` files with explicit extensions (`moduleResolution: "NodeNext"` and `.js` in the import paths).
- Put `{"type":"module"}` in `lib/esm/package.json` and add extensions.
- Use a bundler (tsup or rollup) to ship a single ESM file.

---

### 3. `logOut()` never resets the store state

**Where:** `src/ProcessPersistence.ts:133` and `src/ProcessPersistence.ts:157-163`.

```ts
store.setShutDown(true);                                                     // line 133
...
store.dispatchSync(new UpdateStateAction((state: St) => initialState));     // line 157
...
store.setShutDown(false);                                                    // line 163
```

`dispatchSync` returns at once when the store is shut down (`Store.tsx:773-776`, which logs "Can't dispatch action ... because the store is shut down."). The store is still shut down at line 157, so the reset is silently dropped.

**Docs:** "When this function returns, your initial store state will be restored to its initial state."

**Repro:**

```ts
store.dispatch(new Inc()); store.dispatch(new Inc());            // count = 2
await store.logOut({ store, initialState: new State(0), throttle: 20, actionsThrottle: 20 });
await delay(100);
store.state.count   // 2  ← still the logged-out user's data
persistor.saved     // State(0)  ← disk was reset
```

**Impact:** after logout, the logged-out user's data stays in memory and on screen, while storage holds the initial state. This is a privacy and correctness problem, and memory and disk no longer agree.

**Fix:** call `store.setShutDown(false)` before the reset dispatch. Or set the state through an internal method that does not check `_shutDown`.

---

### 4. `logOut()` leaves the persistor paused for good

**Where:** `src/ProcessPersistence.ts:127`. `this.pause()` is called, and `resume()` is never called afterwards.

**Repro:** after `logOut`, `_processPersistence.isPaused === true`. New state changes are never saved until the app restarts or someone calls `resumePersistor()`. The docs never say logout does this.

**Fix:** call `this.resume()` (or set `this.isPaused = false`) at the end of `logOut`, after the initial state is saved.

---

### 5. `store.logOut()` does not wait for the logout to finish

**Where:** `src/Store.tsx:1546`.

```ts
async logOut(...) {
  this._processPersistence?.logOut({...});   // missing `await` / `return`
}
```

**Docs:** show `await store.logOut({...})`, and say "When this function returns, your initial store state will be restored".

**Repro:** with `throttle: 200`, `await store.logOut(...)` returns after **0 ms**.

When a save is in progress, the logout is re-tried later through `finishedPersistingCallback`. `ProcessPersistence.logOut` itself returns before that happens, so even with the `await` added, the caller cannot know when logout ends in that case.

There is also an API issue. The parameter type requires `store: Store<St>`, which `Store.logOut` ignores (it passes `this`). The docs example leaves it out, so it does not compile.

**Fix:** `return this._processPersistence?.logOut(...)`. In the "already persisting" branch, return a promise that settles when the retried logout finishes. Remove `store` from the public signature.

---

### 6. A failed save crashes Node, and the unsaved state is marked as saved

**Where:** `src/ProcessPersistence.ts:215` (`this._persist(now, newState).then();`) and `src/ProcessPersistence.ts:242-265`.

```ts
try {
  await this.persistor.persistDifference(this.lastPersistedState, newState);
} finally {
  this.lastPersistedState = newState;   // set even when the save threw
  ...
}
```

**Repro (plain Node, `lib/cjs`):** a `persistDifference` that throws `new Error('disk full')`:

```
Error: disk full
node exit code: 1          ← the process is killed (unhandled rejection)
```

Inside Jest, `lastPersistedState.count === 1` while the disk still holds `0`. Nothing triggers another try.

**Impact:**

- On Node or Electron, and wherever unhandled rejections are fatal, one storage error kills the process.
- Everywhere else, the state that failed to save is treated as saved and never retried. Persistors that save only diffs will then compute later diffs against data that is not on disk.

**Fix:** catch the error and log it (or report it through the `errorObserver`). Update `lastPersistedState` only on success.

**Fixed** (following async_redux): the state is marked as saved only when `persistDifference` succeeds, and save errors are never rethrown. Like async_redux, a failed save is not retried on a timer. It is retried the next time the state changes. Errors go through the new `Persistor.wrapError` (which can return `null` to swallow the error). They then go to the `errorObserver` with a `null` action, or are logged if there is none. A `UserException` is shown to the user. Persistors can also report errors with `Persistor.addError` without throwing, and errors from `readState` now go to the `errorObserver` too. `saveInitialState` now defaults to `persistDifference(null, state)`. Tests: `__tests__/bdd.PersistorErrors.test.ts`.

---

### 7. `ClassPersistor` cannot handle a `Map`, so saved state is wiped at the next start

**Where:** `src/Esserializer/serializer.ts:74` (`appendClassInfoAndAssignDataForBuiltinType`). It handles `Set`, `Date`, typed arrays and others, but not `Map`.

A `Map` is written as `{"ess_cn":"Map"}`, without its entries. On read, the deserializer throws `Class "Map" not found during deserialization` (`deserializer.ts:87`).

**Repro:**

```ts
class S { m = new Map([['a', 1]]); }
ESSerializer.deserialize(ESSerializer.serialize(new S()));
// Error: Class "Map" not found during deserialization...
```

**Impact:** at startup, `ProcessPersistence.readInitialState` catches that error, logs "State will reset", **deletes the saved state**, and starts from the initial state. Any app whose state holds a `Map` loses all saved data on every restart. Registering `Map` by hand only turns this into an empty `Map`, because the entries were never written.

**Fix:** add `Map` support (store its entries as an array of `[key, value]` pairs), the same way `Set` is handled.

**Fixed:** a `Map` is now saved with its entries, as an array of `[key, value]` pairs, the same way `Set` is handled (`src/Esserializer/serializer.ts` and `deserializer.ts`). Keys and values keep their types, including custom classes and nested `Map`s. A `Map` saved by an older version, without its entries, is read back as an empty `Map` instead of failing, so the rest of the saved state is no longer deleted. Tests: `__tests__/bdd.ClassPersistorMap.test.ts`.

---

### 11. Retry delays are always 0 ms

**Where:**

- `src/KissAction.ts:553`: `currentDelay: 0`
- `src/Store.tsx:1132-1134`:

```ts
retry.currentDelay = (retry.currentDelay == null)
  ? retry.initialDelay
  : retry.currentDelay! * _multiplier;      // 0 * 2 = 0, forever
```

`currentDelay` starts at `0`, not `null`/`undefined`, so `initialDelay` is never used.

**Docs:** "the default delays are: 350 millis, 700 millis, and 1.4 seg".

**Repro:** an action with `retry = { maxRetries: 3 }` that always throws. The measured gaps between attempts were `[1, 7, 1]` ms.

**Impact:** retries happen back to back. That does not help with temporary failures, and with `maxRetries: -1` it can hammer a failing backend in a tight loop. The existing retry tests pass only because they never measure timing.

**Fix:** `RetryOptions.currentDelay` now starts as `null` (typed `number | null`), so the first retry waits `initialDelay`, and each later one multiplies it, up to `maxDelay`.

**Tests:** `__tests__/bdd.RetryDelays.test.ts` measures the gaps between attempts: the default 350/700/1400 ms, a custom `initialDelay` and `multiplier`, and the `maxDelay` cap.

---

### 13. `useSelect` keeps using the first selector it got

**Where:** `src/Hooks.tsx:20-55`, and `_useStoreSelector` at `src/Hooks.tsx:312-347`.

The selector is captured once, in `useEffect(..., [])`. The returned `value` only changes when the store calls `setValue` with the result of that original selector.

**Repro:**

```tsx
const Item = ({ id }) => <>{useSelect((s: State) => s.items[id])}</>;
// render <Item id={0}/> → "a";  re-render <Item id={1}/> → still "a" (should be "b")
// later state changes still run the id=0 selector
```

**Impact:** any selector that depends on props or local state shows wrong data, and never corrects itself. Examples are list items, detail pages, and filters. The same applies to `useIsWaiting(type)`, `useIsFailed(type)` and `useExceptionFor(type)` when `type` changes.

**Fix:** use `useSyncExternalStore` (React 18+), which handles changing selectors, missed updates (#14) and zombie children (#15). At least, update `ref.current`'s selector on every render and recompute the value when the selector changes.

**Fixed:** `useSelect` and the store-based hooks (`useIsWaiting`, `useIsFailed`, `useExceptionFor`) now share `useSubscribedSelector` in `src/Hooks.tsx`. It runs the selector passed in the current render on every render, so the returned value always matches the latest props. After each commit, a `useLayoutEffect` updates the ref with the latest selector and selected value, so later state changes are checked with the new selector. The store now re-renders the component with a force-render (`useReducer`) instead of a `useState` setter, which could wrongly skip the re-render when its stored value was stale. #14 and #15 were fixed afterwards. Tests: `__tests__/bdd.UseSelectChangingSelector.test.ts` (uses the new dev dependency `react-test-renderer`).

---

### 14. `useSelect` misses changes made between render and subscribe

**Where:** `src/Hooks.tsx:27-45`. The value is read during render (`useState(() => selector(store.state))`), but the component only subscribes later, in `useEffect`. React runs child effects **before** parent effects.

**Repro:**

```tsx
const Child = () => { const d = useDispatch(); useEffect(() => { d(new Inc()); }, []); return null; };
const Parent = () => { const count = useSelect((s: State) => s.count); return <>{`count=${count}`}<Child/></>; };
// after mount: store.state.count === 1, UI shows "count=0"
```

**Impact:** components can show stale state until some *later* change happens to their selected slice. Dispatching on mount is very common, so this happens a lot.

**Fix:** use `useSyncExternalStore`. Or, after subscribing in the effect, re-run the selector and call `setValue` if the result differs from the value captured at render.

**Fixed:** right after subscribing, `useSubscribedSelector` (`src/Hooks.tsx`) runs the latest selector again on the current store. If the result differs from the value it rendered, or if the selector throws, it re-renders the component. Tests: `__tests__/bdd.UseSelectSubscription.test.ts`.

---

### 15. "Zombie child": a selector that throws makes the action fail

**Where:** `src/Store.tsx:305-316` (`_rebuildFromStateHooks`), called from `_registerState` at `src/Store.tsx:1312`.

Selectors run synchronously inside `_registerState`. This happens after `this._state = newState`, but before:

- the state observer,
- `_actionsInProgress` cleanup,
- the wait-condition checks,
- persistence.

If a selector throws, the exception escapes `_registerState`.

**Repro:** a list where each item component selects `s.items[id].toUpperCase()`, and a `RemoveLast` action:

```
store.dispatch(new RemoveLast())  → throws TypeError: Cannot read properties of undefined (reading 'toUpperCase')
store.state.items                 → ['a']          (the state DID change)
action.status.isCompletedFailed   → true           (but the action is reported as failed)
```

**Impact:** deleting an item while a component that selects it by id is still mounted is a common case. When it happens:

- the action is reported as failed and the error is rethrown to the caller (or sent to the `errorObserver`);
- **the state change is not persisted;**
- `waitCondition` is not checked;
- the remaining hooks are not notified.

**Fix:** wrap each selector call in try/catch. On error, force that component to re-render (react-redux does this), and keep going with the other hooks. `useSyncExternalStore` handles this case too.

**Fixed:** `_rebuildFromStateHooks` and `_rebuildFromStoreHooks` (`src/Store.tsx`) now wrap each selector call in try/catch. When a selector throws, they force that component to re-render and go on with the other hooks. The action no longer fails, and the state observer, persistence and wait conditions all run as normal. When the component re-renders, the selector runs again with the latest props. A zombie child is usually unmounted by its parent in the same render. If the selector still throws, the error goes to React (and to any error boundary), like any other render error. Tests: `__tests__/bdd.UseSelectSubscription.test.ts`.

---

## Medium severity

### 8. `ClassPersistor` matches classes by `constructor.name`

**Where:** `src/Esserializer/deserializer.ts:386` (`const className: string = c.name;`), and `serializer.ts:75` (`target.__proto__.constructor.name`).

**Repro:** two different classes that are both named `e` (what minifiers produce):

```
deserialize(serialize(new A())) instanceof A → false, instanceof B → true
```

**Impact:** production builds with name mangling can break in two ways. Terser defaults to `keep_classnames: false`, so it applies to webpack, Metro and others, depending on their settings.

- (a) Classes collide, and objects are rebuilt as the wrong class.
- (b) Minified names change between app versions. Saved state then fails to load, and is **deleted**, as in #7.

The repo already warns about this in `StoreException.ts` ("`constructor.name` cannot be used with bundlers that mangle class names"), but `ClassPersistor` does not.

**Fix:** let users register classes under explicit, stable string keys (for example `classesToSerialize: { Todo: TodoClass }`). At minimum, document `keep_classnames` and throw when two registered classes share a name.

**Fixed:** a state class may declare `static readonly typeName = 'Todo'`, which is used instead of its class name (it's not inherited by subclasses). When created, `ClassPersistor` throws a `StoreException` if class names are minified (detected because `ClassPersistor.name` itself was mangled, or because some class name starts with a lowercase letter) and a class has no `typeName`, and also if two classes resolve to the same name. Tests: `__tests__/bdd.ClassPersistorClassNames.test.ts`. Docs: the "Class names and minification" section of the persistor page on kissforreact.org.

---

### 9. `PersistAction` does nothing

**Where:** `src/Persistor.tsx:182-186`, and `src/Store.tsx:1085-1088`.

`PersistAction.reduce()` returns `null`. A `null` result exits `_runFromStart` before `_registerState`, so `ProcessPersistence.process()` is never called. The `action instanceof PersistAction` check at `ProcessPersistence.ts:212` can never be reached.

**Docs:** "dispatch(new PersistAction()) ... This will ignore the throttle period and call persistDifference() right away".

**Repro:** with a throttle of 10 s, dispatch `Inc` and then `PersistAction`. `persistDifference` call count stays `0`.

**Fix:** handle `PersistAction` in the store (call `_processPersistence.process(action, this._state)` even when the reducer returns `null`). Or give `ProcessPersistence` a `persistNow()` method.

**Status: Fixed.** When an action's reducer returns `null` (or the unchanged state), the store now checks for `PersistAction` (`Store._processPersistAction`) and calls `ProcessPersistence.process(action, state)`, so the state is persisted right away, ignoring the throttle, and any pending throttle timer is cancelled. Nothing is persisted when there is nothing new, or while the persistor is paused. BDDs: `__tests__/bdd.PersistAction.test.ts`.

---

### 10. Startup read of the saved state races with early dispatches

**Where:**

- `src/Store.tsx:609-611`: the constructor starts `readInitialState(...).then()` and drops the promise.
- `src/ProcessPersistence.ts:23-60`.
- The JSDoc at `src/Persistor.tsx:4-25`.

The JSDoc says to call `persistor.readState()` yourself and pass the result as `initialState`. The website says Kiss reads it for you ("will be called only once per run ... during the store creation").

Following the JSDoc means the state is read **twice**. Either way, the asynchronous read inside the constructor later dispatches `UpdateStateAction(saved)`. That **overwrites any state change dispatched before the read finishes**, because with the default 2 s throttle those changes are not saved yet.

**Repro:** saved state `count=10`, setup as in the JSDoc, `dispatch(new Inc())` right after `new Store(...)`. The state goes `11` → `10`, and `readState` was called twice.

**Fix:**

- Fix the JSDoc to match the website.
- Expose a promise users can wait on (for example `store.ready` / `await store.waitPersistedStateLoaded()`).
- Or queue and replay dispatches made before the read finishes, or merge them in.

**Fixed:** added `store.ready()`, a promise that resolves when the store finishes its startup work (for now, loading the saved state). It never rejects, and it always returns the same promise. The initial state stays as a placeholder the UI can show while loading. The rule "changes made before `ready()` may be overwritten" is now documented. The JSDoc now matches the website (don't read the state yourself). BDDs are in `__tests__/bdd.StoreReady.test.ts`.

---

### 16. `useDispatch()` and similar hooks return a new function on every render

**Where:** `src/Hooks.tsx:130-133` (`useStore` → `new StoreDispatchers`) and `src/Hooks.tsx:163-166` (`store.dispatch.bind(store)`). The same applies to `useDispatchAndWait`, `useDispatchAll`, `useDispatchSync`, `useDispatchAndWaitAll` and `useClearExceptionFor`.

**Repro:**

```tsx
const dispatch = useDispatch();
const count = useSelect((s: State) => s.count);
useEffect(() => { dispatch(new Inc()); }, [dispatch]);   // what eslint's exhaustive-deps asks for
```

Each dispatch triggers a re-render, which creates a new `dispatch`, which runs the effect again. In the repro this looped until a guard stopped it at 50 runs. Without the guard it never stops. react-redux's `useDispatch` returns a stable function, so users expect the same here.

**Fix:** bind once in the `Store` constructor (`this.dispatch = this.dispatch.bind(this)` and so on), and return those functions. For `useStore`, wrap the result in `useMemo(() => new StoreDispatchers(store), [store])`.

**Fixed:** `useDispatch`, `useDispatcher`, `useDispatchAndWait`, `useDispatchAndWaitAll`, `useDispatchAll`, `useDispatchSync`, `useClearExceptionFor` and `useStore` in `src/Hooks.tsx` now memoize what they return with `useMemo(..., [store])`, so they return the same function (or `StoreDispatchers`) on every render, and a new one only if the store changes. The `Store` methods were not bound in the constructor, to keep `Store` unchanged. #17 is not related (it is about which actions re-render `useIsWaiting`, not about function identity), so it was not changed. Tests: `__tests__/bdd.StableHookFunctions.test.ts`.

---

### 18. An `after()` that is `async` and throws crashes Node

**Where:** `src/Store.tsx:1009-1013`. `try { action.after(); } catch ...` only catches errors thrown synchronously.

`after(): void` can legally be overridden as `async after()`, because TypeScript accepts `Promise<void>` where `void` is expected. Its rejection then becomes an unhandled rejection.

**Docs:** "If it does [throw], the error will be swallowed, but logged with Store.log()."

**Repro (plain Node, `lib/cjs`):** `async after() { throw new Error('after failed'); }` → `Error: after failed`, and **node exit code 1**.

The repo's own `__tests__/bdd.DispatchAndWait.test.ts` (scenario "The action fails in the 'after' method") uses `async after()`, and **the suite fails for this reason**: "Test suite failed to run — UserException: After failed".

**Fix:** if `after()` returns a thenable, attach `.catch(e => Store.log(...))`.

**Fixed:** `_processWrapsFinally` in `src/Store.tsx` now checks if `after()` returned a thenable. If it did, it adds a rejection handler that logs the error with `Store.log()`, the same way a sync error is logged. The action still completes OK. `hasFinishedMethodAfter` is still set right away, because an async `after()` is not awaited. The existing scenario "The action fails in the 'after' method" in `__tests__/bdd.DispatchAndWait.test.ts` now passes. BDDs are in `__tests__/bdd.AsyncAfter.test.ts`.

---

### 19. `nonReentrant` is skipped by `dispatchAndWait` and `dispatchSync`

**Where:** `src/Store.tsx:646`. Only `dispatch()` checks `nonReentrant`. `dispatchAndWait` (`670-694`) and `dispatchSync` (`772-793`) do not. `KissAction.dispatchAndWait()` inside actions doesn't check it either.

**Docs:** "To prevent an action from being dispatched while it's already running, add nonReentrant = true".

**Repro:** with one `NR` already running, two `dispatchAndWait(new NR())` calls run the reducer three times in total, where one was expected.

**Fix:** move the `abortDispatch` / `nonReentrant` check into one shared helper that all three methods call. When `dispatchAndWait` is aborted this way, it should still return a resolved `ActionStatus`.

**Status: Fixed.** `Store._mustAbortDispatch()` now runs the `abortDispatch()` and `nonReentrant` checks, and `dispatch`, `dispatchAndWait` and `dispatchSync` all call it. An aborted `dispatchAndWait` resolves right away with an `ActionStatus` where `isDispatched` is false. `KissAction.dispatchAndWait()` and `KissAction.dispatchSync()` call the store, so they are fixed too. An action that calls `this.dispatchAndWait()` on its own type no longer waits for itself forever. BDDs: `__tests__/bdd.NonReentrant.test.ts`.

---

### 20. Actions with circular or BigInt fields cannot be dispatched

**Where:** `src/KissAction.ts:1241-1255` (`toString` uses `JSON.stringify` on every field). It is called unconditionally by `Store.log(`${this._dispatchCount}) ${action}`)` at `src/Store.tsx:833`.

**Repro:**

```ts
const circular: any = {}; circular.self = circular;
store.dispatch(new A(circular)); // TypeError: Converting circular structure to JSON
store.dispatch(new A(10n));      // TypeError: Do not know how to serialize a BigInt
```

**Impact:**

- Any action carrying a DOM node, a class instance with back-references, or a BigInt is impossible to dispatch.
- Setting `logger: () => {}` does not help, because the template string is built before `log` is called.
- `toString` also prints `checkInternet` and other inherited fields.

**Fix:** wrap `JSON.stringify` in try/catch, with a fallback to `String(value)` or `[object]`. Better, only build the log string when logging is turned on.

**Status: Fixed.** `toString()` now describes each field with `KissAction._describeValue()`, which never throws: BigInts print as `10n` (also when nested), and values `JSON.stringify` cannot handle (circular, or a throwing `toJSON`) fall back to `String(value)`, then `[object]`. Tests: `__tests__/bdd.ActionToString.test.ts`. (The inherited `checkInternet` field still prints; that is bug 38.)

Logging can now also be turned off for real: `logger: null` (new; the docs now recommend it over `logger: () => {}`) makes Kiss skip building its log messages. Messages that describe an action (`${action}`) are now built lazily through the internal `Store._logLazy()`, so with `logger: null` no `toString()` runs at dispatch, and `logStateChanges` skips `describeStateChange()`. An empty logger function still works, but still builds the messages. Tests: `__tests__/bdd.LoggingOff.test.ts`.

---

### 21. `checkInternet` always fails on React Native

**Where:** `src/KissAction.ts:133-140`.

```ts
const isWebEnvironment = typeof window !== 'undefined' && 'navigator' in window;
return Promise.resolve(isWebEnvironment ? navigator.onLine : true);
```

React Native defines `window` (as `global`) and `navigator` (as `{ product: 'ReactNative' }`), but **not** `navigator.onLine`. The check resolves to `undefined`, which counts as offline, so every action with `checkInternet` throws "No Internet".

The JSDoc says "for other environments it returns true". The website does tell React Native users to override `hasInternet`.

**Repro:** with `global.window = global` and `global.navigator = { product: 'ReactNative' }`, an action with `checkInternet = { dialog: false }` fails with `UserException: No Internet`.

**Fix:** `typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true`.

**Status: Fixed.** The default `hasInternet()` now uses `navigator.onLine` only when it is a boolean (the browser), and otherwise assumes the device is online (Node.js, React Native). Tests: `__tests__/bdd.CheckInternetEnvironment.test.ts` (React Native, browser online/offline, and no `window`).

---

### 22. `OptimisticUpdate` swallows the save error, and its rollback overwrites the reloaded value

**Where:** `src/KissAction.ts:1559-1586`.

```ts
try { await this.saveValue(_newValue); }
catch (e) {
  if (...) return (state) => this.applyState(initialValue, state);   // rollback is applied AFTER finally
}                                                                    // and `e` is never rethrown
finally {
  let reloadedValue = await this.reloadValue();
  this.dispatch(new UpdateStateAction(... reloadedValue ...));       // applied FIRST
}
```

**Repro:** `saveValue` throws and `reloadValue` returns `['server-truth']`. The final state is `['old']` (the stale initial value), and `status.isCompletedOk === true`.

**Impact:**

- (a) The user is never told that the save failed. No `UserException` dialog appears, `isFailed` stays false, and the status says the action succeeded.
- (b) The reloaded server value is replaced by the older pre-update value.

async_redux (Dart), which this library is ported from, dispatches the rollback inside `catch` and **rethrows**. The class is marked EXPERIMENTAL, and the website describes an `optimisticUpdate = {...}` property that does not exist.

There is also a smaller issue: `reloadValue` is `abstract`, but its doc says "If you want to skip this step, simply don't provide this method". The `catch` around the reload also swallows real reload errors.

**Fix:** dispatch the rollback inside `catch`, then `throw e`, and make `reloadValue` optional (not abstract).

**Fixed.** In `OptimisticUpdate.reduce()` (`src/KissAction.ts`):

- When the save fails, the rollback (if the state still holds the optimistic value) is dispatched right away, inside `catch`, so it comes **before** the reload. The reloaded value now wins.
- After the reload, the save error is rethrown. The action fails, `isFailed` is true, and a `UserException` is shown to the user.
- `reloadValue` is now optional (`reloadValue?()`). If it's not provided, the reload is skipped.
- Reload errors are no longer swallowed: if the save succeeds and the reload throws, the action fails with the reload error. If both fail, the action fails with the save error.

BDDs: `__tests__/bdd.OptimisticUpdateAction.test.ts` (7 scenarios).

---

### 23. `UserException` builder methods lose `onOk`, `onCancel` and `props`

**Where:** `src/UserException.ts:120` (`withTitle`), `141` (`withMessage`), `160` (`withHardCause`), `182` (`withDialog`, and so `noDialog`), and `216` (`withErrorText`). They only copy `title`, `hardCause`, `ifOpenDialog` and `errorText`.

**Repro:**

```ts
new UserException('m').addCallbacks(onOk).addProps({ code: 42 }).withTitle('T')
// .onOk === undefined, .props === {}
new UserException('m').addProps({ x: 1 }).noDialog.props   // {}
```

**Fix:** copy every field. Ideally add one private `copy({...})` helper that all builders use.

**Status: Fixed.** All builders (`withTitle`, `withMessage`, `withHardCause`, `withDialog`, `noDialog`, `withErrorText`, `addProps` and `addCallbacks`) now use a private `copy({...})` helper, so every field is kept. BDDs: `__tests__/bdd.UserExceptionBuilders.test.ts`.

---

### 24. `waitActionCondition` is not checked when an action is dispatched

**Where:** `_checkAllActionConditions` is only called when an action *leaves* the in-progress set (`src/Store.tsx:1025` and `src/Store.tsx:1328`). It is never called in `_calculateIsWaitingIsFailed` (`src/Store.tsx:857-884`), where actions *enter* the set.

**Docs:** "The trigger action is the action that just entered the set (by being dispatched), or just left the set ... The condition is only checked when some action is dispatched or finishes dispatching." The comment inside `waitAnyActionTypeFinishes` (`Store.tsx:2078`) also assumes dispatch-time checks.

**Repro:** `waitActionCondition(actions => actions.size > 0)`, then `dispatch(new SlowAsyncAction())`. The promise **never resolves**, and ends in `TimeoutException`.

**Fix:** call `this._checkAllActionConditions(action)` right after `this._actionsInProgress.add(action)`.

**Status: Fixed.** `_checkAllActionConditions(action)` is now called right after the action is added to the in-progress set. Tested in `__tests__/bdd.WaitActionConditionOnDispatch.test.ts` (async dispatch, sync dispatch, a second dispatch, and `waitAnyActionTypeFinishes` still ignoring the dispatch).

---

### 25. `store.waitAnyActionTypeFinishes([X])` throws a TypeError

**Where:** `src/Store.tsx:2062-2069`. The options object has no `= {}` default, unlike every other wait method (and unlike the `KissAction` / `StoreDispatchers` wrappers).

**Docs:** `await store.waitAnyActionTypeFinishes([MyFinalAction]);`

**Repro:** TypeScript rejects the call (the second argument is required). At runtime it throws `TypeError: Cannot destructure property 'timeoutMillis' of 'undefined'`.

**Fix:** added `= {}`, so the options object is optional. **Fixed.**

**Tests:** `__tests__/bdd.WaitAnyActionTypeFinishes.test.ts`.

---

### 26. `store.mocks.add(Type, null)` makes dispatch throw

**Where:** `src/Store.tsx:2137-2141` (it stores `null` as the mock function) and `src/Store.tsx:800-808`. Only `undefined` counts as "no mock", so `mockActionFunction(action)` is called on `null`.

**Docs:** the "Aborting an action" example is `store.mocks.add(LoadUserAction, null);`. The JSDoc at `Store.tsx:506-525` shows it too.

**Repro:** `store.mocks.add(Inc, null); store.dispatch(new Inc())` → `TypeError: mockActionFunction is not a function`. The TypeScript signature also rejects `null`.

**Fix:** `Mocks.add` now accepts `mockFunction: ((action: T) => KissAction<St> | null) | null`, and turns `null` into `() => null`, so the dispatch is aborted. **Fixed.**

**Tests:** `__tests__/bdd.MockNull.test.ts`.

---

## Low severity

### 12. Retry option handling

**Where:** `src/KissAction.ts:1200-1203` (`_injectStore`).

- **`on: true` is forced.** `retry = { on: false }` still retries (repro: 4 calls). This matters when a base action turns retry on and a subclass tries to turn it off. The `if (!retry.on)` branch in `Store._retryWrapReduce` (`Store.tsx:1117`) can never run.
- **`unlimitedRetries` is ignored.** `Retry.unlimitedRetries` (`KissAction.ts:1624`) is in the public type, but only `maxRetries: -1` actually removes the limit. `retry = { unlimitedRetries: true }` still stops after 3 retries.
- **`multiplier <= 1` becomes 2.** `Store.tsx:1130`. A constant delay (`multiplier: 1`) is impossible, and nothing says so.

**Fix:**

- `_injectStore` now applies `on: true` before the user's options, so `retry = { on: false }` turns retry off.
- `unlimitedRetries: true` now removes the retry limit, the same as `maxRetries: -1`.
- `multiplier: 1` now keeps the delay constant.
- Invalid retry options now make the dispatch throw a `StoreException` that names the action, the option, the rule and the value. For example: `Action MyAction has an invalid retry option: retry.multiplier must be a number >= 1 (use 1 for a constant delay), but got 0.5.` The rules: `on` and `unlimitedRetries` must be booleans, `initialDelay` and `maxDelay` must be finite numbers `>= 0`, `multiplier` must be a finite number `>= 1`, and `maxRetries` must be an integer `>= -1`. Before, `maxRetries: -2` (or any negative value) silently retried forever. The JSDoc of `retry` now says all this.

**Tests:** `__tests__/bdd.RetryDelays.test.ts` covers `on: false`, `unlimitedRetries`, `multiplier: 1`, an error for each kind of invalid option, and valid edge values (zero delays, `maxRetries: 0`).

### 17. `useIsWaiting(BaseClass)` does not re-render when a subclass action starts

`isWaiting` uses `instanceof` (`Store.tsx:1433-1435`). The re-render on dispatch only happens for the *exact* type (`_awaitableActions.has(action.constructor)`, `Store.tsx:880`).

**Repro:** `useIsWaiting(Base)` while a `Sub extends Base` action runs: `store.isWaiting(Base) === true`, but the component rendered only `[false]`. A spinner keyed on the base class never appears. (`waitActionType` uses exact type matching, which is a third behavior.)

**Fixed:** when an action starts, the store now re-renders if the action is an `instanceof` any type that `isWaiting` was called with (new private `_isAwaitable` in `src/Store.tsx`), matching how `isWaiting` itself checks. Before, it only matched the exact `action.constructor`. Finishing an action already re-rendered unconditionally, so no change was needed there. `waitActionType` still uses exact matching. Tests: `__tests__/bdd.UseIsWaitingSubclass.test.ts`.

### 27. Timers and conditions leak after a timeout

**Where:** `waitCondition` (`Store.tsx:1665-1674`) and `waitActionCondition` (`Store.tsx:1755-1770`).

- **Timers are never cleared.** The `setTimeout` is not cleared when the condition resolves, so every call keeps a timer alive for up to 10 minutes by default. That keeps Node and Jest from exiting ("Jest did not exit…").
- **Conditions are never removed on timeout.** After the timeout, the condition stays in `_waitConditions` / `_waitActionConditions` and is checked on every later state change (repro: 1 condition still registered after the timeout).

### 28. `dispatchWhen` produces an unhandled rejection

**Where:** `Store.tsx:2106-2108`. `this.waitCondition(condition).then(...)` has no `.catch`, and uses the default 10-minute timeout. If the condition is never met, the result is an unhandled `TimeoutException`, which is fatal in Node. The default timeout is also surprising for a production API like this one.

### 29. `TimeoutException` is not exported, and has an empty stack trace

**Not exported:** the docs say "you can modify `TimeoutException.defaultTimeoutMillis`", but `src/index.ts` does not export `TimeoutException`. `package.json` `exports` only exposes `"."`, so users can neither change the default nor check `instanceof TimeoutException`.

**Empty stack:** `StoreException.ts:34` calls `Error.captureStackTrace(this, StoreException)` instead of passing `TimeoutException`. Since `StoreException` is not on the call stack, V8 drops every frame. Repro: `stack === "TimeoutException: t"`.

### 30. `describeStateChange` ignores nested changes

**Where:** `Store.tsx:1506-1507`. The recursive call's return value is thrown away.

```ts
Store.describeStateChange(val1, val2, newPath);   // should be: differences += ...
```

**Repro:** `describeStateChange(new State(1, {a:1}), new State(1, {a:2}))` returns `""`. With `logStateChanges`, any change below the top level of the state is never logged. The return type is also `String` (the wrapper object type) instead of `string`.

### 31. `getLog` is a getter, but the docs call it as a method

**Where:** `KissAction.ts:245`: `get getLog()`.

The docs, and the JSDoc at `KissAction.ts:240` and `Store.tsx:210`, all use `action.getLog()`. Calling it that way throws `TypeError: action.getLog is not a function`.

**Fix:** make it a method `getLog()`.

### 32. A sync reducer returning `undefined` sets the whole state to `undefined`

**Where:** `Store.tsx:1085` only checks `=== null`. `_registerState` (`Store.tsx:1310`) also only checks `!== null`.

**Repro:** `reduce(): any { /* forgot return */ }` → `store.state === undefined`.

The async path already uses `!= null`, which treats `undefined` correctly. TypeScript catches most of these cases, but JavaScript users and `any`-typed reducers do not get that protection.

**Fix:** treat `undefined` like `null`.

### 33. `dispatchAndWait` errors behave differently for sync and async actions

For a **sync** action whose error is rethrown, `dispatchAndWait` throws *synchronously*. It is not `async`, so `store.dispatchAndWait(a).catch(...)` never runs.

For an **async** action, the returned promise *resolves* with the status, and the same error becomes an unhandled rejection from `_wrapsAsync(...).then()` (`Store.tsx:1255`, `1290`).

Callers cannot handle errors the same way for both. The docs don't cover this.

### 34. A second `dispatchAndWait` on a running action makes the first one hang

**Where:** `Store.tsx:691`. `_createPromise()` replaces the action's `_resolve` before `_processDispatch` throws "already dispatched". So if the action is still running, the **first** `dispatchAndWait` promise never resolves.

`_dispatchCount` is also incremented (and logged) before the "already dispatched" check (`Store.tsx:832-836`).

### 35. `Store.log` is static

**Where:** `Store.tsx:606`. Every `new Store(...)` replaces the logger for all stores. In tests, or with several stores, the most recently created store decides where every store logs.

### 36. `persistAndPausePersistor()` cannot be awaited

**Where:** `Store.tsx:1578`. It is declared `void` and drops the promise from `ProcessPersistence.persistAndPause()`. Apps going to the background can't wait for the save to finish, which is the use case the docs describe.

### 37. Retry with a sync reducer contradicts the JSDoc

The JSDoc says "all actions using the `retry` mixin will become asynchronous, even if the original action was synchronous" (`KissAction.ts:538`). In fact, a sync reducer with retry always ends in `StoreException("...should have an ASYNC reducer...")`, even when it succeeds on the first try (`Store.tsx:1275-1276`).

The existing test `SyncActionThatRetriesAndSucceeds` asserts this exception, so the behavior is intended and the JSDoc is wrong.

### 38. In the ESM build, `toString()` prints `checkInternet:undefined`

**Where:** `src/KissAction.ts:208` (`checkInternet?: CheckInternetOptions;`) and the exclusion list in `toString()` at `src/KissAction.ts:1245`.

`tsconfig.esm.json` targets ES2022, and from ES2022 on, TypeScript defaults `useDefineForClassFields` to `true`. So a declared field without a value is still emitted as a real class field, set to `undefined`.

That gives every action an own `checkInternet` property. `toString()` lists every own property except `_*`, `nonReentrant`, `retry` and `wrapReduce`, so it prints it. `lib/esm/KissAction.js:152` has `checkInternet;`. The CJS build targets ES2021, so it doesn't have this problem.

**Repro:** in the ESM build, or under the repo's ts-jest setup, which uses the ES2022 target:

```
IncrementSync(checkInternet:undefined)     // expected: IncrementSync()
```

**Impact:**

- Every dispatch log line, `actionObserver` / `stateObserver` / `errorObserver` output, and `store.record.toString()` gets the extra text in ESM projects.
- What gets printed depends on which build was loaded.
- `bdd.StateObserver`, `bdd.ErrorObserver` and `bdd.ActionObserver` fail because of this (4 tests). That only became visible once #1 was fixed.

**Fix:** add `'checkInternet'` to the exclusion list in `toString()`, and skip `undefined` values. Alternatively, declare the field as `declare checkInternet?: CheckInternetOptions;`, or set `useDefineForClassFields: false`, so no property is emitted.


### 39. A save made during startup can be overwritten by the initial-state

**Where:** `src/ProcessPersistence.ts`, `readInitialState()` (lines 39-47), and `src/Store.tsx:609-611`.

The `Store` constructor starts `readInitialState()` without waiting for it. When nothing is persisted, `readInitialState()` awaits `persistor.readState()` and then `persistor.saveInitialState(initialState)`. Meanwhile, the app may already be dispatching actions, and `ProcessPersistence.process()` persists them through `persistDifference()`. Nothing coordinates the two. If `saveInitialState` finishes after a `persistDifference`, it overwrites the newer state on disk with the initial-state.

`lastPersistedState` still points to the newer state, so the next change only persists a difference against a state that isn't on disk anymore.

**Repro** (seen while writing `__tests__/bdd.LogOut.test.ts`, with a persistor whose methods await `delayMillis(0)`): create the store, wait about 10 ms, dispatch `Increment` (count 0 → 1). The record shows `persist 1`, and `store.state.count` is 1, but `persistor.savedState.count` is 0. It depends on timing, and it happens when other tests run first.

**Impact:** the first changes made right after app start can be lost on disk. The persisted state and `lastPersistedState` no longer agree.

**Fix:** don't process persistence until `readInitialState()` has finished. For example, start paused and resume at the end of `readInitialState()`, or have `_persist` await a "ready" promise.

---

## Mismatches between the docs and the API (kissforreact.org)

- `new UserException('...').addCause(error)` appears in *errors-thrown-by-actions*, but **`addCause` does not exist**. The method is `withHardCause`.
- The persistor page calls the logout method both `store.signOut()` and `store.logOut()`. Its example `await store.logOut({ initialState: ..., throttle = 3000, actionsThrottle = 6000 })` is not valid syntax (`=` inside an object literal).
- `status.isCompletedOk()` is written as a method on *dispatching-actions*, but it is a getter. *wait-for-condition* uses `isCompleteOk` / `isCompleteFailed`, which don't exist.
- `optimisticUpdate = { ... }` (action-features, homepage) is not an existing feature. The code has an `OptimisticUpdate` class instead.
- The homepage shows `createStore<State>({ persistor: new Persistor() })` with no `initialState` (a type error), and instantiates the abstract `Persistor`.
- The `Persistor` JSDoc says to read the state yourself and pass it as `initialState`. The website says Kiss reads it during store creation (#10).

---

## Test-suite problems

1. **Nothing compiled** before #1 was fixed: all 19 `bdd.*` suites failed with TS2345. Now `npx jest` gives **22 of 30 suites and 170 of 176 tests passing**. The 8 failing suites are:
   - `bdd.StateObserver`, `bdd.ErrorObserver`, `bdd.ActionObserver`: #38 (`checkInternet:undefined` in `toString()`).
   - `bdd.RetryAction`: item 7 below.
   - `bdd.DispatchAndWait`: #18. All 7 of its tests pass, but the unhandled rejection fails the suite.
   - `esserializer/originalTests/index.test.ts`: item 2 below.
   - `examples/TodoAppReactNative/__tests__/App.test.tsx`: item 3 below. It shows up as 2 FAIL entries.
2. `__tests__/esserializer/originalTests/index.test.ts` expects the exact V8 message `"Unexpected identifier"`. Node 24 says `"Unexpected identifier 'bar'"`, so the test depends on the Node version.
3. The root `jest.config.js` `testRegex` also picks up `examples/TodoAppReactNative/__tests__/App.test.tsx`. That test fails in the root project, so add `/examples/` to `testPathIgnorePatterns`.
4. The last scenario of `bdd.RetryAction.test.ts` ("It cannot be dispatched SYNC anymore") passes for the wrong reason. It calls `dispatchSync` on an action that was *already dispatched*, so the `StoreException` comes from "already dispatched", not from the action being async.
5. There are no tests for any of these:
   - `logOut`, `PersistAction`, pausing and resuming the persistor, or persistence failures (#3–#6, #9);
   - React hook #16. #13–#15 and #17 now have tests;
   - retry timing (#11);
   - `waitAnyActionTypeFinishes`, mocks with `null`, nested `describeStateChange`, and `OptimisticUpdate` failure paths.
6. The uncommitted change widens `peerDependencies` to `react ^18 || ^19`. The suite only runs against React 19.1, and React 18 is untested. No React-19-only runtime API is used, so this is a coverage gap rather than a known bug.
7. `bdd.RetryAction.test.ts` does not compile. Each test action declares `log: string = ''` (lines 149, 165, 180, 193 and 208). That clashes with the inherited `KissAction.log(key, value)` method (TS2416 and TS2345), and at runtime it replaces the method with a string. Rename the field, for example to `trace`.

---

## Reproducing

The repro tests are outside the repo, in the session scratchpad:

- `repro/core.test.ts`
- `repro/hooks.test.tsx`
- `repro/persist2.test.ts`
- `repro/serializer.test.ts`
- `after-crash.js` and `persist-fail.js` (plain Node scripts, run against `lib/cjs`)

They run with a Jest config that turns off ts-jest type diagnostics. That was needed before #1 was fixed, and it's still needed while item 7 of the test-suite problems is open. That config compiles to ES2021, which is why it didn't catch #38. Each test asserts the **current buggy behavior**, so a passing test means the bug is still there. They can be copied into `__tests__/` as regression tests once each assertion is flipped to the correct behavior.
