# Kiss: React subscriptions on `useSyncExternalStore`, implementation report

Implementation of `STATE_REFACTOR.md`, done on 2026-10-12 on top of commit `c64a659`.

## 1. Design

### State, status and readiness are three separate observable domains

The store keeps three listener lists (`src/Store.tsx`, class `Listeners`), one per thing it
publishes, so a change in one never makes React check the components that use another:

| Domain | Subscribe | Snapshot read by React | Published by |
| --- | --- | --- | --- |
| Application state | `store._subscribeState` | `store._getState()` (the immutable state object itself) | `_registerState`, after the state is replaced and the action was removed from the actions in progress |
| Action status | `store._subscribeStatus` | `store.isWaiting(type)`, `store.isFailed(type)`, `store.exceptionFor(type)` (a boolean, or the recorded `UserException` reference) | `_calculateIsWaitingIsFailed` (start), `_registerState` and `_processWrapsFinally` (end, including failure), `clearExceptionFor` |
| Readiness | `store._subscribeReady` | `store._getIsReady()` (boolean) | `ProcessPersistence.readInitialState`, through a new `onReady` callback, right after `isReady` becomes true (after the restored state was applied) |

The subscribe and getter functions are arrow fields of the store, so they are stable per store
and React does not resubscribe on every render. The store no longer runs component selectors,
nor keeps React dispatch functions: `_refStateHooks`, `_refStoreHooks`, `RefState`,
`RefStore`, `_rebuildFrom*`, `_awaitableActions`, `_actionsWeCanCheckFailed` and
`_isAwaitable` are gone. `isWaiting`, `isFailed` and `exceptionFor` are now pure reads
(no observation bookkeeping), and every status change is published; React compares the value
each component actually reads, so a consumer of action A does not render when action B starts.

Snapshot rules: nothing is allocated per read. The state snapshot is the state object; status
snapshots are booleans or the exception object recorded in the action status (treated as
immutable once published; documented in `useExceptionFor`).

Listener semantics (class `Listeners`): notification iterates over a copy of the set taken when
it starts; a listener removed meanwhile is skipped, a listener added meanwhile is called by the
next notification, nested dispatches notify in a nested way with the newest values, and
unsubscribing twice is harmless. Tested by C12.

### Publication boundaries

- A state change publishes after `this._state = newState` and after the action left
  `_actionsInProgress` (moved before the state publication), so one render sees the new state
  and the end of the waiting together. The order of the observer, recorder, wait conditions,
  persistence and queued `dispatchWhen` actions is unchanged.
- An action's end (`_processWrapsFinally`) publishes the status once, after `after()` ran and
  the non-reentrant key was released; a failure was recorded by `_processWrapsError` before, so
  the same notification publishes "not waiting, failed, exception".
- A `NotificationBatch` delays the notifications made during the synchronous part of a
  dispatch (`_processDispatch`, including nested dispatches from observers or `dispatchWhen`)
  until `dispatch` returns. So a SYNC action, which starts and finishes inside `dispatch`,
  publishes once, and a `useIsWaiting` of its type never even gets a render attempt. The batch
  is never held across an `await` (an async action publishes its start when `dispatch` returns
  and its end when it finishes), and ends in a `finally`.
- Readiness is published from the actual transition, not from the promise.
- No `flushSync`, timers or microtask delays in production code; React schedules all renders.

### Hooks (`src/Hooks.tsx`)

- `useSelect`/`useSelector`/`useAllState`: `useSyncExternalStoreWithSelector(subscribeState,
  getState, getServerState, selector, Object.is)`.
- `useObject`: the same, with Kiss's `_shallowEqual` as the equality (plain objects by own
  enumerable string keys, arrays, `Map` and `Set` by ordered entries, everything else by
  identity). The old ref-backed cache is gone: the helper keeps the last committed value, so
  an abandoned render cannot leak a speculative object (G04).
- `useIsWaiting`/`useIsFailed`/`useExceptionFor`: `useSyncExternalStore(subscribeStatus,
  useCallback(() => store.read(type), [store, type]), serverDefault)`.
- `useIsStoreReady`: `useSyncExternalStore(subscribeReady, getIsReady, () => true)`.
- Dispatch hooks, `useStore` and `useStoreEffect` are unchanged (they never subscribe).

Error isolation: the store never runs selectors. React's `checkIfSnapshotChanged` catches a
throwing selector in the listener, schedules a render, and the render then throws to the
nearest error boundary. A transient throw for a deleted item is never rendered (the parent
unmounts the child first), and a persistent throw reaches the boundary without failing the
action or stopping persistence, observers and waits (F01–F07).

