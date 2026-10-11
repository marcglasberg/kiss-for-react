# Kiss: refactor React subscriptions to useSyncExternalStore

Implementation brief prepared on 2026-10-11 for the AI implementing this change.

## 1. Objective and authority

Replace Kiss's hand-written React subscription and forced-render machinery with React's `useSyncExternalStore` and the React team's `useSyncExternalStoreWithSelector` helper. Complete the implementation, executable BDDs, integration tests, package/build checks, and documentation needed to establish that Kiss's functionality remains correct.

The package is not currently used by applications. Choose the cleanest correct design; public APIs, types, internal names, and structure may be changed when useful. Update examples, documentation, and tests to reflect deliberate design decisions. The requirement is functional correctness, including selective rendering, action lifecycle behavior, errors, persistence, and readiness.

This is a design and test specification, not an implemented or tested migration. Repository observations below come from source inspection. Independently verify every assumption against the current checkout and the exact React/helper versions you use. Resolve contradictions between comments, code, tests, and intended behavior explicitly. Do not turn an accidental implementation detail into a required feature merely because it appears here.

**Write and run the behavior tests before replacing the production subscription code.** Existing behavior should have a passing baseline; newly specified correctness guarantees may initially fail. Record those failures and demonstrate that the migration fixes them. Passing tests provide evidence, not a mathematical guarantee that no bug exists. Add cases discovered during implementation.

## 2. Why make this change?

Kiss owns its state outside React. Today, Kiss selects values, remembers them, compares them on store updates, and requests React renders itself. React provides a dedicated interface for coordinating these external values with its renderer.

The important benefit is consistency when React pauses or abandons work. A screen prepared in pieces must not commit a counter from one store version and its corresponding list from another. React's external-store interface lets React validate the value before committing concurrent work and restart when necessary. See the [React hook reference](https://react.dev/reference/react/useSyncExternalStore).

