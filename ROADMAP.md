# Roadmap

Features that AsyncRedux has, that Kiss doesn't have yet, and that should be added to Kiss. Each
section explains why the feature is useful in Kiss, how AsyncRedux does it, and a proposed API,
so that it can be implemented later.

When porting from AsyncRedux, use it as the reference for the specification, the API names and
the doc comments, but write Kiss's own implementation (like the other action features, that use
store-side code instead of AsyncRedux's mixins).

| Feature                                                                        | Status  | Priority |
|--------------------------------------------------------------------------------|---------|----------|
| [Environment, dependencies and configuration](#1-environment-dependencies-and-configuration) | Planned | Medium-high |
| [Store props, and disposing the store](#2-store-props-and-disposing-the-store)  | Planned | Medium   |
| [Events (`Evt`)](#3-events-evt)                                                 | Planned | Medium   |

When implementing any of these, also:

- Write BDDs in `__tests__/bdd.<Topic>.test.ts` (see `AGENTS.md`).
- Update `README.md`, `CHANGELOG.md`, and the docs site (`../kissforreact.org/react/...`).
- Revisit the related lint rules in `LINTS_LIST.md` (each section below says which).

---

## 1. Environment, dependencies and configuration

### Why

Today, a Kiss app gets its services (API clients, repositories, analytics...) by importing them
from modules. In tests, they're replaced with `jest.mock`, `jest.spyOn`, or a global registry.
Modules are singletons: Jest resets them only between test **files**, not between the tests of the
same file. So a mock with internal state, a spy that isn't restored, or a registry that isn't
reset, leaks from one test to the next. Module mocking is also harder with ESM and Vitest.

With dependencies injected into the store, each test creates its own store with its own
dependencies:

```ts
const store = createStore<State>({
  initialState: State.initialState,
  environment: Environment.testing,
  dependencies: (store) => new FakeDependencies(),
});
```

There is no global to set up or reset. When the test drops the store, its dependencies go with
it. Note this means the next test can't **see** them anymore, and they can be garbage collected.
It does **not** close the resources they hold (an open socket, a timer, a database connection).
That needs an explicit dispose, see [`store.dispose()`](#store-dispose) below.

Other benefits:

- Two stores can live side by side with different dependencies (tests running concurrently with
  `test.concurrent`, or one store per request in server-side rendering, where module singletons
  would leak between requests).
- The environment and the configuration (feature flags) are available where Kiss already gives
  you the store: actions, `errorObserver`, `wrapError`, persistors.
- Kiss's `store.mocks` mocks **actions**. Injected dependencies mock **services**. They complement
  each other.

### How AsyncRedux does it

- Docs: `../asyncredux.com/flutter/miscellaneous/dependency-injection.md`.
- Code: `../async_redux/lib/src/store.dart`, the `environment`, `dependencies` and `configuration`
  constructor parameters (around line 94), and their getters. Actions read them through the store.
  Widgets read the environment and the configuration with `context.getEnvironment()` and
  `context.getConfiguration()` (`store_provider_and_connector.dart`), which never rebuild.
- `environment` is a value. `dependencies` and `configuration` are factories that get the store,
  so they can depend on the environment. The configuration is created first, so that the
  dependencies factory can read it.
- All three are typed `Object?`, and the app declares typed getters in its base action.
- All three are meant to be immutable: they don't change while the app runs.

### Proposed API

Store constructor (`ConstructorParams` in `src/Store.tsx`):

```ts
createStore<State>({
  initialState: State.initialState,
  environment: Environment.production,           // Any value.
  configuration: (store) => new Config(),         // Created first.
  dependencies: (store) => createDependencies(store), // Can read store.environment and store.configuration.
});
```

- `store.environment`, `store.configuration` and `store.dependencies`: read-only getters, typed
  `unknown`.
- In actions, through the store. The docs show the typed getters for the base action:

  ```ts
  abstract class Action extends KissAction<State> {
    get env() { return this.store.environment as Environment; }
    get deps() { return this.store.dependencies as Dependencies; }
    get config() { return this.store.configuration as Config; }
  }

  class LoadUser extends Action {
    async reduce() {
      const user = await this.deps.api.loadUser(this.id);
      return (state: State) => state.copy({ user });
    }
  }
  ```

- In components: `useStore()` returns a `StoreDispatchers`, without these. Add hooks
  `useEnvironment()` and `useConfiguration()` (in `src/Hooks.tsx`), that never re-render, since
  the values don't change. Components should usually not need the dependencies, so there's no
  `useDependencies()` unless there's a clear use case.
- `errorObserver` already gets the store, so it can read `store.environment` (for example, to
  only send errors to the monitoring service in production).

Decisions to make before implementing:

- **Typing.** `unknown` plus getters in the base action (as above, like AsyncRedux) is the
  simplest. An alternative is a "register" interface the app augments, like TanStack Router does
  (`declare module 'kiss-for-react' { interface Register { dependencies: Dependencies } }`), which
  types `store.dependencies` everywhere without casts. Adding generic parameters to `Store` and
  `KissAction` is not recommended: it would touch every action.
- **Names.** Keep AsyncRedux's `environment`, `dependencies`, `configuration`, or shorter names.
- **Disposal.** `store.dispose()` (see section 2) should dispose the dependencies and the
  configuration when they have `[Symbol.dispose]()` or `dispose()`.
- **Mocks and `logOut`.** `logOut` and `clearInternalActionProps` should keep them (they belong to
  the app, not to the user).

### Lint rules

In `LINTS_LIST.md`, rows 23 (`dependencies_cast_in_action`) and 70
(`global_error_observer_without_env`) are skipped because Kiss has no environment. Revisit them
after implementing this. Also consider a rule against importing services directly in actions,
once dependencies are the recommended way (probably opt-in).

---

## 2. Store props, and disposing the store

### Why

Apps have long-lived things that are not state: intervals, WebSockets, `EventSource`s,
`AbortController`s, Firebase `onSnapshot` listeners (which return an unsubscribe function),
RxJS subscriptions. They must not go in the state. Kiss's own lint rule
`non-state-object-in-state` reports them there, and currently tells the user to keep them "in a
module, or in the action that uses them". Both options are module-level (static) storage, so:

- They outlive the store. `setShutDown(true)` and `logOut` don't close them.
- In tests, they leak from one test to the next, and open handles keep Jest from exiting ("Jest
  did not exit one second after the test run has completed").
- Each app writes its own start/stop bookkeeping.

Store props give these things a home that belongs to the store, and a way to close them all at
once: when the app finishes, on logout, or at the end of each test.

Note Kiss's built-in features don't need this: polling, debounce, throttle, retries and the other
features keep their timers in the store, and `clearInternalActionProps()` stops them. Props are
for the app's own timers and listeners.

### How AsyncRedux does it

- Docs: `../asyncredux.com/flutter/miscellaneous/streams-and-timers.md`.
- Code: `../async_redux/lib/src/store.dart`, around lines 97 and 207-335: the `props` constructor
  parameter, `props`, `prop<V>(key)`, `setProp(key, value)`, `disposeProp(key)` and
  `disposeProps([predicate])`. Actions have the same methods (`redux_action.dart`).
- `disposeProps()` without a predicate cancels, closes or ignores every `Timer`, `Future`,
  `StreamSubscription`, `StreamConsumer` and `Sink` in the props, and removes them. Other props are
  kept. With a predicate, it removes the props the predicate selects, and also closes them if
  they're one of those types.
- AsyncRedux doesn't dispose the props on shutdown. The docs tell you to call `disposeProps()`
  when the app finishes.

### Proposed API

On the store, and the same methods on `KissAction` (calling the store's):

```ts
store.setProp(key: unknown, value: unknown, options?: { dispose?: (value) => void | Promise<void> }): void;
store.prop<V>(key: unknown): V | undefined;
store.props: ReadonlyMap<unknown, unknown>;
store.disposeProp(key: unknown): void;
store.disposeProps(predicate?: (key: unknown, value: unknown) => boolean): void;
```

Example:

```ts
class StartClock extends Action {
  reduce() {
    const interval = setInterval(() => this.dispatch(new Tick()), 1000);
    this.setProp('clock', interval, { dispose: clearInterval });
    return null;
  }
}

class StopClock extends Action {
  reduce() {
    this.disposeProp('clock');
    return null;
  }
}
```

How a prop is disposed, in order:

1. The `dispose` option given to `setProp`, if any.
2. `value[Symbol.asyncDispose]()` or `value[Symbol.dispose]()` (TC39 explicit resource
   management, supported by TypeScript's `using`). Check `typeof Symbol.dispose === 'symbol'`
   first, since older runtimes don't have it.
3. `AbortController`: `abort()`.
4. `WebSocket`, `EventSource`, `BroadcastChannel`, `MessagePort`, `Worker`: `close()` (or
   `terminate()` for a `Worker`).
5. An object with `unsubscribe()` (RxJS and others).
6. Otherwise, the value is not disposable.

Differences from AsyncRedux, because of JavaScript:

- **Timers need the `dispose` option.** In browsers, `setTimeout` and `setInterval` return
  numbers, which can't be told apart from other numbers. (In Node they're `Timeout` objects, but
  the code must work in both.)
- **Functions are not called automatically.** An unsubscribe function (like Firebase's) looks the
  same as a callback stored in a prop. Use `{ dispose: (unsubscribe) => unsubscribe() }`.
- **Promises can't be cancelled.** They're just removed. Use an `AbortController` prop to cancel
  the work.

Decisions to make before implementing:

- **Replacing a prop.** Should `setProp` dispose the previous value of the same key? It prevents
  leaking two intervals when the start action is dispatched twice. Recommended, but different
  from AsyncRedux.
- **Disposal errors.** A `dispose` that throws should not stop the others. Report the error to
  `errorObserver` or log it, and continue.

<a name="store-dispose"></a>
### `store.dispose()`

A single call that ends the store, for tests and app shutdown:

```ts
afterEach(() => store.dispose());
```

It would:

1. Shut down the store (`setShutDown(true)`), which also calls `clearInternalActionProps()`
   (stops polling, retries, debounce timers, sequential queues...).
2. Dispose all props (the disposable ones, and remove them all).
3. Dispose the dependencies and the configuration, if they have `[Symbol.dispose]()` or
   `dispose()` (see section 1).
4. Maybe also stop the persistor's pending saves, after checking how `ProcessPersistence`
   behaves.

It can return a promise, to wait for async disposals (`Symbol.asyncDispose`). The store could
also implement `[Symbol.dispose]`, so tests can write `using store = createStore(...)`.

Also decide whether `logOut()` should dispose the props (probably as an option, since some props,
like a connectivity listener, should survive a logout).

### Lint rules

- `LINTS_LIST.md` row 58 (`timer_or_stream_not_in_props`) is skipped because Kiss has no store
  props. Revisit it: report timers and listeners kept in module variables or static fields of
  actions, and suggest `setProp`.
- Change the message of `non-state-object-in-state` to suggest `setProp`, instead of "a module, or
  the action that uses them".
- Consider a rule for `setInterval` or `setTimeout` passed to `setProp` without the `dispose`
  option, since they can't be disposed otherwise.

---

## 3. Events (`Evt`)

### Why

Sometimes an action needs the UI to do something once, and that is not a state change: scroll a
list to the top or to the end, clear or fill an input, focus a field, open a dialog. The UI keeps
these things itself (DOM elements, refs, scroll positions), so the reducer can't reach them.

Two cases don't need events, and the docs should say so:

- **The component dispatched the action itself.** It can wait for the action, and then act:
  `await dispatchAndWait(new SendMessage(text)); inputRef.current!.value = '';`.
- **There's already a state change to watch.** React to it in an effect. For example, scroll to
  the end whenever a message arrives: `useEffect(() => scrollToEnd(), [messages.length])`. This
  also covers messages from server pushes.

Events are for the rest: an **action** decides that the UI must do something once, and there is
no other state change to watch.

A simple value in the state is not enough:

- A **boolean** doesn't work. Once it's `true`, setting it to `true` again changes nothing, so a
  second request is lost.
- A **counter** (or a new object each time), with an effect that runs when it changes, only works
  while the component is mounted. On mount, the component can't tell an event it already handled
  from one that happened before it was mounted. If it ignores the current value on mount, events
  dispatched before mounting are lost (for example, an action that navigates to a screen and asks
  it to focus a field). If it fires on mount, it fires again on every remount.

To fire an event once, including when the component mounts later, something must remember that
it was already handled. AsyncRedux calls this **spending** the event.

### How AsyncRedux does it

- Docs: `../asyncredux.com/flutter/basics/events.md` and
  `../asyncredux.com/flutter/miscellaneous/advanced-events.md`.
- Code: `../async_redux/lib/src/event_redux.dart`.
- `Evt()` is a boolean event, and `Evt<T>(value)` holds a value. `Evt.spent()` is an event that
  was already used, for the initial state.
- The widget consumes the event with `context.event((state) => state.clearTextEvt)` in `build`.
  It returns `true` (or the value) once, and then `false` (or `null`). Consuming sets a mutable
  `spent` flag in the event object.
- `isSpent`, `isNotSpent` and `state` read the event without consuming it. `Event.map`,
  `Event.from` and `consumeFrom` combine or transform events.
- Equality: an unspent event is different from any other event, and spent events are all equal,
  so consuming doesn't cause rebuilds.
- Each event can be consumed by only one widget. For more widgets, create more events.
- `EvtState<T>(value)` is a different class, that is never spent. Each instance is unique, so
  widgets react when it changes (in `didUpdateWidget`). Several widgets can react to the same
  one, but only while they're mounted.
- Events must not be persisted.

### What must change for React

Consuming the event **during render**, like `context.event(...)`, breaks React's rules. Renders
must be pure: React may render a component and throw the result away (concurrent rendering,
Suspense), and StrictMode renders twice in development. Either way, the event could be spent by a
render that never shows up, and the UI effect would never happen.

So, in Kiss:

1. **Events are spent in an effect, not in render.** React runs effects only for renders that are
   shown (committed). In StrictMode, React runs the effect, cleans it up, and runs it again. The
   first run spends the event and does the UI work. The second run sees it's spent, and does
   nothing.

2. **The spent events are kept in the store, not in the event.** The `Evt` object stays
   immutable. The store keeps a `WeakSet` of the events already spent. This is how Kiss already
   keeps the data of the action features (in the store, not in the actions). It also means:
   - State classes stay immutable, so `no-state-mutation`, `state-class-must-be-immutable` and
     comparing states by identity all still hold.
   - Two stores (for example, in two tests) that share a state object with the same event each
     spend it on their own.
   - Events nobody references anymore are garbage collected.

3. **No API to consume during render.** Only the hook below.

### Proposed API

Exported from Kiss (`src/Evt.ts`, and the hook in `src/Hooks.tsx`):

```ts
class Evt<T = true> {
  constructor(value?: T);       // `new Evt()` is a boolean event, `new Evt('Hi')` holds 'Hi'.
  static spent<T>(): Evt<T>;    // An event that is already spent, for the initial state.
  readonly value: T;            // The value (`true` for a boolean event). Reading it doesn't spend it.
  readonly _spentAtCreation: boolean; // Internal: `true` for `Evt.spent()`.
}

class EvtState<T = true> {      // Never spent. See below.
  constructor(value?: T);
  readonly value: T;
}

function useEvent<St, T>(
  selector: (state: St) => Evt<T> | EvtState<T> | null | undefined,
  callback: (value: T) => void,
): void;
```

In the state:

```ts
class State {
  constructor(
    readonly messages: readonly Message[],
    readonly scrollToTopEvt: Evt,
    readonly changeTextEvt: Evt<string>,
  ) {}

  static initialState = new State([], Evt.spent(), Evt.spent());
}
```

In actions, put a new event in the state:

```ts
class ScrollFeedToTop extends Action {
  reduce() { return this.state.copy({ scrollToTopEvt: new Evt() }); }
}

class ChangeText extends Action {
  async reduce() {
    const text = await api.fetchText();
    return (state: State) => state.copy({ changeTextEvt: new Evt(text) });
  }
}
```

In components, handle it with `useEvent`:

```tsx
function Feed() {
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEvent((state: State) => state.scrollToTopEvt, () => listRef.current?.scrollTo({ top: 0 }));
  useEvent((state: State) => state.changeTextEvt, (text) => { inputRef.current!.value = text; });
  ...
}
```

How `useEvent` works, roughly:

```ts
function useEvent(selector, callback) {
  const evt = useSelect(selector);
  const store = useStoreFromContext();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;               // Always calls the latest callback.
  const lastSeen = useRef(evt);                 // For EvtState only.

  useEffect(() => {
    if (evt == null) return;
    if (evt instanceof EvtState) {
      if (lastSeen.current === evt) return;     // On mount, or no change.
      lastSeen.current = evt;
      callbackRef.current(evt.value);
      return;
    }
    if (evt._spentAtCreation || store._spentEvents.has(evt)) return;
    store._spentEvents.add(evt);
    callbackRef.current(evt.value);
  }, [evt]);
}
```

(Assigning `callbackRef.current` during render is the common "latest ref" pattern. An
implementation that follows React's newest guidance may assign it in a layout effect instead.)

How it behaves:

| Situation                                      | `Evt`                         | `EvtState`               |
|------------------------------------------------|-------------------------------|--------------------------|
| New event while the component is mounted       | Fires once                    | Fires                    |
| Event created before the component mounts      | Fires once, when it mounts    | Doesn't fire             |
| The component remounts later                   | Doesn't fire (already spent)  | Doesn't fire             |
| Two components use the same event              | Only the first one fires      | Both fire                |
| Unrelated re-render                            | Doesn't fire                  | Doesn't fire             |

For two components that must both react to an `Evt`, create two events, as AsyncRedux says. Or
use `EvtState`, when it's fine to miss events that happen while the component is not mounted.

### Persistence

A restored event is a new object that is not in the store's `WeakSet`, so it would fire when the
app starts: an old "scroll to top" from the previous session. So restored events must be spent:

- `ClassPersistor`: register `Evt` and `EvtState` with ESSerializer (`src/Esserializer`) so that
  they're always saved, and restored, as `Evt.spent()` (and an `EvtState` that doesn't fire).
- Custom persistors: the docs should say to never persist events, or to restore them as
  `Evt.spent()`.

### Testing

Tests check that an action created a new event, and its value:

```ts
const before = store.state.scrollToTopEvt;
await store.dispatchAndWait(new ScrollFeedToTop());
expect(store.state.scrollToTopEvt).not.toBe(before);
expect(store.state.changeTextEvt.value).toBe('Hi');
```

Add `store.isEventSpent(evt)` (like AsyncRedux's `isSpent`), to check whether a component already
handled the event, in component tests.

### Decisions to make before implementing

- **Effect timing.** `useEffect` runs after the browser paints. A scroll or a focus may look
  better in `useLayoutEffect`, before the paint. Offer a `useLayoutEvent` hook, or an option like
  `useEvent(selector, callback, { layout: true })`.
- **Selector shape.** Whether `useEvent` also accepts a selector that returns several events, or
  only one. One per call is simpler.
- **Advanced features.** AsyncRedux's `Event.map`, `Event.from` and `consumeFrom` can come later,
  if needed.
- **`logOut`.** The initial state has spent events, so a logout doesn't fire anything. Consider
  whether `logOut` should also clear `_spentEvents` (not needed, since it's a `WeakSet`).

### Lint rules

`LINTS_LIST.md` rows 44-46 are skipped because Kiss has no events. Revisit them:

- `event_name_suffix`: name event fields with the `Evt` suffix, like `scrollToTopEvt`.
- `event_not_spent_initially`: the initial state should use `Evt.spent()`, not `new Evt()`, which
  would fire on the first mount.
- `event_persisted`: events in a persisted state, with a custom persistor that doesn't handle
  them.

Also consider new rules for Kiss:

- A boolean or counter field used as an event (a `useEffect` that depends on a selected value,
  and only does UI work). Hard to detect reliably, so probably not.
- Reading `evt.value` of an `Evt` in a component without `useEvent`, which never spends it.