### Provider and server rendering contracts

- `StoreProvider` now follows its `store` prop (live replacement): the components unsubscribe
  from the old store, read the new one on the same render, dispatch functions rebind, and
  `useStoreEffect` runs `onUnmount` for the old store and `onMount` for the new one. Keyed
  replacement works too (C11).
- New `serverState` prop: the state the server HTML was rendered from. Default: the store's
  `initialState`. It is the `getServerSnapshot` of the state hooks, used on the server and
  during hydration; after hydration React reads the live state and catches up (H03–H05).
- On the server and during hydration, the status hooks report no waiting and no failed
  actions, and readiness is `true`; afterwards they follow the live store (H06, H08). This is a
  documented restriction: wait for actions (and `store.ready()`) before rendering on the server.
- One store per request; no module-level state, listeners or caches in Kiss (H06, H09).
- State transfer is the application's job (JSON, `toJSON`/`fromJSON`, or the serializer used
  for persistence). H07 shows a class-based state with a `Map` of class instances surviving a
  round trip through the internal `ESSerializer`.

### Scheduling tradeoff (documented in README, CHANGELOG, docs site and the hook comments)

Store-driven renders have React's synchronous priority, even when the dispatch happens inside
`startTransition` (G07). Async actions remain async. When a store change makes a component
suspend, React shows the Suspense fallback (hiding the old content) instead of keeping the old
content as a transition would (G10). Selectors must be pure and may be called more than once.

## 2. Dependencies, build and packaging

- Runtime: `use-sync-external-store@^1.7.0` (`with-selector` entry; it requires React 18+,
  which matches the peer range). Its CJS entry is imported from the ESM build as a bare
  subpath and resolves through the package `exports` (verified in `build.esm.test.ts`).
- Dev: `@types/use-sync-external-store@^1.7.0` (not needed by consumers: the emitted
  declarations do not reference it, verified), `react-dom@^19.3.0`, `@types/react-dom@^19.3.0`,
  `jest-environment-jsdom@^30.5.2`.
- `jest.config.js` now loads `jest.setup.js` (`IS_REACT_ACT_ENVIRONMENT`). DOM tests opt into
  jsdom per file (`@jest-environment jsdom`); store and lint tests keep the `node` environment.
- `__tests__/build.esm.test.ts` also renders the hooks from the built ESM and CJS artifacts
  (`__tests__/fixtures/built-package/`), checks the declarations, and checks that the core
  runtime imports no `react-dom` or browser globals.
- `scripts/pack-smoke.cjs` packs the package, installs the tarball in an isolated consumer with
  only React, runs the ESM/CJS hook smoke there, and compiles a typed consumer (including a
  `@ts-expect-error` for an invalid `useObject`). CI runs it for React 18 and 19; the React 18
  job now also installs `react-dom@18` and `@types/react-dom@18`.
- `eslint.config.mjs`: the React Compiler-derived rules `react-hooks/immutability`,
  `globals` and `refs` are off for `__tests__/**`, where test components record their renders in
  outer variables on purpose. The conditional hook call in
  `bdd.UseIsWaitingAfterFailure.test.ts` (a pre-existing lint error) was fixed.
- `jest.setup.js` also polyfills `TextEncoder`/`TextDecoder` from `util` in the jsdom
  environment, which React 18's browser build of `react-dom/server` needs at import time.
- Two React 18 fixes outside the subscription code, found by the matrix run:
  - `useStoreEffect` kept its latest options in a `useLayoutEffect`, which React 18 warns about
    on the server ("useLayoutEffect does nothing on the server"). It's now a passive effect,
    declared before the effects that read it (effects of a component run in order), so the
    behavior is the same and server rendering is silent. All `useStoreEffect` suites pass.
  - `bdd.UseStoreEffectDetails.test.ts` did not compile with `@types/react@18`
    (`React.Activity` exists since React 19.2), so the React 18 CI job could not run that suite
    before this work. The `Activity` scenario now skips with an explicit assertion on React 18,
    and the "error thrown by `onUnmount` reaches the boundary" example asserts React 18's actual
    behavior (React 18 logs it as an internal React error instead; React 19 fixed it; also
    failing with the pre-refactor sources). The hook's documentation mentions it.

## 3. Scenario coverage (A01–I12)

All scenarios have executable BDDs. "Reused" marks pre-existing files that already proved the
row; everything else is new, under `__tests__/bdd.ExternalStore*.test.tsx`, with the row ID in
a comment inside each `.run`.

