# Lint rules for Kiss

The lint rules that make sense for the Kiss ESLint plugin (`eslint-plugin/`), based on the
rules of [async_redux_lints](https://pub.dev/packages/async_redux_lints), one by one, plus
rules that only exist in Kiss.

- **Names:** ESLint rule names use kebab-case, so `dispatch_sync_async_action` becomes
  `dispatch-sync-async-action`. Otherwise, the name is kept when the rule is the same, and
  adapted when Kiss or React use other names (for example, `build` becomes `render`).
- **Severity:** the same as in AsyncRedux, unless noted. Info rules become `warn` in ESLint
  (ESLint has no "info"), and opt-in rules are left out of `kiss.configs.recommended`.
- **Types:** rules marked "needs types" only work with type information
  (`parserOptions.projectService`). Without it, they report nothing (or less).
- **Tests:** as in AsyncRedux, some rules are not reported in tests. Tests are files named
  `*.test.*` or `*.spec.*`, and files in `__tests__` directories.

## Summary

| Status      | Count                         |
|-------------|-------------------------------|
| Implemented | 48 (39 from AsyncRedux, 9 new) |
| Skipped     | 34 (from AsyncRedux)          |

Total: the 73 AsyncRedux rules (39 implemented, 34 skipped), and 9 new rules (all
implemented).

All rules planned here are implemented, except two that turned out not to make sense in Kiss
(`dispatch-in-global-wrap-error` and `throw-in-read-state`, see below). The sections 3 and 4
below are the plan. The final behavior of each rule, which sometimes differs in the details,
is documented in [`eslint-plugin/README.md`](eslint-plugin/README.md).

## 1. The AsyncRedux rules, one by one

| #  | AsyncRedux rule                           | Kiss rule                                                                     | Verdict                                                                                                                                                                      |
|----|-------------------------------------------|-------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | `reduce_return_type`                      | -                                                                             | Skipped. TypeScript already reports wrong `reduce` return types, since `reduce` must return `St \| null \| Promise<((state: St) => St \| null) \| null>`.                     |
| 2  | `before_return_type`                      | -                                                                             | Skipped. TypeScript already reports it (`void \| Promise<void>`). But see the new rule [`async-after`](#async-after).                                                        |
| 3  | `wrap_reduce_return_type`                 | -                                                                             | Skipped. TypeScript already reports it.                                                                                                                                      |
| 4  | `reduce_without_await`                    | [`reduce-without-await`](#reduce-without-await)                               | Implemented, adapted. In Kiss it doesn't lose state changes, but it makes the action async for nothing. |
| 5  | `dispatch_sync_async_action`              | `dispatch-sync-async-action`                                                  | Implemented. |
| 6  | `incompatible_mixins`                     | [`incompatible-action-features`](#incompatible-action-features)               | Implemented, adapted. Reports the action features that can't be combined (the same checks the store does on dispatch), including the ones an `OptimisticCommand` or an `OptimisticSync` can't use. |
| 7  | `polling_with_caveat_mixin`               | [`polling-with-caveat`](#polling-with-caveat)                 | Implemented, adapted: `checkInternet`, `nonReentrant`, `throttle`, `fresh` or `sequential` in an action with `poll`. |
| 8  | `wait_fail_invalid_argument`              | -                                                                             | Skipped. The TypeScript types of `isWaiting`, `isFailed`, `exceptionFor` and their hooks only accept action classes.                                                         |
| 9  | `wait_fail_never_matches`                 | [`wait-fail-never-matches`](#wait-fail-never-matches)                         | Implemented, adapted. Only the "sync action in `isWaiting`" case applies. Abstract classes in `isFailed` are already TypeScript errors, and `isWaiting` accepts them in Kiss. |
| 10 | `avoid_context_state`                     | [`avoid-use-all-state`](#avoid-use-all-state)                                 | Implemented, adapted: `useAllState` is the Kiss version of `context.state`. |
| 11 | `context_state_in_init_state`             | -                                                                             | Skipped. React has no `initState`. Hooks used outside rendering are reported by `eslint-plugin-react-hooks` (`rules-of-hooks`).                                             |
| 12 | `context_in_dispose`                      | -                                                                             | Skipped. React effect cleanups can use the store.                                                                                                                            |
| 13 | `context_in_selector`                     | [`store-in-selector`](#store-in-selector)                                     | Implemented, adapted. |
| 14 | `select_outside_build`                    | -                                                                             | Skipped. Already reported by `eslint-plugin-react-hooks` (`rules-of-hooks`).                                                                                                 |
| 15 | `vm_field_not_in_equals`                  | -                                                                             | Skipped. Kiss has no view-models.                                                                                                                                            |
| 16 | `copy_missing_field`                      | [`copy-missing-field`](#copy-missing-field)                                   | Implemented. |
| 17 | `state_class_must_be_immutable`           | [`state-class-must-be-immutable`](#state-class-must-be-immutable)             | Implemented. |
| 18 | `state_class_missing_equality`            | -                                                                             | Skipped. Kiss compares states by identity (`===`), and never calls an `equals`.                                                                                              |
| 19 | `equality_missing_field`                  | -                                                                             | Skipped, same reason.                                                                                                                                                        |
| 20 | `equality_missing_inherited_field`        | -                                                                             | Skipped, same reason.                                                                                                                                                        |
| 21 | `equatable_props_missing_field`           | -                                                                             | Skipped. There's no `Equatable` in TypeScript.                                                                                                                               |
| 22 | `extend_base_action`                      | [`extend-base-action`](#extend-base-action)                                   | Implemented. |
| 23 | `dependencies_cast_in_action`             | -                                                                             | Skipped. Kiss has no `environment`, `dependencies` or `configuration` in the store.                                                                                          |
| 24 | `prefer_return_null`                      | [`prefer-return-null`](#prefer-return-null)                                   | Implemented. |
| 25 | `stale_state_after_await`                 | `stale-state-after-await`                                                     | Implemented. |
| 26 | `after_throws`                            | [`after-throws`](#after-throws)                                               | Implemented. |
| 27 | `missing_super_in_mixin_override`         | [`missing-super-in-override`](#missing-super-in-override)                     | Implemented, adapted: Kiss has no mixins, but `checkInternet`, `OptimisticCommand` and `OptimisticSync` depend on inherited methods. |
| 28 | `user_exception_outside_action`           | [`user-exception-outside-action`](#user-exception-outside-action)             | Implemented. |
| 29 | `user_exception_without_cause`            | [`user-exception-without-cause`](#user-exception-without-cause)               | Implemented. Uses `withHardCause` instead of `addCause`. |
| 30 | `dispatch_in_global_error_observer`       | [`dispatch-in-global-wrap-error`](#dispatch-in-global-wrap-error)             | Skipped. Checked in Kiss's code and with a test: dispatching from `globalWrapError` (or an action's `wrapError`) works fine. |
| 31 | `throw_in_global_error_observer`          | [`throw-in-global-wrap-error`](#throw-in-global-wrap-error)                   | Implemented. |
| 32 | `retry_without_non_reentrant`             | [`retry-without-non-reentrant`](#retry-without-non-reentrant)                 | Implemented. |
| 33 | `dispatch_and_wait_unlimited_retries`     | [`dispatch-and-wait-unlimited-retries`](#dispatch-and-wait-unlimited-retries) | Implemented. |
| 34 | `async_mixin_in_sync_action`              | [`async-feature-in-sync-action`](#async-feature-in-sync-action)               | Implemented, adapted: Kiss has features, not mixins. `retry` is already covered by `retry-requires-async-reduce`. |
| 35 | `sequential_deadlock`                     | -                                                                             | Not implemented yet. Kiss now has `sequential`, so this rule could be added.                                                                                                 |
| 36 | `sequential_before_super_not_first`       | -                                                                             | Skipped. Kiss's `sequential` waits for its turn before calling `before`, so there's no `super` to call.                                                                      |
| 37 | `sequential_after_super_not_in_finally`   | -                                                                             | Skipped. Kiss's `sequential` releases the queue itself after `after`, so there's no `super` to call.                                                                         |
| 38 | `polling_action_restarts_polling`         | -                                                                             | Not implemented yet. Kiss now has polling, so this rule could be added: `createPollingAction()` returning an action with `Poll.start` or `Poll.runNowAndRestart`.          |
| 39 | `server_push_associated_action`           | -                                                                             | Skipped. Kiss has no server push.                                                                                                                                            |
| 40 | `internet_simulation_in_production`       | [`testing-feature-in-production`](#testing-feature-in-production)             | Implemented, adapted: Kiss's testing features are mocks, `record`, the test-only wait methods, and the internet simulation (`store.forceInternetOnOffSimulation`, and `internetOnOffSimulation` returning `true` or `false`, as in AsyncRedux). |
| 41 | `prefer_immutable_collections`            | [`prefer-readonly-collections`](#prefer-readonly-collections)                 | Implemented, adapted: TypeScript's `readonly T[]`, `ReadonlyMap` and `ReadonlySet`, instead of `fast_immutable_collections`. |
| 42 | `non_state_object_in_state`               | [`non-state-object-in-state`](#non-state-object-in-state)                     | Implemented, with the TypeScript/React versions of these objects. |
| 43 | `missing_initial_state`                   | [`missing-initial-state`](#missing-initial-state)                             | Implemented, opt-in, since the Kiss docs say a static `initialState` is optional, and often use `new State()` directly. |
| 44 | `event_name_suffix`                       | -                                                                             | Skipped. Kiss has no events (`Evt`).                                                                                                                                         |
| 45 | `event_not_spent_initially`               | -                                                                             | Skipped, same reason.                                                                                                                                                        |
| 46 | `event_persisted`                         | -                                                                             | Skipped, same reason.                                                                                                                                                        |
| 47 | `dispatch_in_build`                       | [`dispatch-in-render`](#dispatch-in-render)                                   | Implemented. React's "build" is "render". |
| 48 | `prefer_dispatch_without_context`         | -                                                                             | Skipped. In React, dispatching always goes through hooks or the store, never a `context`.                                                                                    |
| 49 | `context_read_in_build`                   | [`store-state-in-render`](#store-state-in-render)                             | Implemented, adapted: reading `store.state` while rendering, instead of `context.read()`. |
| 50 | `refresh_indicator_without_wait`          | -                                                                             | Skipped. React Native's `RefreshControl` doesn't wait for a promise: its spinner is controlled by the `refreshing` prop.                                                      |
| 51 | `then_on_dispatch_and_wait`               | [`then-on-dispatch-and-wait`](#then-on-dispatch-and-wait)                     | Implemented. |
| 52 | `user_exception_dialog_placement`         | -                                                                             | Skipped. Kiss shows errors with the `showUserException` store option, not with a widget placed in the tree.                                                                  |
| 53 | `navigator_key_not_set`                   | -                                                                             | Skipped. Kiss has no `NavigateAction`.                                                                                                                                       |
| 54 | `debug_observer_in_release`               | [`debug-observer-in-release`](#debug-observer-in-release)                     | Implemented, adapted to Kiss's debug tools. |
| 55 | `implements_persistor`                    | -                                                                             | Skipped. With `implements Persistor`, TypeScript makes the class implement all members of `Persistor`, including the error queue (`addError`), so nothing silently breaks. |
| 56 | `throw_in_read_state`                     | [`throw-in-read-state`](#throw-in-read-state)                                 | Skipped. In Kiss, `addError` and `return null` don't keep the saved data either (Kiss then saves the initial state), and the `Persistor` docs say `readState` should throw when the saved state is corrupted. |
| 57 | `initial_state_not_saved`                 | -                                                                             | Skipped. Kiss reads the saved state, and calls `saveInitialState`, by itself.                                                                                                |
| 58 | `timer_or_stream_not_in_props`            | -                                                                             | Skipped. Kiss has no store props.                                                                                                                                            |
| 59 | `expect_without_waiting`                  | [`expect-without-waiting`](#expect-without-waiting)                           | Implemented. |
| 60 | `vm_create_from_reused_factory`           | -                                                                             | Skipped. Kiss has no view-model factories. But see the new rule [`dispatch-same-action-twice`](#dispatch-same-action-twice), which is similar.                              |
| 61 | `action_status_details_in_production`     | [`action-status-details-in-production`](#action-status-details-in-production) | Implemented. |
| 62 | `action_name_ends_with_action`            | [`action-name-ends-with-action`](#action-naming-rules)                        | Implemented, opt-in. |
| 63 | `action_name_ends_with_underscore_action` | [`action-name-ends-with-underscore-action`](#action-naming-rules)             | Implemented, opt-in. |
| 64 | `action_name_without_action`              | [`action-name-without-action`](#action-naming-rules)                          | Implemented, opt-in. |
| 65 | `action_file_name_ends_with_action`       | [`action-file-name-ends-with-action`](#action-file-naming-rules)              | Implemented, opt-in. |
| 66 | `action_file_name_starts_with_action`     | [`action-file-name-starts-with-action`](#action-file-naming-rules)            | Implemented, opt-in. |
| 67 | `prefer_dispatch_with_context`            | -                                                                             | Skipped, as `prefer_dispatch_without_context`.                                                                                                                               |
| 68 | `avoid_abort_dispatch`                    | [`avoid-abort-dispatch`](#avoid-abort-dispatch-and-avoid-wrap-reduce)         | Implemented, opt-in. The Kiss docs also call it "a complex power feature that you may not need to learn". |
| 69 | `avoid_wrap_reduce`                       | [`avoid-wrap-reduce`](#avoid-abort-dispatch-and-avoid-wrap-reduce)            | Implemented, opt-in. Same. |
| 70 | `global_error_observer_without_env`       | -                                                                             | Skipped. Kiss has no `environment`.                                                                                                                                          |
| 71 | `missing_key_params`                      | [`missing-key-params`](#missing-key-params)                                   | Implemented, opt-in. For `nonReentrant` actions, `OptimisticCommand` and `OptimisticSync`. |
| 72 | `route_in_state`                          | [`route-in-state`](#route-in-state)                                           | Implemented, opt-in, with React's router names. |
| 73 | `action_without_to_string`                | -                                                                             | Skipped. Kiss's `KissAction.toString()` already shows all fields of the action.                                                                                              |

## 2. The first rules

| Rule                          | Severity | From                                 |
|-------------------------------|----------|--------------------------------------|
| `no-new-object-in-use-select` | error    | New in Kiss                          |
| `stale-state-after-await`     | error    | AsyncRedux `stale_state_after_await` |
| `prefer-state-parameter`      | warning  | New in Kiss                          |
| `retry-requires-async-reduce` | error    | New in Kiss                          |
| `dispatch-sync-async-action`  | error    | AsyncRedux, same name                |

See `eslint-plugin/README.md` for their details.

## 3. The plan for the rules from AsyncRedux

### reduce-without-await

Warning (AsyncRedux: error). An async `reduce` with no `await` at all:

```ts
async reduce() {                                // Warning
  return (state: State) => state.add(1);
}
```

Unlike AsyncRedux, this doesn't lose state changes in Kiss, since the returned function gets
the current state. But the `async` makes the action async for nothing: `dispatchSync`
throws, `isWaiting` is true for a moment, and the component renders one more time.

Quick fix (suggestion): make `reduce` sync, turning `return () => x` and
`return (state) => x` into `return x` (with `this.state` instead of `state`).

### wait-fail-never-matches

Warning. `isWaiting` (or `useIsWaiting`) with a sync action class, which is always `false`,
since a sync action finishes before anything can wait for it:

```ts
const isWaiting = useIsWaiting(Increment); // Warning: `Increment` is sync.
```

An action is sync when its `reduce` and `before` are sync, and it doesn't set
`checkInternet`. `isFailed(Increment)` is fine, since sync actions can fail. Needs types,
when the action class is in another file.

### avoid-use-all-state

Warning (AsyncRedux: info). `useAllState()`, and `useSelect((state) => state)`, which
re-render the component on any state change:

```tsx
const state = useAllState<State>();                    // Warning
return <p>{state.user.name}</p>;

const name = useSelect((state: State) => state.user.name); // OK
```

When the component really needs the whole state, for example when the state is a number,
use `// eslint-disable-next-line`. Not reported in tests.

Quick fix (automatic): replace it with one `useSelect` per path the component uses, named
after the path, like the AsyncRedux fix: `state.user.name` and `state.user.age` become
`const userName = useSelect((state: State) => state.user.name)` and
`const userAge = useSelect(...)`. Not offered when the state itself is used, like
`console.log(state)`.

### store-in-selector

Error. A selector of `useSelect` or `useObject`, or a condition of `useDispatchWhen`,
`waitCondition` or `dispatchWhen`, that doesn't only use its parameter. A selector that
dispatches, or reads the state from elsewhere, is wrong:

```tsx
const state = useAllState<State>();
const items = useSelect((s: State) => state.items);     // Error: use `s`.
const items = useSelect((s: State) => { dispatch(new X()); return s.items; }); // Error
```

Reports: dispatches, `store.state`, and variables that hold the state (from `useAllState`,
or another selector). Quick fix, for reading the state: use the parameter.

### copy-missing-field

Warning. A `copy` (or `with...`) method of a state class that can't change some fields,
when it lists the fields as parameters:

```ts
class State {
  constructor(readonly name: string, readonly age: number) {}
  copy({ name }: { name?: string }) {        // Warning: 'age' is missing.
    return new State(name ?? this.name, this.age);
  }
}
```

A `copy(changes: Partial<State>)` with `Object.assign` or a spread has all fields, and is
not reported. A state class is the `St` of a `Store<St>` or `KissAction<St>`, and the
classes it contains. Needs types. Quick fix: add the missing fields.

### state-class-must-be-immutable

Warning. A state class with fields that are not `readonly`:

```ts
class State {
  count: number;            // Warning
  readonly name: string;    // OK
}
```

A state class is the `St` of a `Store<St>` or `KissAction<St>`, and the classes it contains.
Needs types. Quick fix (automatic): add `readonly`.

### extend-base-action

Warning (AsyncRedux: info). An action that extends `KissAction<State>` directly, instead of
the app's base action, like `abstract class Action extends KissAction<State> {}`:

```ts
class LoadUser extends KissAction<State> { ... } // Warning
class LoadUser extends Action { ... }            // OK
```

Not reported for abstract classes, actions with a generic state, or in tests. Quick fix
(suggestion): extend the base action, one suggestion for each abstract class of the project
that extends `KissAction<State>` directly (up to 3), adding the import. Needs types to find
the base actions in other files.

### prefer-return-null

Warning (AsyncRedux: info). A reducer that returns the state unchanged. Return `null`
instead, which tells Kiss the state didn't change (and avoids an extra render):

```ts
reduce() {
  if (this.state.user === null) return this.state; // Warning
  if (this.state.user === null) return null;       // OK
}

async reduce() {
  await save();
  return (state: State) => state;                  // Warning
  return null;                                     // OK
}
```

Quick fix (automatic): return `null`.

### after-throws

Warning. A `throw` in the `after` method of an action, outside a `try` that catches it.
Kiss logs the error, and ignores it:

```ts
after() {
  if (this.state.user === null) throw new Error('No user'); // Warning
}
```

### missing-super-in-override

Error. An override that silently turns off a Kiss feature, because it doesn't call `super`:

- `before()` without `super.before()`, in an action that sets `checkInternet` (or inherits
  it). The internet check stops working:

  ```ts
  class LoadUser extends Action {
    checkInternet = { dialog: true };
    async before() { await this.prepare(); }                      // Error
    async before() { await super.before(); await this.prepare(); } // OK
  }
  ```

- `reduce()` in a subclass of `OptimisticCommand` or `OptimisticSync`, whose docs say "Do NOT
  override this method". The optimistic update stops working.

Quick fix, for `before`: add `await super.before();` as the first statement.

### user-exception-outside-action

Warning. A `UserException` thrown where Kiss can't catch it: in a component, an event
handler, a hook, an effect, or the `after` method of an action. A `UserException` is only
shown to the user when it's thrown from the `before` or `reduce` of an action:

```tsx
<button onClick={() => { throw new UserException('Invalid'); }} />           // Warning
<button onClick={() => dispatch(new UserExceptionAction('Invalid'))} />      // OK
```

Throws caught by a `try` in the same function are not reported. Quick fix (suggestion):
dispatch a `UserExceptionAction` instead.

### user-exception-without-cause

Warning (AsyncRedux: info). A `UserException` that replaces another error without keeping
it as its `hardCause`. Checks `UserException`s created in a `catch` clause, in the
`wrapError` of an action or persistor, and in `globalWrapError`:

```ts
try {
  return this.state.copy({ count: parseNumber(text) });
} catch (error) {
  throw new UserException('Please enter a valid number');                       // Warning
  throw new UserException('Please enter a valid number').withHardCause(error); // OK
}
```

Not reported in tests. Quick fix (automatic): add `.withHardCause(error)`.

### dispatch-in-global-wrap-error

**Skipped.** Checked in Kiss's code, and with a test: dispatching from `globalWrapError`, or
from an action's `wrapError`, works fine (the dispatched actions run and change the state, and
nothing breaks). The plan was:

Warning. A dispatch inside `globalWrapError`, or the `wrapError` of an action, which run
while the store is still processing the action that failed. To show the error to the user,
return a `UserException` instead.

Before implementing it, check how Kiss behaves when these dispatch. If it works fine, skip
this rule.

### throw-in-global-wrap-error

Warning (AsyncRedux: info). A `throw` in `globalWrapError`. Kiss uses a thrown error just
like a returned one, but its docs recommend returning it:

```ts
globalWrapError: (error) => {
  throw new UserException('Failed').withHardCause(error);  // Warning
  return new UserException('Failed').withHardCause(error); // OK
}
```

Quick fix (automatic): change `throw` to `return`.

### retry-without-non-reentrant

Warning (AsyncRedux: info). An action with `retry` but not `nonReentrant = true`. The Kiss
docs recommend it for most actions with `retry`, so that a new dispatch doesn't run while
the previous one is still retrying:

```ts
class LoadText extends Action {
  retry = { on: true };     // Warning
  nonReentrant = true;      // Without this line.
}
```

Not reported for `OptimisticCommand`, which has its own non-reentrant key, for
`OptimisticSync`, which can't use `retry` nor `nonReentrant`, when the action
overrides `abortDispatch`, or in tests. Quick fix (automatic): add `nonReentrant = true;`.

### dispatch-and-wait-unlimited-retries

Warning. `dispatchAndWait` or `dispatchAndWaitAll` (or their hooks) with an action that
retries forever, with `retry = { maxRetries: -1 }` or `unlimitedRetries: true`. The promise
never resolves if the action keeps failing:

```ts
await store.dispatchAndWait(new LoadText()); // Warning
store.dispatch(new LoadText());              // OK
```

Not reported in tests. Needs types, when the action class is in another file.

### async-feature-in-sync-action

Warning. An action whose `reduce` is sync, but that uses a feature meant for async work:
`nonReentrant` (a sync action never runs twice at the same time) or `checkInternet` (a
sync reducer doesn't use the network, and the check makes the action async, so
`dispatchSync` throws):

```ts
class Increment extends Action {
  nonReentrant = true;                                    // Warning
  reduce() { return this.state.add(1); }
}
```

`retry` is covered by `retry-requires-async-reduce`. Not reported when the action overrides
`before` or `wrapReduce`, or in tests. Quick fix (suggestion): remove the property.

### testing-feature-in-production

Warning. Kiss features meant for tests, used in code that is not a test:

- `store.mocks` and `store.record`.
- The wait methods that the docs say are for tests only: `waitActionType`,
  `waitAllActionTypes`, `waitAnyActionTypeFinishes`, and `waitAllActions` with no actions
  (which waits for all actions, and may deadlock).
- Setting `store.forceInternetOnOffSimulation`, and an `internetOnOffSimulation` getter in an
  action that returns `true` or `false` (the AsyncRedux rule).

```ts
store.mocks.add(LoadUser, () => null); // Warning, outside a test.
```

### prefer-readonly-collections

Warning (AsyncRedux: info). A field of a state class whose type is a mutable array, `Map` or
`Set`:

```ts
class State {
  readonly users: User[];            // Warning
  readonly users: readonly User[];   // OK
  readonly ids: Set<string>;         // Warning
  readonly ids: ReadonlySet<string>; // OK
}
```

Only the type of the field is checked, not its type arguments. Needs types (to know the
state classes). Not reported in tests. Quick fix (suggestion): change the type to
`readonly T[]`, `ReadonlyArray<T>`, `ReadonlyMap` or `ReadonlySet`.

### non-state-object-in-state

Warning. A field of a state class that holds an object that is not state:

- A `Promise`, a timer (`ReturnType<typeof setTimeout>`, `NodeJS.Timeout`), an
  `AbortController`, a `WebSocket`, an `EventSource` or a `Worker`. Keep these outside the
  state, for example in a module, or in the action that uses them.
- A DOM node, like an `HTMLElement`, a React ref (`RefObject`), or a React element
  (`ReactNode`). Keep these in the component.

Subclasses and type arguments are checked too, like `Promise<User>[]`. Functions are fine.
Needs types.

### missing-initial-state

Implemented as an **opt-in** rule, since the Kiss docs say a static `initialState` is optional,
and often create the store with `new State()` directly.

Warning (AsyncRedux: info). A store whose initial state is not created with the state
class's static `initialState`, which is how the Kiss docs create it:

```ts
class State {
  static initialState: State = new State({ todoList: TodoList.empty });
}

const store = createStore<State>({ initialState: new State(...) });         // Warning
const store = createStore<State>({ initialState: State.initialState });     // OK
```

Reported when the state class has no static `initialState` (property, getter or method), or
when the store calls the constructor directly. Not reported for states that are not
classes, like `createStore<number>`, or in tests.

### dispatch-in-render

Warning. A dispatch that runs while the component renders. It dispatches again on every
render, and loops forever when the action changes the state:

```tsx
function User() {
  const dispatch = useDispatch();
  dispatch(new LoadUser());                                       // Warning
  useDispatch({ onMount: (store) => store.dispatch(new LoadUser()) }); // OK
  return <button onClick={() => dispatch(new LoadUser())} />;     // OK
}
```

Checks the body of function components (functions whose name starts with an uppercase
letter, or that return JSX). Dispatches in event handlers, effects, `useDispatch`
callbacks, and other closures, are not reported.

### store-state-in-render

Warning. Reading `store.state` while the component renders, for example from a store
imported from another file. It reads the state once, and the component doesn't re-render
when the state changes:

```tsx
import { store } from './store';

function User() {
  const name = store.state.user.name;                         // Warning
  const name = useSelect((state: State) => state.user.name);  // OK
}
```

Reading `store.state` in event handlers and effects is fine. Needs types (to know that
`store` is a `Store`). Quick fix (suggestion): convert to `useSelect`, like the fix of
`avoid-use-all-state`.

### then-on-dispatch-and-wait

Warning. `.then(...)` on the promise returned by `dispatchAndWait`, whose callback ignores
the status. When the action fails with a `UserException` (shown to the user, so swallowed),
the promise still resolves, so the callback always runs:

```ts
dispatchAndWait(new SaveUser()).then(() => navigate('/home'));         // Warning
dispatchAndWait(new SaveUser()).then((status) => {                     // OK
  if (status.isCompletedOk) navigate('/home');
});
```

Quick fix (suggestion): wrap the callback's body in `if (status.isCompletedOk) { ... }`.

### debug-observer-in-release

Warning (AsyncRedux: info). Debug tools passed to the store, without a check for the
environment:

- `PersistorPrinterDecorator`, which prints all persistence calls.
- `actionObserver` or `stateObserver` that only call `console.log`.

```ts
createStore<State>({ persistor: new PersistorPrinterDecorator(persistor) });            // Warning
createStore<State>({ persistor: isDev ? new PersistorPrinterDecorator(p) : p });       // OK
```

Not reported inside an `if` or a conditional expression, or in tests.

### throw-in-read-state

**Skipped.** The plan below is wrong for Kiss. When `readState` returns `null`, Kiss calls
`saveInitialState`, which also replaces the saved data, so `addError` and `return null` don't
keep it either. Both report the error in the same way. And the `Persistor` docs say that
`readState` should throw when the saved state is corrupted. The plan was:

Warning. A `throw` in the `readState` method of a `Persistor`. When `readState` throws, Kiss
**deletes the saved state** and starts with the initial state, and the error is only
reported to the `errorObserver`. Instead, call `addError` and return `null`:

```ts
async readState() {
  try {
    return await this.read();
  } catch (error) {
    throw new UserException('Could not read your data.');                              // Warning
    this.addError(new UserException('Could not read your data.').withHardCause(error)); // OK
    return null;
  }
}
```

Throws inside closures, and throws caught by a `try` in `readState`, are not reported. Not
reported in tests. Quick fix (suggestion): replace `throw x;` with `this.addError(x);` and
`return null;`.

### expect-without-waiting

Warning. In tests, `store.dispatch(...)` of an async action, followed by an `expect` that
reads `store.state`, without waiting in between. The `expect` checks the state before the
action finishes:

```ts
store.dispatch(new LoadUser());                // Warning
await store.dispatchAndWait(new LoadUser());   // OK
expect(store.state.user.name).toBe('Mary');
```

Any `await` counts as waiting. Not reported when the test later waits and checks
`store.state` again (then the first `expect` checks the state while the action runs, on
purpose). Quick fix (automatic): use `await store.dispatchAndWait(...)`, making the test
function `async` if needed. Needs types, when the action class is in another file.

### action-status-details-in-production

Warning (AsyncRedux: info). `hasFinishedMethodBefore`, `hasFinishedMethodReduce` or
`hasFinishedMethodAfter` of an `ActionStatus`, outside tests. They are meant for tests and
debugging. In the app, use `isCompleted`, `isCompletedOk` or `isCompletedFailed`.

### Action naming rules

Opt-in warnings. There are 3 ways to name actions, one rule for each. Turn on only one:

| Rule                                      | Example           |
|-------------------------------------------|-------------------|
| `action-name-ends-with-action`            | `LoadUserAction`  |
| `action-name-ends-with-underscore-action` | `LoadUser_Action` |
| `action-name-without-action`              | `LoadUser`        |

Only concrete action classes are checked, not abstract ones, like the base action. ESLint
can't rename a class in all files, so the quick fix (suggestion) only renames it in the
current file, and is not offered when the class is exported. Use the IDE's rename
refactoring instead.

### Action file naming rules

Opt-in warnings. There are 2 ways to name the files that declare actions, one rule for
each. Turn on only one:

| Rule                                  | Examples                                                    |
|---------------------------------------|-------------------------------------------------------------|
| `action-file-name-ends-with-action`   | `LoadUserAction.ts`, `load-user-action.ts`, `load_user_action.ts` |
| `action-file-name-starts-with-action` | `ACTION_LoadUser.ts`, `ACTION_load_user.ts`                 |

Any case style is accepted (PascalCase, kebab-case, snake_case, camelCase). A file with more
than one action can have any name that follows the style. Files without actions, and test
files, are not checked. No quick fix, since ESLint can't rename files. The message suggests
a name.

### avoid-abort-dispatch and avoid-wrap-reduce

Opt-in warnings, for every override of `abortDispatch`, or of `wrapReduce`. The Kiss docs
call them "a complex power feature that you may not need to learn". Most actions should use
a feature instead, like `nonReentrant`, `retry` or `checkInternet`. Turn them on to make
each override deliberate, with an `eslint-disable` comment where you really need it. Not
reported in tests.

### missing-key-params

Opt-in warning. A non-reentrant action (with `nonReentrant = true`, or a subclass of
`OptimisticCommand`) with fields, that doesn't override `nonReentrantKeyParams` or
`computeNonReentrantKey`. By default, the key doesn't depend on the fields, so all instances
share it. For example, `SaveTodo('A')` then blocks `SaveTodo('B')`:

```ts
class SaveTodo extends OptimisticCommand<State> {
  constructor(readonly todoId: string) { super(); }
  nonReentrantKeyParams() { return this.todoId; } // Without it: Warning
}
```

Also for a subclass of `OptimisticSync` with fields, that doesn't override
`optimisticSyncKeyParams` or `computeOptimisticSyncKey`. Then, while `ToggleLike('A')` has a
request in flight, `ToggleLike('B')` doesn't send its own request, and the follow-up request
of `ToggleLike('A')` only checks item A, so item B may never be sent to the server.

It's opt-in, since sharing the key is often intended.

### route-in-state

Opt-in warning. A field named `currentRoute`, `routeName`, `currentPath`, `pathname` or
`location` in a state class. Get the current route from your router instead, like React
Router's `useLocation()`, instead of keeping a copy in the state. It's opt-in, since it only
looks at the name. Needs types (to know the state classes). Not reported in tests.

## 4. The plan for the new rules

These don't exist in AsyncRedux.

### dispatch-same-action-twice

Error. The same action object dispatched twice. Kiss throws a `StoreException`, since each
dispatch needs a new action:

```ts
const action = new LoadUser();
store.dispatch(action);
store.dispatch(action);              // Error
store.dispatch(new LoadUser());      // OK
```

Only actions kept in a `const` are checked, between two dispatches in the same function,
not in different branches of an `if`, `?:` or `switch`. Similar to AsyncRedux's
`vm_create_from_reused_factory`.

### dispatch-before-store-ready

Error. A dispatch right after creating a store with a persistor, without waiting for
`store.ready()`. Kiss throws, since the persisted state is still being read:

```ts
const store = createStore<State>({ initialState: State.initialState, persistor });
store.dispatch(new InitApp());   // Error
await store.ready();
store.dispatch(new InitApp());   // OK
```

Only checks code in the same function (or module) that creates the store. Quick fix
(suggestion): add `await store.ready();` before the dispatch, when the function is `async`
(or at the top level of a module).

### no-state-mutation

Error. Code that changes the state in place, instead of creating a new state. Kiss compares
states by identity, so the components don't re-render, and the change isn't persisted:

```ts
reduce() {
  this.state.items.push(item);                            // Error
  this.state.count = 5;                                   // Error
  return new State([...this.state.items, item], 5);       // OK
}
```

Reports assignments to `this.state.x` (and deeper), `delete`, and the mutating methods of
arrays, maps and sets (`push`, `splice`, `sort`, `reverse`, `set`, `add`, `clear`...), on
`this.state`, on the `state` parameter of returned functions and selectors, and on values
read from them. Methods like `toSorted` are fine. Needs types to follow values read into
variables.

### async-after

Error. An `async after()` method, or an `after()` that returns a promise. Kiss requires
`after` to be sync. It doesn't wait for the promise, so the code after the first `await`
runs after the action finished, and its errors are only logged:

```ts
async after() { await this.cleanup(); } // Error
after() { this.cleanup(); }             // OK
```

TypeScript allows it, since `void` methods can be overridden with async ones. This is the
`after` part of AsyncRedux's `before_return_type`.

### new-values-in-use-object

Warning. A `useObject` whose selector creates new values inside the object or array, like
`state.items.filter(...)`, `state.items.map(...)` or `{ ...state.user }`. `useObject`
compares the values by identity, so the component re-renders on every state change, as
with `useSelect`:

```tsx
const data = useObject((state: State) => ({ done: state.items.filter((i) => i.done) })); // Warning
const data = useObject((state: State) => ({ items: state.items, filter: state.filter })); // OK
```

No quick fix. Keep the computed values in the state, or compute them in the component, from
the selected parts.

### wait-condition-without-timeout

Warning. `waitCondition`, `dispatchWhen` or `useDispatchWhen` with `{ timeoutMillis: 0 }`
(or `-1`), outside tests. The Kiss docs warn that while a wait is pending, its condition runs
on every state change, and a wait without a timeout may never end. Use a timeout, or put the
logic in an action. Not reported in tests.

## 5. Rules added later

### incompatible-action-features

From AsyncRedux's `incompatible_mixins`. Reports the action features that can't be combined in
the same action, since dispatching it throws a `StoreException`: the ❌ cells of the
compatibility matrix in [`ACTION_FEATURES.md`](ACTION_FEATURES.md). For example, `throttle`
with `nonReentrant`, `retry` with `debounce`, `nonReentrant` in an `OptimisticCommand`, or
`retry` in an `OptimisticSync`.
Features inherited from superclasses count too. Error, in tests too (the action throws there
as well). Its tests check that it reports exactly the combinations the store doesn't allow.
`missing-key-params` also covers `unlimitedRetryCheckInternet`, which uses the non-reentrant
keys, and `OptimisticSync`, which uses its own keys. The other features use their own keys, which are shared by all the actions of the class
by default, as intended.

### polling-with-caveat

From AsyncRedux's `polling_with_caveat_mixin` (without `mixin`, since Kiss has features
instead of mixins). Reports `checkInternet`, `nonReentrant`, `throttle`, `fresh` or `sequential` in an
action with `poll` (the action that starts and stops the polling). They can be combined with
polling, but only in the action returned by `createPollingAction()` (the tick). They can abort,
fail or delay a dispatch, and can't tell a `Poll.stop` apart from a tick, so a `Poll.stop` may
itself be blocked, and the polling can't be stopped. Features inherited from superclasses
count too. Error, as in AsyncRedux, and also reported in tests. The features that can't be
combined with polling at all (`retry`, `debounce`, `unlimitedRetryCheckInternet`) are reported
by `incompatible-action-features` instead.