The other benefit is maintenance: Kiss can delegate subscription/render coordination to React while retaining its own state model and selection rules. The [original React design proposal](https://github.com/reactjs/rfcs/blob/main/text/0214-use-sync-external-store.md) explains the motivation and intended adoption by state libraries.

Ordinary updates may look exactly the same after the migration. Do not promise a speed improvement. Measure avoided renders and representative work rather than assuming fewer lines of code means faster execution.

The scope is manageable because most existing coordination is concentrated in `Hooks.tsx` and a few `Store.tsx` notification paths. Its sensitivity comes from timing and lifecycle interactions, rather than the number of files involved.

### Tradeoffs to explain and test

- Store-driven React updates use synchronous priority, including when dispatch is wrapped in `startTransition`. This can affect expensive screens and Suspense fallback behavior. Ordinary React local-state transitions can still read the store. The existing `useReducer` approach may receive transition priority, but does not establish equivalent external-store consistency. See the design proposal above.
- Async Kiss actions remain async. This hook does not make a network request block JavaScript, remove promises, or replace Kiss's loading/error handling.
- A synchronous store notification does not promise that the DOM has updated before `dispatch` returns. Distinguish store state, notification, scheduled React work, and committed DOM.
- Numbers of selector evaluations, component invocations, and commits are different quantities. Their exact sequences can change. Selectors must be pure and must not depend on being called a particular number of times.
- The selector helper adds the `use-sync-external-store` runtime dependency. It calls the underlying hook itself; do not subscribe twice by also calling the base hook for that same selection. Verify the dependency's published exports and types.
- Server rendering needs an explicit initial snapshot policy. Supplying live client state for hydration without considering the server's data is insufficient.
- React integration still needs correctly implemented snapshots, notifications, equality rules, and action boundaries. The hook will not repair errors in Kiss's own state model.

## 3. Read and independently verify these repository areas

Read `AGENTS.md` first. In particular, BDDs live in executable TypeScript, generated `.feature` files are not edited by hand, and destructive worktree operations such as stashing or resetting other work are prohibited.

Read `node_modules/easy-bdd-tool-jest/README.md` before writing BDDs. Inspect the actual installed package if dependencies differ from this brief.

| Location / symbol | What to inspect |
| --- | --- |
| `src/Hooks.tsx`: `useSelect`, `useSelector`, `useAllState` | State selection entry points. |
| `src/Hooks.tsx`: `useObject`, `_shallowEqual`, `UseObjectValue` | Equality, reference reuse, and TypeScript restrictions. |
| `src/Hooks.tsx`: `useSubscribedSelector`, `useStoreSelector`, `RefState`, `RefStore` | Shared implementation to replace. |
| `src/Hooks.tsx`: `useIsWaiting`, `useIsFailed`, `useExceptionFor` | Status reads that do not depend on replacing application state. |
| `src/Hooks.tsx`: `useIsStoreReady` | Separate readiness subscription, currently using a promise and forced render. |
| `src/Hooks.tsx`: `useLifecycle`, dispatch hooks, `StoreDispatchers` | Lifecycle effects, stable callbacks, and APIs that should not become state subscribers unnecessarily. |
| `src/Store.tsx`: `_refStateHooks`, `_refStoreHooks`, both `_rebuildFrom...` methods | Store-owned hook references, selector execution, and notification logic. Duplicate `RefState`/`RefStore` classes also exist here. |
| `src/Store.tsx`: `_calculateIsWaitingIsFailed`, `_processWrapsFinally`, error processing | Action start, retry/error clearing, failure recording, and completion. |
| `src/Store.tsx`: `_registerState`, `_registerUnchangedState` | State replacement, status clearing, observers, wait conditions, persistence, and queued `dispatchWhen` actions. |
| `src/Store.tsx`: `isWaiting`, `isFailed`, `exceptionFor`, `clearExceptionFor` | Status reads currently perform observation bookkeeping. |
| `src/Store.tsx`: constructor, `_isReady`, `ready`, `StoreProvider`, `StoreContext` | Initial state, persistence setup, provider lifetime, and readiness. |
| `src/ProcessPersistence.ts`: `readInitialState`, `_readInitialState`, `isReady` | Restoring state and settling readiness on success and failure. |
| `src/KissAction.ts`, `src/Persistor.tsx` | Action contracts, state updates, async paths, and persistence behavior. |
| `src/index.ts` | Exports and generic types. |
| `package.json`, lockfile, TypeScript configs, `scripts/fix-esm.cjs` | Dependency placement and ESM/CJS/declaration output. |
| `jest.config.js`, `.github/workflows/ci.yml`, `__tests__/build.esm.test.ts` | Real test discovery, environments, builds, and React matrix. |
| `README.md`, `CHANGELOG.md`, `BUGS.md`, `ROADMAP.md`, `LINTS_LIST.md`, lint rules, examples | Documented behavior and assumptions to reconcile. Do not implement unrelated roadmap features. |

Current manifest supports React 18 and 19. CI currently has both majors and installs matching `react-test-renderer` packages for its React 18 job. New DOM tests must also have matching `react-dom` versions in every job. Verify actual dependency resolution; a peer range alone proves nothing about runtime compatibility.

The roadmap references a sibling documentation repository at `../kissforreact.org/react/...`. Locate relevant docs if accessible and in the implementation task's authorized scope; report needed follow-up if that repository cannot be updated.

### Existing implementation observations to double-check

1. `useSubscribedSelector` reads the selector during render, uses `useReducer` as a force-render counter, updates a ref in a layout effect, and registers the ref in a passive effect. It rechecks missed updates after subscription and during later commits.
2. Store notification loops execute selectors, compare with `Object.is`, and request renders. They catch selector exceptions so a transient deleted-item read does not fail an action or prevent later store processing.
3. `useObject` uses a ref-backed selection cache and Kiss's custom shallow comparison. Moving this comparison into the selector helper should remove the need for that hand-written cache.
4. `_actionsInProgress` and `_failedActions` are mutable collections on one stable `Store` instance. The state object can remain unchanged while status changes.
5. `isWaiting(type)` adds to `_awaitableActions`; `exceptionFor(type)` adds to `_actionsWeCanCheckFailed`. Start notifications depend on this bookkeeping. `isFailed` delegates to `exceptionFor`.
6. Waiting uses `instanceof`, including abstract base classes and subclasses. Failed/exception lookups use the exact action constructor.
7. `_registerState` currently assigns `_state` and invokes state hooks before removing the action from `_actionsInProgress` and invoking status hooks. This ordering needs deliberate review with the new update mechanism.
8. Persistence applies restored data through `UpdateStateAction`, then later sets readiness in `readInitialState`'s `finally` block. A readiness change can occur without an application-state change.
9. `StoreProvider` currently captures its initial store with `useState(store)`. A later change of its prop does not currently replace that store. Decide and test the desired provider contract explicitly.
10. `useStore()` returns a dispatch facade, not the raw `Store` with a reactive state getter. Dispatch functions are memoized and have existing reference-stability tests.

Use searches for all mutations and notification calls, not only the symbols listed here. Include action aborts, null/unchanged reductions, failures, retried actions, restoration, logout, and nested dispatches.

## 4. Recommended architecture

Treat state, action status, and readiness as separate observable domains. A shared event mechanism is possible, but it must not cause components with unchanged selections to render. Prefer a small design that is easy to reason about and test.

### 4.1 Store subscriptions

Replace React-ref collections with listener callbacks. Store mutation code should announce that an observable value may have changed. It should not retain component selectors or React dispatch functions merely to implement subscriptions.

An illustrative interface, whose names are not prescribed:

```ts
type Listener = () => void;
type Unsubscribe = () => void;

subscribeState(listener: Listener): Unsubscribe;
getStateSnapshot(): St;

subscribeStatus(listener: Listener): Unsubscribe;
subscribeReady(listener: Listener): Unsubscribe;
```

Make functions passed to hooks stable for a given store, with correctly bound `this`. An arrow field or a one-time binding can work. A newly created `subscribe` function on every render causes unnecessary unsubscribe/subscribe cycles. An inline selector is different: callers must be able to use normal inline selectors.

Register callbacks and return reliable, idempotent cleanup. Define behavior if listeners are added or removed during notification. Iterating a captured listener list is one possible implementation; verify unsubscribe-during-notify and reentrant dispatch behavior rather than assuming a `Set.forEach` loop solves everything.

Do not introduce arbitrary timeout or microtask delays to hide inconsistent publication. A notification must follow the corresponding observable change. React handles scheduling; Kiss must make complete, accurate values available.

### 4.2 Application state: selector helper

Use the existing immutable state value as the base snapshot. Do not allocate a wrapper object on every snapshot read.

Conceptual shape only; server handling and store access must be implemented:

```ts
useSyncExternalStoreWithSelector(
  store.subscribeState,
  store.getStateSnapshot,
  getServerStateSnapshot,
  selector,
  Object.is, // useSelect
);
```

`useObject` should use the same helper with Kiss's comparison function instead of layering its current mutable-ref cache over the new implementation. `useAllState` selects the entire state. `useSelector` can remain an alias if useful.

Pass the base state getter and the selector as separate inputs to the helper. A naive base-hook getter such as `() => ({ name: store.state.name })` creates a different result on every read and can loop. A selector that creates a result object is supported by the helper's cache when the base snapshot is stable. A state-changing dispatch can still produce a new selected object and render under identity comparison. See the [selector helper source](https://github.com/facebook/react/blob/main/packages/use-sync-external-store/src/useSyncExternalStoreWithSelector.js).

Do not clone the whole application state to satisfy the hook. Retain immutable updates and structural sharing. A getter must reflect current authoritative state even if there are no subscribers. A cache invalidated only when listeners happen to exist will produce stale reads on a later mount.

### 4.3 Action status: choose a correct snapshot design

For the current public status hooks, a simple approach is to subscribe to status events and let the base hook read the actual boolean or exception reference needed by that hook:

```ts
// Conceptual: readWaiting must have the intended pure-read semantics.
useSyncExternalStore(
  store.subscribeStatus,
  () => store.readWaiting(actionType),
  () => readServerWaiting(actionType),
);
```

Use analogous reads for failed status and exception values. The snapshot may be `false`, `true`, `null`, or a stable exception object. Never allocate a new `Error`, object, array, `Set`, or `Map` on every read.

An alternative is an immutable, cached status snapshot containing sufficient data to compute all status selections. Replace it when status changes; selectors must read that snapshot rather than reaching into mutable live collections. Evaluate cost and simplicity before choosing this design.

Do not pass `() => store` to `useSyncExternalStoreWithSelector`: the stable store identity makes its memoization skip status reevaluation. A version counter that triggers a render followed by an untracked read of mutable status also requires more reasoning than the direct-value approach. Prefer letting React check the value that the component actually uses.

Review observation bookkeeping. If broad status listeners with value comparisons are sufficient, remove notification gates based on prior reads and make status reads pure. If retaining per-type optimization, register interest explicitly in subscription code and prove mounting, changed types, interrupted renders, and base-class matching cannot miss changes. Do not rely on an abandoned render mutating a global list of observed types.

Even with broad notifications, a subscriber to action A should not render just because action B started. A waiting boolean already true should stay true when a second matching action begins or the first of two finishes.

Exceptions are selected by their recorded reference, not just their message. Two different exception objects with the same message may need an exception consumer to update while the failed boolean remains true. Define how published exception objects are treated if any code mutates them after publication.

### 4.4 Readiness

Migrate `useIsStoreReady` to the base hook with a boolean snapshot and a reliable readiness subscription. Prefer notifying from the actual readiness transition. A cancellation-safe subscription to the existing readiness promise may also work, but must be tested for already-resolved promises, unmounts, Strict Mode, and resolution between render and subscription.

Keep `store.ready()` semantics coherent with the hook. No persistor means ready immediately. Reading, deletion, or initial-save failures must follow the established recovery policy and still settle readiness correctly. A component observing ready must see the restored state, or the deliberate fallback state on failure, when it starts readiness-dependent work.

Do not require every intermediate persistence step to be a single transaction. A component may legitimately see restored data while initialization is still finishing. It must not see `ready=true` with a state version that restoration already superseded.

### 4.5 Equality and selector requirements

Retain the useful selection semantics, and test any deliberate revisions:

- `useSelect`: `Object.is` semantics, including `NaN`, positive/negative zero, primitives, and object identity.
- `useObject`: shallow comparison, not deep comparison. Reuse the previous result object when equal so downstream memoized children and effect dependencies stay stable.
- Plain objects: own enumerable string keys, key presence, and value identity. Missing key and present key with `undefined` differ. Different key insertion order alone is currently not significant.
- Arrays: length and ordered items, compared with `Object.is`.
- `Map`: ordered entries, with key and value identity comparisons.
- `Set`: ordered values. Entry reordering is meaningful for both collections in Kiss.
- Different object prototypes differ. Plain objects with null prototypes are handled. Non-plain objects, dates, class instances, and collection subclasses currently fall back to identity.
- Nested values are compared by identity; mutating a nested object in place is not a supported immutable update.
- `null` and `undefined` selections remain valid where declared by the hook's types.

Do not blindly replace this with a third-party function named `shallowEqual`; map/set ordering and class behavior may differ. Decide explicitly if symbols, non-enumerable properties, array holes, or cross-realm objects belong in a revised contract; inspect current behavior rather than inventing promises about them.

Selectors must work when replaced on a parent render, when props select a different item or action type, and when a render is abandoned. Avoid recreating the old shared mutable-ref selection cache. Do not require consumers to memoize every selector for correctness.

### 4.6 Complete each logical update before publishing it

Draw the action lifecycle before moving notifications. For each event list the authoritative mutations, externally callable observers, promise resolution, waits, persistence, and notification boundary.

| Event | Values and side effects to account for |
| --- | --- |
| Action starts | Clear previous failure, register in-progress action, preserve wait-condition and lifecycle behavior, publish the new status. |
| Async action remains pending | Waiting consumers can show true; unrelated state consumers stay unchanged. |
| Action applies new state | Replace state, complete the relevant waiting transition, publish coherent state/status; maintain observer, recording, wait, and persistence semantics. |
| Action completes without new state | Clear waiting and publish status even though the state snapshot is identical. |
| Action fails | Record the appropriate wrapped error, clear waiting at the correct lifecycle point, publish failure/exception state; preserve error/dialog behavior. |
| Retry / clear exception | Remove the previous failure and announce its disappearance even if state does not change. |
| Restoration finishes | Restored/fallback state is established before readiness-dependent work can run. |
| Logout resets state | Consumers see the reset while persistence and action gating retain their intended behavior. |

These are semantic checkpoints, not permission to reorder all callbacks mechanically. In particular:

- `_registerState` currently calls the state observer and recorder, checks waits, processes persistence, and finally drains queued `dispatchWhen` actions. Existing tests check meaningful ordering here.
- The action's `after()` method and non-reentrant lock have their own lifetime; `_actionsInProgress` may be cleared before `after()`. Do not merge these concepts.
- Observers, lifecycle callbacks, and wait predicates can cause nested dispatches. A delayed notification must not capture an obsolete state and publish it after a newer nested update.
- If batching publication within a synchronous operation is necessary, use explicit, exception-safe nesting and flush logic. Never hold a global batch across an `await`, which would hide other actions' progress.
- Publish all relevant cached snapshots before notifying any corresponding listeners, if using multiple snapshot caches. Test a component that reads multiple domains.
- Avoid forcing React with `flushSync` in production subscription code. The core library serves React Native as well as the DOM and should not acquire a renderer-specific runtime dependency.

### 4.7 Error isolation

The present code protects actions from selectors that throw while an item is being removed. React's current external-store implementation catches snapshot-check errors and schedules a render; a persistent error can then reach an error boundary. Verify this in the installed versions, using the [React implementation](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.js) and the local tests you add.

Do not run component selectors in Kiss's notification loop after refactoring. Do not turn a render error into a failed Kiss action. Also do not swallow real persistent selector errors forever or silently return an obsolete value. Test transient deletion and persistent error cases separately, with a healthy sibling subscriber and store side effects checked in both.

## 5. Server rendering, hydration, and provider decisions

Define these before implementation, because they affect getter signatures and tests.

Choose a per-provider/per-request initial data policy for server rendering and the first client hydration pass. The hydration getter must use the data represented in the server HTML even if the live client store advanced before hydration. After hydration, subscribers should catch up to current data. Verify this with real `renderToString`/`hydrateRoot` or streaming APIs as appropriate. See [React hydration requirements](https://react.dev/reference/react-dom/client/hydrateRoot).

For application state, capturing only the store constructor's `initialState` is not always sufficient: a server may load data or dispatch actions before rendering. Design an explicit way to select/transfer the server render snapshot. Handle the relevant status and readiness values too; do not assume they always start empty/ready if the server is allowed to render otherwise. A documented restriction on server-side pending actions is a possible design decision, provided supported flows remain testable.

Class-based state, maps, and sets cannot necessarily be restored with a bare JSON round trip. Reuse or integrate with the existing serialization story where appropriate. Tests may transfer in-memory fixtures to isolate hydration behavior, but documentation must describe how an actual application supplies correctly restored state. Object identity only needs to be stable within each runtime; no object reference can be shared across a server/client process boundary.

Avoid global snapshots, global listeners, and cross-request caches. A server render must not install a persistent client subscription or fire `useDispatch` lifecycle callbacks. Browser-only persistence must not be required simply to import or render the package on the server.

Decide whether `StoreProvider` should continue owning its initially supplied store or should follow a changing prop. Either design needs clear documentation. Always test two independent providers, nesting, and keyed replacement. If live prop replacement is implemented, test unsubscribe from the old store, immediate selection from the new one, ready callbacks, and dispatch callback bindings. Do not accidentally promise live replacement while retaining the current `useState(store)` capture.

## 6. Test-first workflow and test infrastructure

### 6.1 Establish evidence before changing production code

1. Inspect the worktree and applicable instructions. Preserve other work. Record dependency versions and the current commit when available.
2. Run the current suite, type checks, lint, and builds. Record pre-existing failures precisely. Do not label a failure as pre-existing without observing the baseline.
3. Inventory relevant existing BDDs and map them to the scenario IDs below. Reuse and strengthen tests that already prove a case instead of duplicating them.
4. Add missing public-behavior BDDs and a DOM/concurrency harness while the old implementation is still present. Keep infrastructure changes distinct from production refactoring.
5. Separate characterization cases from desired correctness cases. Record which new tests pass and which fail under the old implementation. A new concurrency test need not fail if the old code happens to pass that schedule; do not fabricate a failure.
6. For key tests, demonstrate sensitivity with a temporary local fault: remove a notification, use a constant snapshot, return a fresh snapshot object, corrupt equality, or omit readiness completion. Confirm the relevant test fails for its intended assertion. Restore only your own fault edits; never reset unrelated work.
7. Refactor in small steps, running the relevant tests after each domain changes. End with the full suite and supported-version matrix.

### 6.2 Executable BDD requirements

Use `easy-bdd-tool-jest` and the project's `.scenario`, `.given`, `.when`, `.then`, `.and`, `.example`, and `.run` conventions. Every scenario must execute the described events and assert every material `Then` condition. Plain prose, TODO bodies, skipped tests, and unasserted render logs do not count.

Use `reporter(new FeatureFileReporter())`. Generate `.feature` files by running the BDD code; never edit those generated files directly. Use example tables for meaningful equality/status variants while keeping failures attributable to a specific case.

Use `__tests__/bdd.<Topic>.test.ts`, or `.test.tsx` when needed and consistent with project instructions. The current Jest regex also discovers arbitrary TypeScript files under `__tests__`; put reusable helpers under the excluded `__tests__/fixtures/` directory or explicitly configure their exclusion. Do not accidentally create a helper that Jest treats as an empty test suite.

Prefer names describing behavior, such as “A waiting indicator stays active until both matching actions finish.” Put scheduling machinery and low-level snapshot details in test code and comments.

### 6.3 Harness requirements

- Retain useful existing `react-test-renderer` tests, but add tests with a real `react-dom/client` root for DOM commits, hydration, and concurrent integration. React now deprecates `react-test-renderer`; it must not be the sole evidence for this change. See the [deprecation notice](https://react.dev/warnings/react-test-renderer).
- The current Jest default is `node`. Use a dedicated DOM Jest project or a file-level jsdom environment and install the matching environment dependency. Do not globally change the environment of all store/lint tests without a reason.
- Use an `act` helper valid for each supported React version, await async work, and configure the act environment in an actually loaded setup file. A file named `jest.setup.js` is not automatically loaded. Follow [React's act guidance](https://react.dev/reference/react/act).
- Build a deferred-promise helper and controllable fake persistor. Resolve/reject actions and reads explicitly. Avoid sleep-based races such as “wait 10 ms and hope rendering finished.” Use fake timers only for actual timer behavior and flush the associated microtasks deliberately.
- Unmount every root/renderer after each case, cancel/settle pending work, restore spies/timers, and remove DOM containers. `Store.log` is currently static; restore or isolate changes to avoid cross-test interference.
- Fail on unexpected React warnings, especially unhandled updates, hydration mismatches, snapshot-cache loops, invalid hooks, and maximum update depth. Allow only narrowly matched, asserted expected warnings/errors in tests designed to trigger them.
- Give render-loop and concurrency tests bounded failure conditions so a bad implementation fails rather than hanging.
- Keep one React instance per renderer environment. Be careful with `jest.resetModules`, version aliases, and mixing dependency trees; duplicate React instances can create misleading hook failures.

Write down any version-specific expected legacy-renderer deprecation warning instead of broadly silencing `console.error`. If testing production builds as an additional check, use a harness appropriate to production; do not assume development-only `act` behavior is available there.

### 6.4 What “correct re-renders” means

Record separately:

1. **Render attempts:** invocation of the component function.
2. **Committed results:** the selected values/DOM actually committed by React.
3. **Store notifications and selector calls:** useful diagnostics, not substitutes for UI correctness.

Use a layout-effect commit probe or appropriately placed `Profiler` plus DOM assertions. Store immutable records of what was read in that render; do not put a mutable object in a log and inspect its changed contents later. A parent probe may not run when only a subscribed child commits, so instrument at the correct boundary. For correlated DOM values, capture the complete tuple after relevant commits.

For simple non-Strict, settled updates, assert precise useful behavior: one unrelated field update causes **zero additional consumer renders**; a selected change appears after the update flush without a loop. Isolate parent rerenders with stable props or memoized fixtures so they do not masquerade as subscription rerenders.

In Strict Mode, React may intentionally invoke components and effects extra times. In concurrent work, React may abandon renders. Do not demand an identical raw render count across these modes or React majors. Still require bounded work, no leaked subscription, correct committed values, and no unrelated subscription-driven render after the baseline settles.

Do not require one commit for every dispatch in a batch, every transient status flip, or every selector invocation. Separately flushed events can have exact expected sequences. Grouped events need correct final state and valid committed intermediate states according to the chosen transaction boundaries.

For `useObject`, assert reference identity with `toBe`, not only deep equality, and verify a memoized child/effect depending on that object does not run again on an irrelevant update.

## 7. Required behavior matrix

Each row is a requirement to implement or map to existing executable tests. File names are suggestions, not mandatory architecture. Use unique scenario IDs in comments or a coverage record so the final report can show where each requirement is proved. Expand rows with multiple variants into examples or separate scenarios.

### A. State selection and avoided renders

Suggested file: `bdd.ExternalStoreSelection.test.ts`.

| ID | Given / When | Then: required assertions |
| --- | --- | --- |
| A01 | Store `{a: 1, b: 2}`; mount a component selecting `a`. | First committed value is 1; no follow-up render is needed merely to initialize a subscription. |
| A02 | That settled consumer; change only `b` in a new state object. | `a` remains 1 and consumer render/commit counts do not increase. |
| A03 | That consumer; change `a` to 3 in a separately flushed dispatch. | It commits 3, with bounded work and no duplicate steady-state subscription. |
| A04 | Consumers for `a`, `b`, and all state; change `a`, then `b`. | Only affected field consumers update; all-state consumer sees each replaced state. |
| A05 | Reducer returns null or the same state; also test `abortReduce`. | State consumers do not rerender; independently meaningful status/lifecycle work still happens. |
| A06 | A derived selector returns the same primitive for two different states, then a different one. | Equal derived result skips rendering; changed result updates. |
| A07 | Selected value is `NaN`; change another field, then change to/from a number. | `NaN` to `NaN` skips; actual selected changes render. |
| A08 | Selected field moves between 0 and -0, booleans, strings, null, and undefined as allowed. | `Object.is` behavior and displayed values are correct, including signed zero. |
| A09 | State contains immutable class instances and shared nested references; update unrelated fields, then replace the selected instance. | Shared selection skips; replaced selection renders; prototypes are not stripped. |
| A10 | Inline selector returns a fresh object/array; mount and dispatch a state change. | No snapshot-cache loop; identity selection renders for the new state. Also test a stable selector function returning a fresh result. |
| A11 | Two instances use the same selector function against different stores. | Results/caches do not leak across stores or component instances. |
| A12 | A selected value changes A→B→A in separate flushes and again within one batch. | Separate updates display all expected committed values; batch ends at A without stale cache or a required fabricated intermediate commit. |
| A13 | Several selectors are used in one component and one update changes several selected fields. | Committed tuple corresponds to a valid state; no missed field or render loop. |
| A14 | No consumers are mounted; update the state, then mount. | First snapshot is the latest state, not a cache created for an earlier subscriber. |
| A15 | Supported primitive/falsy root states are used. | Constructor, state snapshots, and selectors work with the documented reducer “no change” sentinel rules; audit root equality independently from field equality. |

### B. Object selection and reference stability

Extend `bdd.UseObject.test.ts`, `bdd.UseObjectNotPlainObjects.test.ts`, or use `bdd.ExternalStoreObjectSelection.test.ts`.

| ID | Given / When | Then: required assertions |
| --- | --- | --- |
| B01 | A fresh `{name, age}` selection; update an unrelated field. | No consumer rerender; returned selection retains reference identity. |
| B02 | Change name or age separately. | Each selected change appears; a changed selection has a new reference. |
| B03 | Parent/local state rerenders the consumer with an equivalent inline selector. | Selected object remains the same reference; dependent effect/memoized child is not needlessly retriggered. |
| B04 | Array selection; test equal contents, order, length, and one changed item. | Equal arrays reuse result; meaningful changes update. |
| B05 | Map selection; vary size, key identity, value identity, and insertion order. | Same ordered entries reuse result; changed entries/order update. |
| B06 | Set selection; vary contents and insertion order. | Same ordered values reuse result; changed membership/order update. |
| B07 | Nested values share references, then one is replaced by an equal-looking new object. | Shallow identity semantics are honored; no accidental deep comparison. |
| B08 | Null-prototype objects, changed prototypes, missing keys versus undefined-valued keys, and reordered plain-object keys. | Current useful key/prototype semantics are explicitly asserted. |
| B09 | Date, class instance, Map/Set subclass passed in a deliberate runtime fixture. | Same instance is equal; different instance is not equated merely because enumerable fields match. Keep runtime tests distinct from type restrictions. |
| B10 | Selected fields include `NaN`, 0/-0, null, and undefined. | Field comparisons retain the intended `Object.is` behavior. |
| B11 | A result passes through a speculative render which is abandoned; later render selects another/equal value. | Abandoned cache writes cannot corrupt committed selection or reference reuse. Link to concurrency cases. |

### C. Changing selectors and subscription lifetime

Extend `bdd.UseSelectChangingSelector.test.ts`, `bdd.UseSelectSubscription.test.ts`; add `bdd.ExternalStoreSubscriptions.test.ts` where useful.

| ID | Given / When | Then: required assertions |
| --- | --- | --- |
| C01 | Select item 0, rerender props for item 1 without a store update. | Item 1 is shown immediately on the prop render. |
| C02 | After the switch, update item 1, then item 0; switch back. | Current selection updates; abandoned selection does not cause unrelated renders; switching back reads its latest value. |
| C03 | A child dispatches in a layout effect and, separately, a passive effect before parent subscription is established. | Parent catches up without a later “rescue” dispatch. Check final DOM and relevant commits. |
| C04 | Props change the selector while a child layout effect changes the newly selected item during the same commit. | Latest props and latest state are used; old selector does not suppress the update. |
| C05 | Replace status action type A with B while B starts/fails during the commit. | Waiting, failure, and exception hooks use B correctly. |
| C06 | Rerender a consumer repeatedly with a new inline selector but the same store. | No accumulated listeners or unnecessary subscription churn from an unstable subscribe function. |
| C07 | Unmount, then dispatch; remount and dispatch again. | Old subscriptions are gone; remount reads latest values and updates once per intended event. |
| C08 | Strict Mode setup/cleanup replay, real unmount, then further store updates. | Active subscriber count returns to baseline after cleanup; no stale callbacks or warning. |
| C09 | A component renders but suspends/is abandoned before committing. | No persistent subscription is installed for abandoned work. |
| C10 | Multiple sibling and nested providers with distinct stores. | Each consumer and dispatcher uses the correct store; no cross-store notification. |
| C11 | Keyed provider replacement; also live prop replacement if adopted. | Old listeners/readiness callbacks are cleaned up and new store is read/bound correctly. If prop changes are intentionally ignored, test/document that contract instead. |
| C12 | Listener removal/addition or nested dispatch during notification, using a focused subscription fixture. | Defined listener iteration behavior, correct newest state, and no skipped required update or infinite loop. |

Do not expose production-only debug APIs just to count listeners. A narrow internal test seam or wrapping the internal subscribe function is sufficient. Keep observable behavior as the primary assertion.

### D. Waiting, failure, and exception behavior

Extend `bdd.UseIsWaitingAfterFailure.test.ts`, `bdd.UseIsWaitingSubclass.test.ts`; add `bdd.ExternalStoreStatus.test.ts`.

| ID | Given / When | Then: required assertions |
| --- | --- | --- |
| D01 | Controlled async action starts, waits, then completes with changed state. | Waiting false→true→false across deliberate async checkpoints; new state and completed waiting status form a valid committed combination. |
| D02 | Async action completes with null, same state, or aborted reduction. | Waiting ends even with unchanged state identity; state-only consumers do not render needlessly. |
| D03 | Async `before()` and, separately, async `reduce()` keep work pending. | Waiting reflects both supported async paths and eventually clears. |
| D04 | A synchronous successful, no-op, or failing action is dispatched. | Normal supported flows do not commit a transient waiting spinner for a wholly synchronous action; action/error outcomes remain correct. |
| D05 | Two matching actions run concurrently; start/finish them separately. | Waiting stays true until both finish; starting a second or finishing only one causes no extra render for an unchanged boolean. |
| D06 | Subscribers wait for an abstract base, exact class, subclass, and unrelated class. | `instanceof` relationships are correct; unrelated subscribers remain unchanged. |
| D07 | A `UserException` occurs without application-state change. | Failed boolean becomes true, exception reference appears, waiting ends. Test each hook alone and all together. |
| D08 | Retry a previously failed action and let it succeed, then repeat with another failure. | Prior error clears when appropriate, waiting appears during pending work, then success or new failure appears. |
| D09 | Clear an existing error, clear a missing error, and clear a different action's error. | Only relevant exception/failure consumers change; missing clear does not trigger a useful render. |
| D10 | A second failure provides a different exception object with the same message. | Exception consumer sees the new reference; failed-boolean consumer need not rerender if its value stays true at the tested checkpoint. |
| D11 | Fail subclass B and inspect base A and exact B. | Failure/exception matching uses the intended exact type, independently of waiting's inheritance behavior. |
| D12 | Error is transformed/swallowed by `wrapError` or `errorObserver`, or remains a non-UserException. | Status hooks, thrown/rejected results, and dialogs follow the existing deliberate error rules. |
| D13 | No status consumers exist when an action starts or fails; mount during/after it. | First read is accurate; no previously-observed-type requirement hides the status. |
| D14 | Mount a status consumer, switch its type, then start/fail the new type. | Subscription gating or caching does not miss the new type. |
| D15 | Action B changes status while component selects only action A. | No unrelated consumer render; repeat for waiting, failed, and exception hooks. |
| D16 | Abort before dispatch, abort by exception, dispatchSync rejects an async action, or reducer throws. | Waiting/failure cleanup agrees with the action contract; no stuck spinner, leaked lock, or unhandled test rejection. |
| D17 | Status changes while application-state identity remains fixed and an all-state consumer is mounted. | Status consumers update; all-state consumer remains quiet. |
| D18 | Component reads state plus waiting/failed/exception during success, failure, clear, and retry. | All committed tuples satisfy the defined publication boundaries; inspect history, not only the last value. |

Important D04 audit: the current in-progress collection can contain a synchronous action while its call stack is executing. Characterize imperative `isWaiting` calls from `before`/`after` separately from what React commits. Do not invent a new action-classification mechanism without checking its effects on action waits and lifecycle semantics. Do not certify spinner behavior using only a test that batches away every possible intermediate event.

### E. Readiness, persistence, and dispatch lifecycle

Extend `bdd.UseIsStoreReady.test.ts`, `bdd.UseDispatchLifecycle.test.ts`, `bdd.StoreReady.test.ts`; add integration BDDs as needed.

| ID | Given / When | Then: required assertions |
| --- | --- | --- |
| E01 | No persistor; mount ready consumer and dispatch lifecycle hook. | Ready starts true; no redundant readiness update; intended onMount behavior occurs. |
| E02 | Delayed persistor returns stored data. | Initial state is available during loading; eventual state is restored; ready becomes true; an effect gated by ready reads restored data. |
| E03 | Delayed read returns null; save-initial-state is delayed. | Readiness follows the documented complete initialization boundary, not merely read completion. |
| E04 | Read, delete-recovery, or initial-save fails. | Error handling runs, fallback state is correct, readiness settles, and no subscriber is stuck. Test distinct failure paths. |
| E05 | Restored state equals the initial state, or there is no replacement. | Ready consumer still updates; state identity is not its notification signal. |
| E06 | Readiness resolves between render and subscription, before mount, or after unmount. | Correct first/latest value; no missed event, unmounted update, or retained active callback. |
| E07 | Strict Mode replay while readiness is pending, then resolution. | Correct readiness; lifecycle onMount/onUnmount behavior is not duplicated. |
| E08 | onMount waits for ready; dependencies change before ready; unmount occurs before ready in another case. | Latest intended callbacks/deps are used; no callbacks run after a genuine early unmount. |
| E09 | onDepsChange and onUnmount use changing props while store updates cause renders. | Order, previous deps, and latest committed callback values remain correct. |
| E10 | Persistence restore uses `UpdateStateAction` and dispatch is gated before ready. | Internal restore works; ordinary premature dispatch retains its intended error; restored state is not spuriously persisted again. |
| E11 | Logout resets state with/without persistor; persistence is paused or errors occur. | Mounted consumers observe reset; persistence gates, error reporting, and recovery remain correct. |
| E12 | A successful selected update is persisted and releases state/action waiters. | React subscription changes do not skip or duplicate these side effects. |

### F. Selector errors and store-side correctness

Suggested file: `bdd.ExternalStoreSelectorErrors.test.ts` plus existing deleted-item BDDs.

| ID | Given / When | Then: required assertions |
| --- | --- | --- |
| F01 | Parent lists items; child selector dereferences its item; delete the item and unmount the child. | Action completes successfully, dispatch does not fail from the transient read, and the item disappears. |
| F02 | Repeat F01 with another healthy subscriber, a persistor, state observer, recorder, and waitCondition. | Healthy subscriber updates; observer/record/persist/wait behavior completes correctly; no downstream processing is skipped. |
| F03 | Selector persistently throws after a state change and remains mounted under an error boundary. | Boundary reports the real error; no infinite fallback to a stale selection; successful action is not mislabeled failed. |
| F04 | Selector throws on initial mount. | React error boundary behavior is correct; no leaked listener. |
| F05 | A selector/type changes while an old subscription's selector would throw. | New committed selection is respected; stale selector does not permanently poison the component. |
| F06 | Equality logic throws, if extensible equality is exposed or a controlled internal fixture can trigger it. | Error is handled through rendering, not action corruption or silent loss of future updates. |
| F07 | Error boundary recovers/reset and a later valid store update occurs. | Component can subscribe and display fresh data again. |

Assertions about action status, thrown dispatch values, persistence, and waits are essential here. An error boundary showing something by itself is not enough.

### G. Concurrent rendering and abandoned work

Suggested file: `bdd.ExternalStoreConcurrentRendering.test.tsx`, using a dedicated, version-verified harness.

| ID | Given / When | Then: required assertions |
| --- | --- | --- |
| G01 | Start a React-local-state transition rendering two related store consumers; pause after one reads version 1; update Kiss to version 2; resume. | No committed mixed-version tuple; final DOM reflects version 2. Prove the pause actually occurred. |
| G02 | Same schedule while a newly mounting consumer has read state but has not subscribed. | It cannot commit a stale result that waits indefinitely for another dispatch. |
| G03 | Render using props/selector A; start a transition using B that is abandoned; update the store and retain A. | Committed A remains correct; abandoned B does not replace the active selector/cache. |
| G04 | G03 with `useObject` and shallow-equal results in different renders. | Result identity and memoized children remain correct; shared ref cache cannot leak speculative values. |
| G05 | A store-dependent render suspends, store changes again, then the suspended work resumes. | Resumed result reflects current data; abandoned work has no persistent listener or obsolete result. |
| G06 | An urgent local-state update interrupts a transition that reads Kiss. | Committed combinations stay valid; UI converges without a loop or stale selection. |
| G07 | Dispatch is wrapped in `startTransition`. | Store-driven update obeys the chosen external-store scheduling contract; do not assert it becomes a non-blocking transition. Verify visible results and bounded work. |
| G08 | Mix status and state consumers while a pending render is interrupted by action completion/failure. | Committed tuples satisfy the defined action publication contract. |
| G09 | Pending readiness/store replacement is involved in abandoned work. | Old promise completions and old store updates do not update the new committed tree. |
| G10 | A Suspense boundary is triggered by a store-derived value. | Document and test the allowed fallback/recovery behavior; do not claim that external-store transitions preserve old content in every Suspense case. |

**Proving concurrency matters.** A synchronous `act(() => dispatch())` followed by a final DOM assertion does not prove G01. Establish an explicit schedule with evidence: first consumer read, work paused without commit, external update, resume, then commit history. Use a validated scheduler harness or a browser fixture that demonstrably yields. Controlled Suspense promises can cover abandonment/resumption cases, but a test that simply suspends and restarts everything may never exercise a partial render.

Consult [React's own external-store tests](https://github.com/facebook/react/blob/main/packages/use-sync-external-store/src/__tests__/useSyncExternalStoreShared-test.js) for patterns. Their private `internal-test-utils`, feature gates, and test-only renderer APIs are not automatically available in an npm consumer project. Do not copy private imports and assume the test runs. If using an unstable scheduler mock, prove the installed renderer uses it and keep that dependency isolated to tests.

At least one regression test must demonstrate the actual interrupted-render consistency condition. If an environment cannot exercise it, state that coverage gap and build an appropriate harness before calling the migration complete. No production mock of `useSyncExternalStore` can prove React integration.

Do not assert that every component function invocation observes one global version: work may be discarded. Assert consistency at the relevant commit boundary. Also distinguish stale-data tearing from intentional stale presentation through an explicitly adopted deferred-value feature.

### H. Server rendering and hydration

Suggested files: `bdd.ExternalStoreServerRendering.test.tsx` and `bdd.ExternalStoreHydration.test.tsx`.

| ID | Given / When | Then: required assertions |
| --- | --- | --- |
| H01 | Render selected state, object selection, and status/readiness hooks on the server. | Expected HTML; no missing-server-snapshot exception or browser-global access. |
| H02 | Server loads/dispatches data before rendering. | HTML uses the designated server render snapshot, not an obsolete constructor default. |
| H03 | Hydrate with matching transferred state. | Content matches; no recoverable hydration error or extra corrective mismatch render. |
| H04 | Live client store changes after server HTML is produced but before hydration. | Initial hydration uses server data; then UI catches up to live data without mismatch. |
| H05 | Delayed hydration inside a Suspense boundary while outside components update Kiss. | Delayed boundary hydrates consistently and catches up; verify this if supporting selective hydration. |
| H06 | Two independent server requests/providers have different state and status. | No cross-request snapshot/listener/data leakage. |
| H07 | Server snapshot includes class-based state and relevant collections. | Declared transfer/restoration mechanism retains required selector behavior and methods. |
| H08 | Readiness and status differ between captured server data and live client state. | Each hook follows the initial snapshot contract and subsequently reaches current values. |
| H09 | Render server-only, then discard the request. | No client subscription, effect-dispatched action, retained global cache, or unresolved test resource is created. |

Capture `onRecoverableError` from hydration and assert it is empty for supported matching flows. Also monitor unexpected console warnings. A test that ignores hydration errors while checking final text is inadequate.

### I. Core features, types, builds, and platforms

Suggested file: `bdd.ExternalStoreIntegration.test.ts`; retain all existing core BDD suites.

| ID | Given / When | Then: required assertions |
| --- | --- | --- |
| I01 | Component uses only dispatch facade/functions; unrelated state/status changes occur. | It does not become an unnecessary subscriber; returned functions remain stable for the same store. |
| I02 | Destructure dispatch methods and invoke sync/async/all/and-wait/when APIs. | Correct store binding, action results, and promise behavior. |
| I03 | A state change triggers `dispatchWhen` and other state waiters. | All waits see their intended triggering state; nested action order and persistence records remain correct. |
| I04 | Observer or lifecycle callback dispatches another action during publication. | Newest state wins, observers/waits have defined ordering, and React does not end with stale data. |
| I05 | Retry, debounce, throttle, fresh, non-reentrant, sequential, polling, and ignore-old actions execute representative paths with mounted status/state consumers. | Their existing action rules still hold and UI tracks accepted updates/completions. Reuse full core suites for detailed branches. |
| I06 | Optimistic action updates immediately then succeeds or rolls back. | Each deliberately flushed stage has correct state/status; rollback is visible; unrelated selections stay quiet. Include push-based variants already supported. |
| I07 | Shut down while async work/retries exist; complete or cancel as defined. | Existing shutdown behavior and eventual mounted status remain correct; no new listener leak. |
| I08 | Compile public hook use with inferred and explicit state/selection types, readonly values, and intended invalid `useObject` inputs. | Types remain intentional; negative cases truly fail; emitted declarations resolve helper types. |
| I09 | Build and load package through native Node ESM and CJS exports, then execute a hook integration fixture from built artifacts. | Runtime helper import resolves, store creation works, and hook functionality is not only tested through source imports. |
| I10 | Install a packed artifact in an isolated minimal consumer. | Runtime dependencies are present, exports and types resolve, and no source-tree/dev dependency masks a packaging omission. |
| I11 | Test supported React 18 and 19 versions with matching renderer packages. | Relevant BDDs, DOM/concurrency/hydration tests, builds, and type checks pass in each environment. |
| I12 | Exercise React Native-compatible usage/imports and the existing example as far as tooling permits. | Core runtime does not import DOM-only APIs; hooks and status work with a matching native-compatible renderer. Distinguish an actual native run from a source/import check in the report. |

Do not turn I05 into one enormous test. Use focused examples and rely on the existing detailed action suites. The important new coverage is the interaction with mounted consumers and the revised publication boundaries.

## 8. Existing BDDs to retain and strengthen

At inspection time, particularly relevant files included:

- `bdd.UseSelectSubscription.test.ts`: missed subscription update, deleted item, persistence/observer/wait continuation.
- `bdd.UseSelectChangingSelector.test.ts`: prop/type switches and updates during commit.
- `bdd.UseSelectNaN.test.ts`: NaN and signed-zero comparisons.
- `bdd.UseObject.test.ts`, `bdd.UseObjectNotPlainObjects.test.ts`: equality and object-result loops.
- `bdd.UseIsWaitingAfterFailure.test.ts`, `bdd.UseIsWaitingSubclass.test.ts`: error/retry/inheritance status behavior.
- `bdd.UseIsStoreReady.test.ts`, `bdd.StoreReady.test.ts`: initialization/readiness behavior.
- `bdd.UseDispatchLifecycle.test.ts`, `bdd.StableHookFunctions.test.ts`, `bdd.UseStoreDestructuring.test.ts`, `bdd.UseStoreDispatchAll.test.ts`: lifecycle and dispatch facade behavior.
- `bdd.DispatchWhenSync.test.ts`, `bdd.WaitConditionCleanup.test.ts`, `bdd.WaitConditionThrows.test.ts`, `bdd.WaitActionConditionOnDispatch.test.ts`, state/action wait suites: action boundaries and nested dispatch.
- `bdd.StateChange.test.ts`, `bdd.StateObserver.test.ts`, `bdd.ActionObserver.test.ts`, error observer suites: store-side contracts.
- Persistence, logout, optimistic, retry, shutdown, and other action feature BDDs.
- `build.esm.test.ts`: native ESM/CJS loading; it currently invokes the build itself.

Some existing files contain exact raw render counts or fixed-time sleeps. Preserve their meaningful assertions, but improve the harness where necessary. Never replace a failing “does not rerender for unrelated data” test with only a final-value assertion. If a count differs because of a real React scheduling distinction, record the reason and add the right commit/identity/efficiency assertion.

Review `tmp.review.*` tests and notes as evidence, not unquestionable specifications. Determine which tests are actually discovered and valid in the current checkout.

## 9. BDD implementation pattern

The following illustrates the required structure, not a ready-to-run file. The implementer must provide and verify the local fixtures, await all updates, and add cleanup. Do not leave placeholders in committed tests.

```ts
reporter(new FeatureFileReporter());
const feature = new Feature('Selecting state without unnecessary renders');

Bdd(feature)
  .scenario('Changing an unrelated field does not rebuild a name consumer.')
  .given('A store with a name and a counter, and a mounted name consumer.')
  .when('An action changes only the counter.')
  .then('The name stays the same and the consumer does not render again.')
  .run(async (_) => {
    const fixture = await mountNameConsumer();
    try {
      const before = fixture.measure();
      await fixture.dispatchCounterChange();
      expect(fixture.shownName()).toBe('Mary');
      expect(fixture.measure().renderAttempts).toBe(before.renderAttempts);
      expect(fixture.measure().commits).toBe(before.commits);
    } finally {
      await fixture.unmount();
    }
  });
```

For a changed selection, assert the new visible value, new committed selection, and lack of a loop. For shallow-equal object selections, also assert reference reuse and downstream memoization. For concurrency, use explicit scheduling checkpoints and all committed tuples. For status/readiness, use deferred work so pending and settled states are actually observed in separate checks.

## 10. Suggested implementation sequence

1. Complete independent source audit, baseline run, scenario mapping, and test harness.
2. Add regression BDDs for state/object selection, status-only updates, readiness, lifetime, errors, and actual concurrent interruption before replacing the production hooks.
3. Decide/document provider and server snapshot contracts. Add their tests first as well.
4. Add `use-sync-external-store` as a runtime dependency using a verified supported release. Check whether separate TypeScript declarations are required. Add test-only DOM/environment/renderer dependencies in the appropriate development sections.
5. Introduce store listener/getter interfaces and stable functions. Keep authoritative values and notification boundaries explicit.
6. Migrate state selection and object comparison through the selector helper. Remove redundant per-component selection caches after the relevant tests pass.
7. Migrate action status with direct selected snapshots or a verified immutable status snapshot. Eliminate stale observation gates and render-time bookkeeping where appropriate.
8. Migrate readiness and verify restoration plus `useDispatch` lifecycle interactions.
9. Resolve cross-domain publication ordering, nested dispatches, errors, and hydration. Run dedicated regressions after each correction.
10. Remove obsolete `_refStateHooks`, `_refStoreHooks`, `RefState`, `RefStore`, forced-render helper paths, unused imports, and obsolete comments once all replacements are in place. Retain effects needed for lifecycle callbacks; replacing subscriptions does not eliminate all legitimate effects.
11. Update public docs, examples, type tests, build checks, and CI. Review lint rules such as no-new-object-in-useSelect, new-values-in-useObject, store-in-selector, and store-state-in-render for accurate explanations. Allocation-heavy identity selection can still cause unnecessary renders even when the helper prevents a loop.
12. Run the full verification matrix, independently re-read the final design, and produce the evidence report below.

Do not keep both old and new subscription engines active as a permanent solution. Temporary staging must not leave duplicate listeners, contradictory caches, or a fallback that hides failures.

## 11. Verification commands and packaging details

Use the package manager and installed tool versions appropriate to the checkout. Typical existing commands from the repository root are:

```text
npx tsc --noEmit -p tsconfig.json
npm run lint
npx jest __tests__/bdd.UseSelectSubscription.test.ts --runInBand
npx jest __tests__/bdd.UseSelectChangingSelector.test.ts --runInBand
npx jest __tests__/bdd.UseObject.test.ts --runInBand
npm test -- --runInBand
npm run build
```

Add commands for the new DOM, concurrency, server, hydration, and type suites, and ensure the main CI command actually includes them. Tests must not merely exist outside the discovery pattern. The root TypeScript config has an explicit source file list; type fixtures require an explicit checked path/config or another verified mechanism.

Run the React matrix in isolated installs or CI jobs. Match React, ReactDOM, test renderer, and types. Current CI swaps only React/test-renderer packages for its React 18 job; update that when DOM tests are added. Consider the lowest supported React release as well as current versions within the supported majors, or deliberately revise the declared range and document it. Do not claim an entire major range was exercised because one latest version passed.

Preserve native Node ESM and CJS behavior. The ESM postprocessor rewrites relative imports and renames files; inspect how the new bare package subpath import is resolved. Verify actual published exports and declarations rather than guessing a deep path into the helper's internals.

For packed-artifact verification, create an isolated temporary consumer, use the actual produced tarball, install only declared runtime dependencies plus the test consumer's React/renderer, and run import/require/type/hook smoke tests there. Use the existing build path carefully: `npm pack` can run lifecycle scripts, and `build.esm.test.ts` already triggers a build. Avoid concurrent commands that clean or rewrite the same `lib` directory. Do not publish the package as part of verification.

Core runtime must remain usable without browser globals and without a `react-dom` runtime dependency. DOM renderer imports belong in test/demo code. Test React Native resolution according to the selected helper package's published conditions and available project tooling.

Benchmark only after correctness: a representative set of components selecting independent fields, equal object selections, and status-only changes. Record notifications, selector work, render attempts, and commits separately. No fixed microsecond threshold should become a flaky correctness test.

## 12. Independent double-check before declaring completion

Re-read the implementation afresh and answer each question from code and executable evidence:

- Does every getter read the domain the component actually uses, with correct identity behavior between updates?
- Can a state/status/readiness mutation happen without the corresponding subscriber eventually seeing it, including before first subscription?
- Can a selector or comparator cache be affected by an abandoned render?
- Are any mutable live objects masquerading as stable snapshots?
- Are snapshot publication and action lifecycle boundaries coherent under nested dispatches and thrown callbacks?
- Can a render error interrupt persistence, action completion, another subscriber, or a wait condition?
- Do prop/type changes and supported provider replacement select and subscribe to the correct source?
- Are ordinary irrelevant updates demonstrably skipped, including object reference reuse?
- Are Strict Mode replay and real unmount cleanup independently tested?
- Does the concurrency harness prove it paused work at the point claimed by its scenario?
- Are all committed correlated values valid, not merely the final screen?
- Is readiness settled correctly after every initialization success/failure path?
- Do server rendering and delayed hydration use the intended initial data without cross-request leakage?
- Is `startTransition`/Suspense behavior described honestly, without confusing async actions with render priority?
- Are helper imports, runtime dependencies, types, ESM/CJS builds, and renderer compatibility verified from packaged output?
- Did any failing test get weakened to conceal a regression? If behavior changed deliberately, is the replacement contract explicit and tested?
- Do full core-action, persistence, serialization, wait, error, and lint suites still pass?

Fix problems exposed by this review and add missing regression BDDs before finishing. Perform this second pass independently of the assumptions that guided the initial implementation.

## 13. Completion evidence to deliver

The final implementation report should contain:

1. The chosen state/status/readiness snapshot design and publication boundaries, with reasons.
2. Provider and server/hydration contracts and any intentional API/design changes.
3. A mapping from A01–I12 scenario IDs to actual test files and scenario names; mark reused coverage explicitly. Every required row must be implemented or have a specific, justified resolution recorded.
4. Baseline results, genuine pre-refactor failures, post-refactor results, and sensitivity checks for the most important new tests.
5. Exact React/helper/renderer/Node versions tested and commands run, including full suite, types, lint, builds, package smoke tests, and platform checks.
6. Evidence that irrelevant updates skip renders and equal object selections retain references, plus actual interrupted-render and hydration coverage.
7. Remaining limitations or unexecuted environment-dependent checks, clearly distinguished from verified behavior. Do not report an unavailable native/browser environment as a passing native/browser test.
8. Updated documentation explaining the scheduling tradeoff and pure/immutable selection requirements in simple language.

Do not declare the migration complete with missing core-domain tests, a skipped consistency test, persistent warnings, or unexplained failures. Investigate baseline failures in affected areas rather than using them as a blanket exemption. The goal is a simpler React integration backed by strong evidence that Kiss still performs all its intended functions correctly.