| IDs | File / scenario |
| --- | --- |
| A01–A15 | `bdd.ExternalStoreSelection.test.tsx` (one scenario per row; A05 has a sync and an async scenario; A08, A15 use examples). Reused: `bdd.UseSelectNaN` (A07), `bdd.UseObject` (A10). |
| B01–B10 | `bdd.ExternalStoreObjectSelection.test.tsx` (B04–B06, B08–B10 use examples). Reused: `bdd.UseObject`, `bdd.UseObjectNotPlainObjects`. B11 is G04. |
| C01, C02, C04, C05 | Reused: `bdd.UseSelectChangingSelector.test.ts`. |
| C03, C06–C12 | `bdd.ExternalStoreSubscriptions.test.tsx` (C12: two scenarios on the raw subscribe function). Reused for C03: `bdd.UseSelectSubscription`. |
| D01–D18 | `bdd.ExternalStoreStatus.test.tsx` (D04 characterizes `isWaiting` inside `before`/`reduce`/`after` per outcome; D16 covers four abort/reject cases). Reused: `bdd.UseIsWaitingAfterFailure` (D07, D08), `bdd.UseIsWaitingSubclass` (D06), `bdd.IsWaitingSyncAction` (D04 imperative reads). |
| E01–E12 | `bdd.ExternalStoreReadiness.test.tsx`. Reused: `bdd.UseIsStoreReady`, `bdd.StoreReady`, `bdd.UseStoreEffect*` (E01, E07, E08). |
| F01–F07 | `bdd.ExternalStoreSelectorErrors.test.tsx`. Reused: `bdd.UseSelectSubscription` (F01, F02 with the test renderer). |
| G01–G10 | `bdd.ExternalStoreConcurrentRendering.test.tsx`, with the mock scheduler (`__tests__/fixtures/schedulerMock.ts`). |
| H01, H02, H06, H07, H09 | `bdd.ExternalStoreServerRendering.test.tsx` (Node environment, no DOM). |
| H03, H04, H05, H08 | `bdd.ExternalStoreHydration.test.tsx` (`hydrateRoot` with `onRecoverableError` asserted empty). |
| I01–I08 | `bdd.ExternalStoreIntegration.test.tsx` (I05: one example per feature plus a polling scenario; I06: `OptimisticCommand` and `OptimisticSync`; I08: compile-time checks with `@ts-expect-error`). Reused: `bdd.StableHookFunctions` (I01), `bdd.UseStoreDestructuring` (I02), the core action suites. |
| I09 | `build.esm.test.ts`: hooks rendered from the built ESM and CJS artifacts. |
| I10 | `scripts/pack-smoke.cjs` (run locally for React 19, and in CI for 18 and 19). |
| I11 | CI matrix React 18 and 19 (`.github/workflows/ci.yml`); local React 18 run, see section 5. |
| I12 | Source/import check only: `build.esm.test.ts` verifies no `react-dom` import and no browser globals in the core runtime; `use-sync-external-store/with-selector` has no DOM dependency. No native run was executed (see limitations). |

Resolutions worth noting:

- D04: a sync action is in progress while its `before`, `reduce` and `after` run, except that
  an action that applied a new state has already left the set when `after` runs (existing
  contract: `_registerState` removes it, `after()` runs later). The BDD characterizes this per
  outcome, and proves React never commits (or even attempts) a render for it.
- D16: an action aborted before dispatch (`abortDispatch`, non-reentrant key) is never
  dispatched: its own status stays "not dispatched", and only the status returned by
  `dispatchAndWait` says `isDispatchAborted` (existing contract).
- I06: when an `OptimisticCommand` fails, the rollback is applied before the command finishes
  failing (separate microtasks), so a commit with the rolled-back value and the spinner still on
  is a valid intermediate state, asserted as such.
- G10: React throttles the reveal of content replacing a fallback shown less than 300 ms ago
  (`FALLBACK_THROTTLE_MS`), with a real timer; the test waits for it.

## 4. Baseline, pre-refactor results of the new tests, and post-refactor results

Baseline at `c64a659`, before any change (React 19.3.0, react-test-renderer 19.3.0, Node
24.21.0, npm 12.2.0):

- `npx tsc --noEmit -p tsconfig.json`: clean.
- `npm run lint`: 6 errors, 4 warnings, all pre-existing: 2 `rules-of-hooks` in
  `bdd.UseIsWaitingAfterFailure.test.ts` (fixed in this work), 3 `no-this-alias` in
  `src/Store.tsx` (retry code, untouched), 1 missing rule in `eslint-plugin/testing/demo`
  (untouched); warnings in `bdd.Fresh`, `bdd.ServerPushInvalidRevision`,
  `bdd.UseSelectChangingSelector`, `src/KissAction.ts` (untouched).
- `npx jest --runInBand`: 195 suites, 2489 tests, all passing (480 s).

The new suites run against a copy of the pre-refactor `src` (same test files, type
diagnostics off, React mapped to the repository's copy): 139 of 176 passed, 37 failed. By cause:

- 19 need the new subscription seams (`store._subscribeState` etc.) to count listeners, which
  the old engine does not have: A03, C06–C09, C11 (also a behavior difference, see below), C12
  (two scenarios), E06 (three examples), F07 (two examples), G05, G09.
- 6 are the new server contract: H02 (`serverState`), H04, H05, H06, H08.
- 12 are genuine behavior differences fixed by the migration:
  - G01: a transition that mounts two consumers committed a mix of two store versions
    (old: `a=1b=2` committed, then corrected). G02: a consumer mounting in a transition
    committed a stale value first. G08: a torn count/waiting commit. G04: an abandoned
    transition leaked its speculative `useObject` result, so the memoized child rendered again.
  - G07: a dispatch inside `startTransition` was rendered with transition priority by the old
    `useReducer` approach (the DOM still showed the old value after the microtasks).
  - D04 (four examples): a sync action made the spinner render and commit once more.
  - D12 (four examples), I05 retry, I05 ignoreOld, I06 rollback: the old engine coalesced the
    start of an action with its end within one `act` scope, so the "waiting" (or rolled back)
    commit never appeared; the new engine publishes each separately flushed event.
  - C11: the old provider ignored a changed `store` prop (`useState(store)` capture).

After the refactor (same environment): all 10 new suites pass (176 scenarios), the 15
pre-existing hook suites pass unchanged (191 tests), `tsc` is clean, and the full suite result
is in section 5.

Sensitivity checks (temporary faults in production code, each restored exactly; script kept in
the session scratchpad, results in section 5): no state notification; a fresh state snapshot
object per read; object equality always equal; readiness never published; action end not
published; action start not published; the sync batch never flushing; hydration using the live
state instead of `serverState`; listeners never removed.

## 5. Verification runs

Environment: Windows 11, Node 24.21.0, npm 12.2.0, TypeScript 6.0.3, Jest 30.5.2, ts-jest
29.4.14, jsdom 26.1.0 (jest-environment-jsdom 30.5.2), use-sync-external-store 1.7.0.

React 19 (react 19.3.0, react-dom 19.3.0, react-test-renderer 19.3.0, scheduler 0.28.0,
@types/react 19.3.0, @types/react-dom 19.3.0):

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npm run lint` | only the pre-existing findings listed in section 4, minus the fixed `rules-of-hooks` errors: 4 errors (3 `no-this-alias` in `src/Store.tsx`, 1 in the ESLint plugin demo), 4 warnings |
| `npx jest --runInBand` (full suite, includes the 10 new suites and `build.esm.test.ts`, which builds) | 205 suites, 2670 tests, all passing, 543 s. A second full run at the end, after the React 18 fixes, had one failure: the I05 retry example, whose retry fired within the first `act` under load (a 1 ms timer). It was made deterministic (the second attempt waits for the test), then the 10 new suites passed again (176 scenarios) and the feature examples were repeated 3 times without failure. |
| `npx jest __tests__/bdd.ExternalStore --runInBand` | 10 suites, 176 scenarios, all passing |
| `npm run build` | ESM (`lib/esm/*.mjs`) and CJS builds, with declarations |
| `node scripts/pack-smoke.cjs` | OK: tarball installed in an isolated consumer with React 19; `use-sync-external-store` installed with it; `@types/use-sync-external-store` not needed; ESM and CJS hook smoke render `<p>2:2:false:false:none:true</p>`; typed consumer compiles, invalid `useObject` rejected |

Sensitivity checks (React 19; each fault restored byte for byte, verified with `cmp`):

| Fault in production code | Caught by |
| --- | --- |
| No state notification after a state change | A03: consumer keeps showing 1 instead of 3 |
| State snapshot is a fresh object on every read | A10: render loop guard trips (2 examples fail) |
| Object equality ignores the values of the keys | B02: consumer does not render for a changed name/age |
| Readiness never published | E02: stays `ready=false` with the restored state |
| End of an action not published | D07 (4 examples): waiting never ends |
| Start of an action not published | D01: no waiting commit |
| The sync dispatch batch never flushes | A03: nothing is published |
| Hydration uses the live state instead of `serverState` | H04: "Hydration failed because the server rendered text didn't match" reported by `onRecoverableError` |
| Listeners not removed on unsubscribe | C12: removed listener still called |

React 18 (react 18.3.1, react-dom 18.3.1, react-test-renderer 18.3.1, scheduler 0.23.2,
@types/react 18.3.31, @types/react-dom 18.3.7; installed with `npm install --no-save`, as CI
does):

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npx jest --runInBand` (full suite, 205 suites) | 2670 tests, all passing, 534 s |
| `node scripts/pack-smoke.cjs 18` | OK: tarball installed with React 18.3.1, ESM and CJS hook smoke render the expected HTML, typed consumer compiles with `@types/react@18` |

React 18 differences handled in the tests (all documented in the test files): the mock
scheduler 0.23 has no `unstable_hasPendingWork` (the paused render is still proved by the
yield log); React 18's `RootOptions` type has no `onCaughtError` (it logs caught errors, which
the allowed patterns cover); React 18 warns about the test probe's `useLayoutEffect` during
`renderToString` in the hydration suite (allowed there only); and events flushed in one `act`
scope may be rendered together on React 18, so the scenarios that assert an intermediate
commit flush the start and the end of an action separately (D12, I05 retry, sequential and
ignoreOld, I06).

The repository `node_modules` was then restored with `npm ci`.

## 6. Evidence summary

- Irrelevant updates skip renders: A02, A04, A06, A07, B01, B04–B10, D05, D06, D15, D17, I01
  assert unchanged render and commit counts, with real DOM commits recorded by layout-effect
  probes.
- Equal object selections keep their reference: B01, B03 (memoized child and effect do not
  rerun), B04–B06, G04 (`toBe` on the committed object).
- Interrupted renders: G01, G02, G06, G08, G09 pause a transition with the mock scheduler after
  one consumer logged its read (asserted), change the store, resume, and assert every committed
  tuple; G03/G04 abandon a transition with `flushSync`.
- Hydration: H03–H05, H08 assert `onRecoverableError` empty and the commit history.
- Readiness: E02–E07 cover success, null read with delayed initial save, read/delete/save
  failures, same-object restore, settle before/during/after mount, and StrictMode.

## 7. Files changed

- Production: `src/Hooks.tsx` (hooks on `useSyncExternalStore`, `useStoreEffect` passive
  effect), `src/Store.tsx` (listeners, batch, publication points, pure status reads, provider
  with `serverState`), `src/ProcessPersistence.ts` (`onReady`).
- Dependencies and config: `package.json`, `package-lock.json`, `jest.config.js`,
  `jest.setup.js`, `eslint.config.mjs`, `.github/workflows/ci.yml`, `scripts/pack-smoke.cjs`.
- Tests: the 10 `__tests__/bdd.ExternalStore*.test.tsx` suites; fixtures
  `__tests__/fixtures/{deferred.ts,ControlledPersistor.ts,dom.tsx,schedulerMock.ts}` and
  `__tests__/fixtures/built-package/`; `__tests__/build.esm.test.ts`;
  `__tests__/bdd.UseIsWaitingAfterFailure.test.ts`, `__tests__/bdd.UseStoreEffectDetails.test.ts`;
  the generated `gen_features/*.feature` files of the new suites.
- Documentation: `README.md`, `CHANGELOG.md`, this report, and in the sibling docs repository
  `react/basics/components-use-the-state.md` and `react/basics/provide-the-store.md`.

## 8. Limitations and follow-ups

- React Native was not run. The native check is a source/import check (no `react-dom`, no
  browser globals, helper has no DOM dependency); the RN example app uses the published
  package from npm, not this checkout.
- The React 18 run was local with the latest 18.x (18.3.1); 18.0–18.2 were not exercised.
  CI runs `react@18` (resolves to the latest 18.x).
- The docs site (`../kissforreact.org`, a separate repository) was updated in place
  (`react/basics/components-use-the-state.md`, `react/basics/provide-the-store.md`); those
  changes are uncommitted there.
- Pre-existing lint errors in `src/Store.tsx` (`no-this-alias`, retry code) and the ESLint
  plugin demo were left as they were; `npm run lint` still reports them.
- `C:\Users\Marcelo\node_modules\react-dom` exists outside the repository (an older copy); Jest
  resolves the repository's own `node_modules` first, but a stray copy like this can cause
  duplicate-React failures in ad-hoc scripts run from elsewhere.
