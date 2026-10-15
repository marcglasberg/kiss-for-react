'use client';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector';
import { UserException } from './UserException';
import { StoreException } from './StoreException';
import { Store } from './Store';
import { StoreContext, StoreContextType } from './StoreProvider';
import { KissAction, ActionStatus, StatusOptions } from './KissAction';
import { Evt, EvtState } from './Evt';

// How the hooks connect to the store
//
// The hooks that read the store use React's `useSyncExternalStore`, which gets two functions
// from the store: one to subscribe to changes, and one to read the current value (the
// "snapshot"). The store only tells React that something may have changed; React then reads the
// snapshot again, compares it with the one it rendered, and renders the component only if it
// changed. React also reads the snapshot again before committing a render that it started and
// paused (a transition), and restarts the render if the store changed meanwhile, so a screen
// never shows parts of two different states at the same time.
//
// - `useSelect`, `useObject` and `useAllState` use the React team's `useSyncExternalStoreWithSelector`,
//   whose snapshot is the whole (immutable) state, and whose selector picks a part of it. It
//   keeps the last selected value, and compares the new one with it (`Object.is` for `useSelect`,
//   value by value for `useObject`), so an unchanged selection doesn't render the component.
//
// - `useIsWaiting`, `useIsFailed` and `useExceptionFor` read a boolean or an exception from the
//   store, and subscribe to the status changes of the actions. `useIsStoreReady` reads a boolean
//   and subscribes to the readiness.
//
// What this means for your selectors: they must be pure, and must not depend on how many times
// they are called. React may call them more than once per render, and may throw a render away.
// Store-driven renders are synchronous for React (even inside `startTransition`): they are not
// deferred like local-state transitions. Async actions are still async; this only says how React
// schedules the render after the state changes.

/**
 * Returns a part of the store state:
 *
 * ```ts
 * const name = useSelect((state: State) => state.user.name);
 * ```
 *
 * The component will rebuild only when the `name` changes, ignoring the
 * change in other parts of the state. The selected value is compared with
 * the previous one using `Object.is`, like React does. So `NaN` is equal
 * to `NaN`, but `0` is different from `-0`.
 *
 * The selector must be pure: it must only read its `state` parameter, and return the same
 * value for the same state. It may be an inline function, and may use props and local state.
 * It should return a part of the state, not a new object: a new object is never `Object.is`
 * the previous one, so the component would rebuild for every state change. Use `useObject`
 * for that.
 *
 * Note: You can use `useSelect` and `useSelector` interchangeably.
 * Prefer `useSelect` because it's shorter.
 */
export function useSelect<St, T>(selector: (state: St) => T): T {
  const {store, getServerState} = useStoreContext<St>();
  return useSyncExternalStoreWithSelector(store._subscribeState, store._getState, getServerState, selector, Object.is);
}

/**
 * Returns a part of the store state:
 *
 * ```ts
 * const name = useSelector((state: State) => state.user.name);
 * ```
 *
 * The component will rebuild only when the `name` changes, ignoring the
 * change in other parts of the state.
 *
 * Note: You can use `useSelect` and `useSelector` interchangeably.
 * Prefer `useSelect` because it's shorter.
 */
export function useSelector<St, T>(selector: (state: St) => T): T {
  return useSelect(selector);
}

/**
 * Returns an object (or an array, `Map` or `Set`) with some parts of the store state:
 *
 * ```ts
 * const user = useObject((state: State) => ({ name: state.user.name, age: state.user.age }));
 * return <div>{user.name} is {user.age} years old</div>;
 * ```
 *
 * The component will rebuild only when the `name` or the `age` changes, ignoring the
 * change in other parts of the state.
 *
 * Note: With `useSelect`, the same selector would rebuild the component for ALL state changes,
 * since it creates a new object each time. Instead, `useObject` compares the new object with
 * the previous one, value by value (with `Object.is`). If they have the same values, it
 * returns the previous object, and the component doesn't rebuild. This also works if the
 * selector returns an array: `useObject((state: State) => [state.name, state.age])`, or a
 * `Map` or a `Set`, whose entries are compared in order.
 *
 * Note the values themselves are compared by identity. So, the selector should return parts
 * of the state, and not create new objects or arrays for its values.
 *
 * Only plain objects, arrays, `Map`s and `Set`s are compared value by value. Anything else,
 * like a `Date`, a class instance, or a subclass of `Map` or `Set`, is compared by identity,
 * like `useSelect` does. So, `useObject((state: State) => new Point(state.x, state.y))` would
 * rebuild the component for ALL state changes.
 *
 * For this reason, the selector's type only accepts a plain object, an array, a `Map` or a
 * `Set` (or `null` or `undefined`), and a class instance, a `Date`, a string, a number or a
 * function doesn't compile. Note an object whose type is an `interface` doesn't compile either,
 * since TypeScript can't tell it apart from a class instance. Declare it with `type` instead.
 *
 * While the values are the same, `useObject` keeps returning the object it returned before,
 * so you can use it in the dependencies of an effect, or pass it to a memoized component.
 */
export function useObject<St, T extends UseObjectValue>(selector: (state: St) => T): T {
  const {store, getServerState} = useStoreContext<St>();
  return useSyncExternalStoreWithSelector(store._subscribeState, store._getState, getServerState, selector, _shallowEqual);
}

// What a `useObject` selector can return. A class instance is not assignable to a `Record`,
// since only object literal types (and `type` aliases) get an implicit index signature.
type UseObjectValue =
  | Record<string, unknown>
  | readonly unknown[]
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | null
  | undefined;

// Returns true if `a` and `b` are the same, or are both plain objects, arrays, `Map`s or `Set`s
// with the same values (compared with `Object.is`). The entries of a `Map` or `Set` must also be
// in the same order, since that's the order they are rendered in. Other objects, like a `Date`,
// a class instance, or a subclass of `Map` or `Set`, are only equal if they are the same object,
// since their values may not be in their own enumerable keys.
function _shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++)
      if (!Object.is(a[i], b[i])) return false;
    return true;
  }

  const proto = Object.getPrototypeOf(a);
  if (proto !== Object.getPrototypeOf(b)) return false;

  if (proto === Map.prototype) {
    const mapA = a as Map<unknown, unknown>, mapB = b as Map<unknown, unknown>;
    if (mapA.size !== mapB.size) return false;
    const entriesB = mapB.entries();
    for (const [key, value] of mapA) {
      const [keyB, valueB] = entriesB.next().value!;
      if (!Object.is(key, keyB) || !Object.is(value, valueB)) return false;
    }
    return true;
  }

  if (proto === Set.prototype) {
    const setA = a as Set<unknown>, setB = b as Set<unknown>;
    if (setA.size !== setB.size) return false;
    const valuesB = setB.values();
    for (const value of setA)
      if (!Object.is(value, valuesB.next().value)) return false;
    return true;
  }

  if (proto !== Object.prototype && proto !== null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is((a as any)[key], (b as any)[key])) return false;
  }
  return true;
}

/**
 * Returns the whole store state:
 *
 * ```ts
 * const state = useAllState<State>();
 * const name = state.user.name;
 * ```
 *
 * While that's convenient, the above code will rebuild the component for all state changes,
 * no matter if the name changed or not. For this reason, prefer `useSelector`:
 *
 * ```ts
 * const name = useSelector((state: State) => state.user.name);
 * ```
 *
 * Now it will rebuild only when the name changes.
 */
export function useAllState<St>(): St {
  return useSelect<St, St>((state) => state);
}

/**
 * Returns an object with all the dispatch and wait methods of the store:
 *
 * - `dispatch` - Dispatches an action, to potentially change the state.
 * - `dispatchAndWait` - Dispatches an action and returns a promise that resolves when the action finishes.
 * - `dispatchSync` - Same as the regular dispatch, except it throws an error if the action is ASYNC.
 * - `dispatchWhen` - Waits until the state is in a given condition, and then dispatches an action.
 * - `dispatchAll` - Dispatches all given actions in parallel.
 * - `dispatchAndWaitAll` - Dispatches all given actions, and returns a promise that resolves when they all finish.
 * - `waitCondition` - Waits until the state is in a given condition.
 * - `waitActionCondition` - Waits until the actions in progress meet a given condition.
 * - `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
 * - `waitActionType` - Waits until an action of a given type is NOT in progress.
 * - `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
 * - `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
 *
 * Example:
 *
 * ```js
 * const store = useStore();
 * store.dispatch(new MyAction());
 * await store.dispatchAndWait(new MyAction());
 * store.dispatchSync(new MyAction());
 * store.dispatchAll([new BuyAction('IBM'), new SellAction('TSLA')]);
 * await store.dispatchAndWaitAll([new BuyAction('IBM'), new SellAction('TSLA')]);
 * await store.waitCondition((state) => state.user.name === "Bill", { timeoutMillis: 1000 });
 * await store.waitAllActionTypes([BuyAction, SellAction]);
 * ```
 *
 * The methods also work when destructured: `const { dispatch, dispatchAndWait } = useStore();`.
 *
 * The object also has `store`, which is the store itself, with its `state` and all its other
 * methods:
 *
 * ```js
 * const { store } = useStore();
 * console.log(store.actionsInProgress());
 * ```
 *
 * IMPORTANT: `useStore` doesn't make the component re-render when the state changes. So, read
 * `store.state` only in event handlers, effects and callbacks, never to render the component.
 * To render it, use the hooks that re-render the component when needed:
 * - To get the state: `useSelect`, `useObject` or `useAllState`
 * - To know if actions are running: `useIsWaiting`
 * - To deal with exceptions: `useIsFailed`, `useExceptionFor` and `useClearExceptionFor`
 *
 * See also:
 * - `useDispatch()` - Hook equivalent to `useStore().dispatch`
 * - `useDispatchAndWait` - Hook equivalent to `useStore().dispatchAndWait`
 * - `useDispatchSync` - Hook equivalent to `useStore().dispatchSync`
 * - `useDispatchWhen` - Hook equivalent to `useStore().dispatchWhen`
 * - `useDispatchAll` - Hook equivalent to `useStore().dispatchAll`
 * - `useDispatchAndWaitAll` - Hook equivalent to `useStore().dispatchAndWaitAll`
 * - `useStoreEffect` - To dispatch actions when the component mounts, when some values change,
 *   and when it unmounts.
 */
export function useStore(): StoreDispatchers<any> {
  const store = useStoreFromContext<any>();
  return useMemo(() => new StoreDispatchers(store as Store<any>), [store]);
}

/**
 * @deprecated Use `useDispatch`. Note you also have `useDispatchAndWait` and `useDispatchSync`.
 */
export function useDispatcher(): (action: KissAction<any>) => void {
  return useDispatch();
}

/**
 * Returns a function that dispatches an action, to potentially change the state:
 *
 * ```ts
 * const dispatch = useDispatch();
 * dispatch(new MyAction());
 * ```
 *
 * This also works:
 *
 * ```ts
 * const store = useStore();
 * store.dispatch(new MyAction());
 * ```
 *
 * To dispatch actions when the component mounts, when some values change, and when it
 * unmounts, see `useStoreEffect`.
 *
 * See also:
 * - `dispatchAll` which dispatches all given actions in parallel.
 * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
 * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
 * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
 */
export function useDispatch<St = any>(): (action: KissAction<St>) => void {
  const store = useStoreFromContext<St>();
  return useMemo(() => store.dispatch.bind(store), [store]);
}

/**
 * Options for `useStoreEffect`, to run code when the component mounts, when its `deps` change,
 * and when it unmounts. See `useStoreEffect`.
 */
export interface UseStoreEffectOptions<St, D> {
  /**
   * A single value, or an array of values. When they change, `onDepsChange` is called.
   * They are compared with `Object.is`, like React's dependencies. So, don't create new objects
   * or arrays in each render, or they will be considered changed in every render.
   */
  deps?: D;

  /** Called once, when the component mounts (but only after the store is ready). */
  onMount?: (store: Store<St>) => unknown;

  /**
   * Called when `deps` change (but only after `onMount`). It gets the old `deps`.
   * The new values are the ones in your component.
   */
  onDepsChange?: (store: Store<St>, oldDeps: D) => unknown;

  /** Called once, when the component unmounts (but only if `onMount` was called). */
  onUnmount?: (store: Store<St>) => unknown;

  /**
   * Called when the app is focused again (in the browser, when the document becomes visible:
   * the user comes back to the tab, or restores the window), while the component is mounted.
   * Not called on mount. See `store.isFocused` and `focusSource` in `createStore`.
   */
  onFocus?: (store: Store<St>) => unknown;

  /**
   * Called when the app loses focus (in the browser, when the document becomes hidden), while
   * the component is mounted. See `store.isFocused`.
   */
  onBlur?: (store: Store<St>) => unknown;

  /**
   * Called when the app is online again, while the component is mounted. Not called on mount.
   * See `store.isOnline` and `onlineSource` in `createStore`.
   */
  onOnline?: (store: Store<St>) => unknown;

  /** Called when the app goes offline, while the component is mounted. See `store.isOnline`. */
  onOffline?: (store: Store<St>) => unknown;
}

/**
 * Use `useStoreEffect` instead of a `useEffect` to dispatch actions when the component mounts
 * (`onMount`), when some values change (`deps` and `onDepsChange`), and when it unmounts
 * (`onUnmount`):
 *
 * ```tsx
 * useStoreEffect({
 *   deps: userId,
 *   onMount: (store) => store.dispatch(new LoadUser(userId)),
 *   onDepsChange: (store, oldUserId) => {
 *     store.dispatch(new StopListening(oldUserId));
 *     store.dispatch(new LoadUser(userId));
 *   },
 *   onUnmount: (store) => store.dispatch(new CleanResources()),
 * });
 * ```
 *
 * If `deps` is an array, `onDepsChange` gets the old array:
 *
 * ```tsx
 * useStoreEffect({
 *   deps: [userId, filter],
 *   onMount: (store) => store.dispatch(new LoadUser(userId, filter)),
 *   onDepsChange: (store, [oldUserId, oldFilter]) => {
 *     if (userId !== oldUserId) {
 *       store.dispatch(new StopListening(oldUserId));
 *       store.dispatch(new LoadUser(userId, filter));
 *     }
 *     else if (filter !== oldFilter) store.dispatch(new ApplyFilter(filter));
 *   },
 * });
 * ```
 *
 * All of them are optional, and get the store, so you can use any of its dispatch methods,
 * and read its current `state`. They may be async. To type the state, type the store:
 * `onMount: (store: Store<State>) => ...`. The hook returns nothing. To also dispatch actions
 * from event handlers, use `useDispatch`, `useStore`, etc.
 *
 * Note you can still dispatch actions from a `useEffect`, as usual, if you prefer.
 * `useStoreEffect` is just more convenient, because:
 *
 * - They only run after the store is ready (see `useIsStoreReady`). If the store is not ready
 *   when the component mounts, `onMount` is called as soon as it is. If the component unmounts
 *   before that, none of them is called.
 *
 * - They are called in order: `onMount`, then `onDepsChange` (any number of times), then
 *   `onUnmount`. But if one of them is async, it's not awaited (see below).
 *   `onMount` and `onUnmount` run once, even in React's `StrictMode`, which mounts components
 *   twice during development. And `onDepsChange` runs once per change.
 *
 * - Like a `useEffect` cleanup, `onUnmount` runs when the component unmounts, before the
 *   `onMount` of a component mounted in the same render (in a route switch, for example).
 *
 * When they run, compared to a `useEffect` (in production and in development):
 *
 * - `onMount` runs at the same time as a `useEffect(..., [])` called in the same place of the
 *   component, if the store is ready. If not, it runs when the store becomes ready.
 *
 * - `onDepsChange` runs at the same time as a `useEffect(..., [deps])`, but not after the first
 *   render. The deps are compared like React does: each value with `Object.is`.
 *
 * - `onUnmount` runs at the same time as the cleanup of a `useEffect`, with one exception:
 *   if the component unmounts in the same synchronous run as its mount (before any microtask),
 *   `onUnmount` waits one microtask. This is when `StrictMode` does its fake unmount, so if the
 *   component mounts again in that time, `onUnmount` is cancelled, and `onMount` is not called
 *   again. A real unmount that soon is rare, but its `onUnmount` also runs one microtask later.
 *
 * - So the actions they dispatch are dispatched at the same time as from a `useEffect`. A sync
 *   action changes the state before `onMount`, `onDepsChange` or `onUnmount` returns.
 *
 * - They are not awaited. If one of them is async, the next one may run before it finishes.
 *   For example, `onUnmount` may run while an async `onMount` is still waiting for an action.
 *
 * - Their errors are not caught, as in a `useEffect`. A sync error goes to React, which shows
 *   the nearest error boundary (except that React 18 doesn't give an error thrown by
 *   `onUnmount` while the component unmounts to the boundary: it logs it as an internal React
 *   error; React 19 fixed it). A rejected promise is an unhandled promise rejection. And when
 *   `onMount` waits for the store to be ready, or `onUnmount` waits a microtask (see above),
 *   even a sync error is an unhandled promise rejection. If `onMount` throws a sync error when
 *   the component mounts (the store is ready), `onUnmount` is not called, as the cleanup of a
 *   `useEffect` whose setup throws.
 *
 * - They are the ones from the latest render, so they see its values.
 *
 * - Some React features disconnect the effects and connect them again, without a real unmount.
 *   As for a `useEffect`, this calls `onUnmount` and then `onMount` again. For example, in
 *   development, Fast Refresh does it to a component when you edit its code. And `<Activity>`
 *   does it when it hides the component and shows it again.
 *
 * - A component can call `useStoreEffect` more than once. They run in the order they are called.
 *
 * Note: Changing `deps` doesn't call `onMount` again. If you want to dispatch the same actions
 * on mount and when `deps` change, call the same function from both `onMount` and
 * `onDepsChange`. Each of them sees the values from the latest render.
 *
 * To reload the data on screen when the user comes back to the tab, or when the internet comes
 * back, use `onFocus` and `onOnline` (and `onBlur` and `onOffline` for the opposite):
 *
 * ```tsx
 * useStoreEffect({
 *   onMount: (store) => store.dispatch(new LoadPrices()),
 *   onFocus: (store) => store.dispatch(new LoadPrices()),
 *   onOnline: (store) => store.dispatch(new LoadPrices()),
 * });
 * ```
 *
 * - They are called on the transitions only (hidden → visible, offline → online, and back),
 *   never on mount, and only while the component is mounted and after `onMount` was called
 *   (so, after the store is ready). Like the other callbacks, they get the store, see the
 *   values of the latest render, and are not awaited.
 *
 * - To only reload when the data is old, give the action a `fresh` period: a focus within the
 *   period is then aborted silently. Without `fresh`, the action runs on every focus.
 *
 * - What "focused" and "online" mean comes from the store: `store.isFocused` and
 *   `store.isOnline`, with `focusSource` and `onlineSource` in `createStore` to change the
 *   defaults (for example, in React Native). In tests, drive them with `store.setFocused()` and
 *   `store.setOnline()`.
 *
 * - A component that doesn't give these callbacks doesn't make the store listen to the focus
 *   and online sources.
 */
export function useStoreEffect<St = any, const D = undefined>(options: UseStoreEffectOptions<St, D>): void {
  const store = useStoreFromContext<St>();

  // The options from the latest committed render, so that the callbacks see the latest values.
  // A passive effect is enough: the effects below, which read the ref, run after it in the
  // same commit (effects of a component run in order). A layout effect would also warn on the
  // server with React 18 ("useLayoutEffect does nothing on the server").
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // The store for which `onMount` was called, or null if it wasn't called (or after `onUnmount`).
  const mountedStoreRef = useRef<Store<St> | null>(null);

  // The deps seen by the last `onMount` or `onDepsChange`.
  const lastDepsRef = useRef<D | undefined>(undefined);

  // The `onUnmount` waiting to run. See below why it waits.
  const pendingUnmountRef = useRef<{ store: Store<St>, isCancelled: boolean } | null>(null);

  useEffect(() => {
    // In `StrictMode`, React unmounts and then mounts again right away. This is not a real
    // unmount, so we cancel the `onUnmount` that is waiting to run.
    const pending = pendingUnmountRef.current;
    if (pending !== null && pending.store === store) {
      pending.isCancelled = true;
      pendingUnmountRef.current = null;
    }

    let isActive = true;

    // True until the end of the current synchronous flush. StrictMode's fake unmount happens
    // right after the mount, in the same flush, so only an unmount in that time can be fake.
    let isJustMounted = true;
    Promise.resolve().then(() => isJustMounted = false);

    if (mountedStoreRef.current !== store) {
      const mount = () => {
        if (!isActive) return;
        mountedStoreRef.current = store;
        lastDepsRef.current = optionsRef.current?.deps;
        optionsRef.current?.onMount?.(store);
      };
      if (store._isReady) mount();
      else store.ready().then(mount);
    }

    return () => {
      isActive = false;
      if (mountedStoreRef.current !== store) return;

      const unmount = () => {
        if (mountedStoreRef.current === store) mountedStoreRef.current = null;
        optionsRef.current?.onUnmount?.(store);
      };

      // A real unmount. Runs `onUnmount` right away, like a `useEffect` cleanup, so that it runs
      // before the `onMount` of a component mounted in the same commit (a route switch, for example).
      if (!isJustMounted) {
        unmount();
        return;
      }

      // It may be StrictMode's fake unmount. Waits a microtask, so that it can be cancelled if
      // this is not a real unmount (see above).
      const pendingUnmount = {store, isCancelled: false};
      pendingUnmountRef.current = pendingUnmount;
      Promise.resolve().then(() => {
        if (pendingUnmount.isCancelled) return;
        if (pendingUnmountRef.current === pendingUnmount) pendingUnmountRef.current = null;
        unmount();
      });
    };
  }, [store]);

  // After each render, calls `onDepsChange` if the deps changed (only after `onMount` was called).
  useEffect(() => {
    if (mountedStoreRef.current !== store) return;
    const deps = optionsRef.current?.deps as D;
    const oldDeps = lastDepsRef.current as D;
    if (_depsAreEqual(oldDeps, deps)) return;
    lastDepsRef.current = deps;
    optionsRef.current?.onDepsChange?.(store, oldDeps);
  });

  // Listens to the focus and online signals of the store, only while some render gave one of
  // their callbacks, so that a component with `onMount` only doesn't start the sources. The
  // callbacks run on the transitions only, and only after `onMount` was called.
  const listensToFocus = !!(options.onFocus || options.onBlur);
  const listensToOnline = !!(options.onOnline || options.onOffline);

  useEffect(() => {
    if (!listensToFocus) return;
    return _listenToSignal(store._subscribeFocus, store._getIsFocused, (isFocused) => {
      if (mountedStoreRef.current !== store) return;
      if (isFocused) optionsRef.current?.onFocus?.(store);
      else optionsRef.current?.onBlur?.(store);
    });
  }, [store, listensToFocus]);

  useEffect(() => {
    if (!listensToOnline) return;
    return _listenToSignal(store._subscribeOnline, store._getIsOnline, (isOnline) => {
      if (mountedStoreRef.current !== store) return;
      if (isOnline) optionsRef.current?.onOnline?.(store);
      else optionsRef.current?.onOffline?.(store);
    });
  }, [store, listensToOnline]);
}

// Subscribes to a boolean signal of the store, and calls `onChange` each time it changes.
function _listenToSignal(
  subscribe: (listener: () => void) => () => void,
  get: () => boolean,
  onChange: (value: boolean) => void,
): () => void {
  let last = get();
  return subscribe(() => {
    const value = get();
    if (value === last) return;
    last = value;
    onChange(value);
  });
}

// Compares deps like React does: each value with `Object.is`.
function _depsAreEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++)
      if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  return Object.is(a, b);
}

/**
 * Dispatches an action and returns a promise that resolves when the action finishes.
 * While the state change from the action's reducer will have been applied when the promise
 * resolves, other independent processes that the action may have started may still be in
 * progress.
 *
 * Usage:
 * ```ts
 * const dispatchAndWait = useDispatchAndWait();
 * await dispatchAndWait(new MyAction());
 * ```
 *
 * See also:
 * - `dispatch` which dispatches both sync and async actions.
 * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
 * - `dispatchAll` which dispatches all given actions in parallel.
 * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
 */
export function useDispatchAndWait(): (action: KissAction<any>) => Promise<ActionStatus> {
  const store = useStoreFromContext<any>();
  return useMemo(() => store.dispatchAndWait.bind(store), [store]);
}

/**
 * Dispatches all given actions in parallel, applying their reducers, and possibly changing
 * the store state. The actions may be sync or async. It returns a Promise that resolves when
 * ALL actions finish.
 *
 * ```ts
 * const dispatchAndWaitAll = useDispatchAndWaitAll();
 * await dispatchAndWaitAll([new BuyAction('IBM'), new SellAction('TSLA')]);
 * ```
 *
 * Note: While the state change from the action's reducers will have been applied when the
 * Promise resolves, other independent processes that the action may have started may still
 * be in progress.
 *
 * See also:
 * - `dispatch` which dispatches both sync and async actions.
 * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
 * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
 * - `dispatchAll` which dispatches all given actions in parallel.
 */
export function useDispatchAndWaitAll(): (action: KissAction<any>[]) => Promise<KissAction<any>[]> {
  const store = useStoreFromContext<any>();
  return useMemo(() => store.dispatchAndWaitAll.bind(store), [store]);
}

/**
 * Waits until the store state meets a certain condition, and then dispatches an action.
 * If the condition is already true, the action is dispatched right away, before `dispatchWhen`
 * returns. Otherwise, it is dispatched synchronously, right after the state change that meets
 * the condition, so no other action can change the state in between.
 * If the same state change meets the condition of several `dispatchWhen`, their actions are
 * dispatched one after the other, and each condition is checked again right before its
 * action is dispatched. If an earlier action made it false, it keeps waiting.
 *
 * ```ts
 * const dispatchWhen = useDispatchWhen();
 * dispatchWhen(new BuyStock('IBM'), (state) => state.stocks.getPrice('IBM') >= 100, { timeoutMillis: 0 });
 * ```
 *
 * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
 * is not met in `timeoutMillis` milliseconds, the action is NOT dispatched, and the condition
 * stops being checked. In this case, `onTimeout` is called if you provided it. Otherwise, the
 * timeout is logged. To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`),
 * but note that while it waits, the condition runs on every state change.
 *
 * ```ts
 * dispatchWhen(
 *   new BuyStock('IBM'),
 *   (state) => state.stocks.getPrice('IBM') >= 100,
 *   { timeoutMillis: 60 * 1000, onTimeout: () => console.log('IBM never reached 100.') },
 * );
 * ```
 *
 * Note: The wait is NOT cancelled when the component unmounts.
 *
 * See also:
 * - `dispatch` which dispatches both sync and async actions.
 * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
 */
export function useDispatchWhen(): (
  action: KissAction<any>,
  condition: (state: any) => boolean,
  options: { timeoutMillis: number, onTimeout?: () => void }
) => void {
  const store = useStoreFromContext<any>();
  return useMemo(() => store.dispatchWhen.bind(store), [store]);
}

/**
 * Dispatches all given actions in parallel, applying their reducer, and possibly changing
 * the store state.
 *
 * ```ts
 * const dispatchAll = useDispatchAll();
 * dispatchAll([new BuyAction('IBM'), new SellAction('TSLA')]);
 * ```
 *
 * See also:
 * - `dispatch` which dispatches both sync and async actions.
 * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
 * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
 * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
 */
export function useDispatchAll(): (action: KissAction<any>[]) => KissAction<any>[] {
  const store = useStoreFromContext<any>();
  return useMemo(() => store.dispatchAll.bind(store), [store]);
}

/**
 * Dispatches the given action to the Redux store, to potentially change the state.
 *
 * This is exactly the same as the regular `dispatch`, except for the fact it
 * will throw a `StoreException` if the action is ASYNC. Note an action is ASYNC
 * if any of its `reduce()` or `before()` methods return a Promise.
 *
 * The only use for `dispatchSync` is when you need to guarantee (in runtime) that your
 * action is SYNC, which means the state gets changed right after the dispatch call.
 *
 * See also:
 * - `dispatch` which dispatches both sync and async actions.
 * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
 * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
 * - `dispatchAll` which dispatches all given actions in parallel.
 */
export function useDispatchSync(): (action: KissAction<any>) => void {
  const store = useStoreFromContext<any>();
  return useMemo(() => store.dispatchSync.bind(store), [store]);
}

/**
 * You can use `isWaiting` and pass it an action `type`:
 * - It returns true if an action of the given type (or of a subclass) is currently being processed.
 * - It returns false if no action of the given type is currently being processed.
 * - This is only useful for ASYNC actions. A SYNC action finishes before `dispatch` returns, so
 *   outside of it, `isWaiting` is always `false` for it, and components never see it as `true`.
 *
 * Note an action is ASYNC if it returns a promise from its `before` OR its `reduce` methods.
 *
 * ```ts
 * const isWaiting = useIsWaiting(MyAction);
 * if (isWaiting) { ... } // Show a spinner
 * ```
 *
 * Pass `{ statusKey }` to consider only the actions with that `statusKey` (see
 * `KissAction.statusKey`): `useIsWaiting(LoadUser, { statusKey: userId })`.
 */
export function useIsWaiting(type: abstract new (...args: any[]) => KissAction<any>, options?: StatusOptions): boolean {
  const store = useStoreFromContext<any>();
  const statusKey = options?.statusKey;
  const getIsWaiting = useCallback(() => store.isWaiting(type, { statusKey }), [store, type, statusKey]);
  return useSyncExternalStore(store._subscribeStatus, getIsWaiting, _returnFalse);
}

// On the server and while hydrating, no action is waiting or failed, and the store is ready.
// See `StoreProviderProps.serverState`.
const _returnFalse = () => false;
const _returnNull = () => null;
const _returnTrue = () => true;

/**
 * Returns true if the store is ready, and false while it's still loading the persisted state.
 * See `Store.ready()`.
 *
 * You can show the UI before the store is ready, using the initial-state. But dispatching an
 * action before the store is ready throws a `StoreException`. Use this hook to show a loading
 * state, and to disable the buttons that dispatch actions:
 *
 * ```tsx
 * const isReady = useIsStoreReady();
 * if (!isReady) return <Spinner/>;
 * // or: <button disabled={!isReady} onClick={() => dispatch(new AddTodo())}>Add</button>
 * ```
 *
 * A store without a persistor is always ready. Once ready, a store stays ready.
 */
export function useIsStoreReady(): boolean {
  const store = useStoreFromContext<any>();
  return useSyncExternalStore(store._subscribeReady, store._getIsReady, _returnTrue);
}

/**
 * Returns true if the app is focused (in the browser, if the document is visible: the user is
 * on the tab that shows the app). See `store.isFocused`. The component re-renders when it
 * changes. On the server, it's always `true`.
 *
 * To dispatch an action when the app is focused again, use `useStoreEffect` with `onFocus`.
 */
export function useIsFocused(): boolean {
  const store = useStoreFromContext<any>();
  return useSyncExternalStore(store._subscribeFocus, store._getIsFocused, _returnTrue);
}

/**
 * Returns true if the app is online. See `store.isOnline`. The component re-renders when it
 * changes, so you can show an "offline" banner. On the server, it's always `true`.
 *
 * ```tsx
 * const isOnline = useIsOnline();
 * if (!isOnline) return <Banner>You are offline</Banner>;
 * ```
 *
 * To dispatch an action when the internet comes back, use `useStoreEffect` with `onOnline`.
 */
export function useIsOnline(): boolean {
  const store = useStoreFromContext<any>();
  return useSyncExternalStore(store._subscribeOnline, store._getIsOnline, _returnTrue);
}

/**
 * Returns the environment of the store (production, staging, testing, etc), given to
 * `createStore` as `environment`, or `undefined`. For example, to show a debug banner:
 *
 * ```ts
 * const env = useEnvironment<Environment>();
 * if (env !== Environment.production) return <DebugBanner />;
 * ```
 *
 * Give it the type of the environment, as above. It never re-renders the component, since
 * the environment doesn't change while the app runs.
 *
 * See also: `useConfiguration`. There is no hook for the dependencies, since components
 * should usually not need them. In actions, read them with `this.store.environment`,
 * `this.store.configuration` and `this.store.dependencies`.
 */
export function useEnvironment<E = unknown>(): E {
  return useStoreFromContext<any>().environment as E;
}

/**
 * Returns the configuration of the store (feature flags and other configuration values),
 * created by the `configuration` factory given to `createStore`, or `undefined`. For
 * example, to hide a feature behind a flag:
 *
 * ```ts
 * const config = useConfiguration<Config>();
 * if (config.showAdminConsole) return <AdminConsole />;
 * ```
 *
 * Give it the type of the configuration, as above. It never re-renders the component, since
 * the configuration doesn't change while the app runs.
 *
 * See also: `useEnvironment`.
 */
export function useConfiguration<C = unknown>(): C {
  return useStoreFromContext<any>().configuration as C;
}

/**
 * Returns true if the given action `type` failed, with any error, not only with a
 * `UserException`. Use `exceptionFor` to get the error, if it was a `UserException`.
 * An error swallowed by `wrapError` or the `errorObserver` (they returned `null`), and
 * an `AbortDispatchException`, don't count as failures.
 * Note: This method uses the EXACT action type. Subtypes are not considered.
 *
 * Pass `{ statusKey }` to consider only the failures with that `statusKey` (see
 * `KissAction.statusKey`): `useIsFailed(LoadUser, { statusKey: userId })`.
 */
export function useIsFailed(type: { new(...args: any[]): KissAction<any> }, options?: StatusOptions): boolean {
  const store = useStoreFromContext<any>();
  const statusKey = options?.statusKey;
  const getIsFailed = useCallback(() => store.isFailed(type, { statusKey }), [store, type, statusKey]);
  return useSyncExternalStore(store._subscribeStatus, getIsFailed, _returnFalse);
}

/**
 * Returns the `UserException` of the `type` that failed. Returns `null` if it didn't fail,
 * or if it failed with an error that is not a `UserException` (in that case, `isFailed` is
 * still true).
 * Note: This method uses the EXACT type in `type`. Subtypes are not considered.
 *
 * The exception is the object the action threw (or the one `wrapError` or the `errorObserver`
 * returned). It's returned as is: don't change it after throwing it, since React compares it
 * by identity to know if the component must rebuild.
 *
 * Pass `{ statusKey }` to get the exception of the failure with that `statusKey` (see
 * `KissAction.statusKey`): `useExceptionFor(LoadUser, { statusKey: userId })`. Without it,
 * if actions with different keys failed, you get the `UserException` of the most recent
 * failure.
 */
export function useExceptionFor(type: { new(...args: any[]): KissAction<any> }, options?: StatusOptions): UserException | null {
  const store = useStoreFromContext<any>();
  const statusKey = options?.statusKey;
  const getExceptionFor = useCallback(() => store.exceptionFor(type, { statusKey }), [store, type, statusKey]);
  return useSyncExternalStore(store._subscribeStatus, getExceptionFor, _returnNull);
}

/**
 * Removes the exact given action `type` from the list of action types that failed.
 * Note it clears the EXACT given type. Subtypes are not considered.
 *
 * Even if you never call this method explicitly, just dispatching an action already clears that action type
 * from the list of failing action types. But you can call this method explicitly if you want to clear the
 * action type before it's used again.
 *
 * Usage:
 * ```ts
 * const clearExceptionFor = useClearExceptionFor();
 * clearExceptionFor(MyAction);
 * clearExceptionFor(AnotherAction);
 * ```
 *
 * Pass `{ statusKey }` to clear only the failure with that `statusKey` (see
 * `KissAction.statusKey`): `clearExceptionFor(LoadUser, { statusKey: userId })`. Without it,
 * all the failures of the type are cleared, whatever their keys.
 */
export function useClearExceptionFor(): (type: { new(...args: any[]): KissAction<any> }, options?: StatusOptions) => void {
  const store = useStoreFromContext<any>();
  return useMemo(() => (type: { new(...args: any[]): KissAction<any> }, options?: StatusOptions) => {
    store.clearExceptionFor(type, options);
  }, [store]);
}

/**
 * Handles an event (`Evt` or `EvtState`) from the state, by calling the `callback` with its
 * value, once per event:
 *
 * ```tsx
 * function Feed() {
 *   const listRef = useRef<HTMLDivElement>(null);
 *   const inputRef = useRef<HTMLInputElement>(null);
 *
 *   useEvent((state: State) => state.scrollToTopEvt, () => listRef.current?.scrollTo({ top: 0 }));
 *   useEvent((state: State) => state.changeTextEvt, (text) => { inputRef.current!.value = text; });
 *   ...
 * }
 * ```
 *
 * Events are for an action to ask the UI to do something once, that is not a state change:
 * scroll a list, clear or focus an input, open a dialog. See `Evt` for how actions create them.
 *
 * The `selector` returns one event from the state (or `null`/`undefined`, to handle nothing).
 * The `callback` runs in an effect, after the render that shows the new state is committed, like
 * a `useEffect` (use `useLayoutEvent` to run it before the browser paints, like a
 * `useLayoutEffect`). It's always the callback of the latest render, so it sees the latest props.
 *
 * For an `Evt`, the callback is called once per event, and then the event is **spent**:
 *
 * - A new event while the component is mounted: fires once.
 * - An event created before the component mounts: fires once, when it mounts.
 * - The component remounts later: doesn't fire, since the event is spent.
 * - Two components use the same event: only the first one fires. Create two events for that.
 * - Unrelated re-renders: doesn't fire.
 * - In React's `StrictMode`, which runs effects twice in development: fires once.
 *
 * For an `EvtState`, the callback is called when the state has a different `EvtState` than the
 * last one the component saw. It fires in every mounted component that uses it, but not when the
 * component mounts or remounts, so events that happen while it's not mounted are missed.
 *
 * The store keeps which events were spent (see `store.isEventSpent`), so the events and the state
 * stay immutable. Nothing is spent during render: React may throw a render away, so a render
 * can't spend the event. That's why there is no way to consume an event in render, only this hook.
 */
export function useEvent<St, T>(
  selector: (state: St) => Evt<T> | EvtState<T> | null | undefined,
  callback: (value: T) => void,
): void {
  const handle = useEventHandler(selector);
  useEffect(() => handle(callback), [handle, callback]);
}

/**
 * The same as `useEvent`, but the `callback` runs in a layout effect, before the browser paints
 * (like a `useLayoutEffect`). Use it when the UI work would otherwise flicker: a scroll, a focus,
 * a measurement. Like `useLayoutEffect`, it does nothing on the server, and React 18 warns about it
 * there. Prefer `useEvent` when the timing doesn't matter.
 */
export function useLayoutEvent<St, T>(
  selector: (state: St) => Evt<T> | EvtState<T> | null | undefined,
  callback: (value: T) => void,
): void {
  const handle = useEventHandler(selector);
  useLayoutEffect(() => handle(callback), [handle, callback]);
}

// The implementation of `useEvent` and `useLayoutEvent`. Returns a function that handles the
// selected event with the given callback, if it wasn't handled yet. The function changes when the
// event (or the store) changes, so the effects above run it again then. They also run it again
// when the callback changes (an inline callback changes in every render), which does nothing, as
// the event is already handled. So it's always the callback of the latest render that handles a
// new event. Running it twice does nothing, which is what `StrictMode` does with effects.
function useEventHandler<St, T>(
  selector: (state: St) => Evt<T> | EvtState<T> | null | undefined,
): (callback: (value: T) => void) => void {
  const store = useStoreFromContext<St>();
  const evt = useSelect(selector);

  // For `EvtState` only: the last event the component saw, starting with the one at mount, so
  // that mounting doesn't fire.
  const lastSeenRef = useRef(evt);

  return useCallback((callback: (value: T) => void) => {
    if (evt == null) return;

    if (evt instanceof EvtState) {
      if (lastSeenRef.current === evt) return;
      lastSeenRef.current = evt;
      if (evt._spentAtCreation) return;
      callback(evt.value as T);
      return;
    }

    if (store.isEventSpent(evt)) return;
    store._spentEvents.add(evt);
    callback(evt.value as T);
  }, [evt, store]);
}

function useStoreContext<St>(): { store: Store<St>, getServerState: () => St } {
  const context = useContext<StoreContextType<St>>(StoreContext) as StoreContextType<St>;
  if (!context?.store) {
    throw new StoreException('useStore must be used within a StoreProvider');
  }
  return context as { store: Store<St>, getServerState: () => St };
}

function useStoreFromContext<St>(): Store<St> {
  return useStoreContext<St>().store;
}

/**
 * Helper class that allows us to write:
 *
 * ```js
 * const store = useStore();
 * store.dispatch(new MyAction());
 * store.dispatchSync(new MyAction());
 * await store.dispatchAndWait(new MyAction());
 * store.dispatchAll([new MyAction(), new OtherAction()]);
 * await store.dispatchAndWaitAll([new MyAction(), new OtherAction()]);
 * ```
 */
class StoreDispatchers<St> {

  constructor(public store: Store<St>) {
    // Bind the methods, so that they also work when destructured: `const { dispatch } = useStore()`.
    this.dispatch = this.dispatch.bind(this);
    this.dispatchWhen = this.dispatchWhen.bind(this);
    this.dispatchAndWait = this.dispatchAndWait.bind(this);
    this.dispatchSync = this.dispatchSync.bind(this);
    this.dispatchAll = this.dispatchAll.bind(this);
    this.dispatchAndWaitAll = this.dispatchAndWaitAll.bind(this);
    this.waitCondition = this.waitCondition.bind(this);
    this.waitActionCondition = this.waitActionCondition.bind(this);
    this.waitAllActions = this.waitAllActions.bind(this);
    this.waitActionType = this.waitActionType.bind(this);
    this.waitAllActionTypes = this.waitAllActionTypes.bind(this);
    this.waitAnyActionTypeFinishes = this.waitAnyActionTypeFinishes.bind(this);
  }

  /**
   * Dispatches the action to the Redux store, to potentially change the state.
   */
  dispatch(action: KissAction<any>): void {
    return this.store.dispatch(action);
  }

  /**
   * Waits until the store state meets a certain condition, and then dispatches an action.
   * If the condition is already true, the action is dispatched right away, before `dispatchWhen`
   * returns. Otherwise, it is dispatched synchronously, right after the state change that meets
   * the condition, so no other action can change the state in between.
   * If the same state change meets the condition of several `dispatchWhen`, their actions are
   * dispatched one after the other, and each condition is checked again right before its
   * action is dispatched. If an earlier action made it false, it keeps waiting.
   *
   * ```ts
   * store.dispatchWhen(new BuyStock('IBM'), (state) => state.stocks.getPrice('IBM') >= 100, { timeoutMillis: 0 });
   * ```
   *
   * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
   * is not met in `timeoutMillis` milliseconds, the action is NOT dispatched, and the condition
   * stops being checked. In this case, `onTimeout` is called if you provided it. Otherwise, the
   * timeout is logged with `Store.log()`. To wait with NO timeout, pass `{ timeoutMillis: 0 }`
   * (or -1, or `Infinity`), but note that while it waits, the condition runs on every state change.
   * A `logOut()` cancels the `dispatchWhen`s that are still waiting: their action is not
   * dispatched, and their `onTimeout` is not called.
   *
   * ```ts
   * store.dispatchWhen(
   *   new BuyStock('IBM'),
   *   (state) => state.stocks.getPrice('IBM') >= 100,
   *   { timeoutMillis: 60 * 1000, onTimeout: () => console.log('IBM never reached 100.') },
   * );
   * ```
   */
  dispatchWhen(
    action: KissAction<St>,
    condition: (state: St) => boolean,
    options: {
      timeoutMillis: number,
      onTimeout?: () => void
    }
  ): void {
    this.store.dispatchWhen(action, condition, options);
  }

  /**
   * Dispatches an action and returns a promise that resolves when the action finishes.
   * While the state change from the action's reducer will have been applied when the promise
   * resolves, other independent processes that the action may have started may still be in
   * progress.
   *
   * Usage: `await store.dispatchAndWait(new MyAction())`.
   */
  dispatchAndWait(action: KissAction<any>): Promise<ActionStatus> {
    return this.store.dispatchAndWait(action);
  }

  /**
   * Dispatches the given action to the Redux store, to potentially change the state.
   *
   * This is exactly the same as the regular `dispatch`, except for the fact it
   * will throw a `StoreException` if the action is ASYNC. Note an action is ASYNC
   * if any of its `reduce()` or `before()` methods return a Promise.
   *
   * The only use for `dispatchSync` is when you need to guarantee (in runtime) that your
   * action is SYNC, which means the state gets changed right after the dispatch call.
   */
  dispatchSync(action: KissAction<any>): void {
    return this.store.dispatchSync(action);
  }

  /**
   * Dispatches all given actions in parallel, applying their reducer, and possibly changing
   * the store state. It returns the same list of actions, so that you can instantiate them
   * inline, but still get a list of them.
   *
   * ```ts
   * let actions = store.dispatchAll([new BuyAction('IBM'), new SellAction('TSLA')]);
   * ```
   *
   * See also:
   * - `dispatch` which dispatches both sync and async actions.
   * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
   * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
   * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
   */
  dispatchAll(actions: KissAction<any>[]): KissAction<any>[] {
    return this.store.dispatchAll(actions);
  }

  /**
   * Dispatches all given actions in parallel, applying their reducers, and possibly changing
   * the store state. The actions may be sync or async. It returns a Promise that resolves when
   * ALL actions finish, with the same list of actions.
   *
   * ```ts
   * let actions = await store.dispatchAndWaitAll([new BuyAction('IBM'), new SellAction('TSLA')]);
   * ```
   *
   * Note: While the state change from the action's reducers will have been applied when the
   * Promise resolves, other independent processes that the action may have started may still
   * be in progress.
   *
   * If some actions fail with an error that is not swallowed (see `dispatchAndWait`), all
   * actions are still dispatched and allowed to finish. Only then the Promise rejects, with
   * the error of the first failed action in the list.
   *
   * See also:
   * - `dispatch` which dispatches both sync and async actions.
   * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
   * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
   * - `dispatchAll` which dispatches all given actions in parallel.
   */
  dispatchAndWaitAll(actions: KissAction<any>[]): Promise<KissAction<any>[]> {
    return this.store.dispatchAndWaitAll(actions);
  }

  /**
   * Returns a promise which will resolve when the given state `condition` is true.
   * If the condition is already true when the method is called, the promise resolves immediately.
   *
   * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
   * is not met in `timeoutMillis` milliseconds, the promise rejects with a `TimeoutException`,
   * and the condition stops being checked. To wait with NO timeout, pass `{ timeoutMillis: 0 }`
   * (or -1, or `Infinity`):
   *
   * ```ts
   * await store.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 }); // 1 second.
   * await store.waitCondition((state) => state.name == "Bill", { timeoutMillis: 0 }); // No timeout.
   * ```
   *
   * To handle the timeout, you can catch the `TimeoutException`:
   *
   * ```ts
   * try { await store.waitCondition(condition, { timeoutMillis: 5000 }); }
   * catch (error) { if (error instanceof TimeoutException) { ... } else throw error; }
   * ```
   *
   * Or, you can pass an `onTimeout` callback. If the timeout expires, `onTimeout` is called,
   * and the promise resolves with `null` instead of rejecting. If `onTimeout` throws, the
   * promise rejects with that error:
   *
   * ```ts
   * await store.waitCondition(condition, { timeoutMillis: 5000, onTimeout: () => { ... } });
   * ```
   *
   * It returns the action which changed the store state into the condition, in case you need it:
   *
   * ```ts
   * let action = await store.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 });
   * ```
   *
   * This method is also eventually useful in production code, but note that while it waits,
   * the condition runs on EVERY state change. A few short-lived waits are fine. But many waits,
   * or waits that may never complete (especially with no timeout), add a cost to every state
   * change, for as long as the store lives, since there is no way to cancel a wait. In
   * production, it's often better to put the logic in an action, or to react to the selected
   * state in your components.
   *
   * Example, in a component:
   *
   * ```tsx
   * function BuyButton() {
   *   const store = useStore();
   *
   *   async function buy() {
   *     store.dispatch(new BuyStock('IBM'));
   *     await store.waitCondition((state) => state.portfolio.includes('IBM'), { timeoutMillis: 5000 });
   *     showMessage('IBM is now in your portfolio.');
   *   }
   *
   *   return <button onClick={buy}>Buy IBM</button>;
   * }
   * ```
   *
   * Note `useStore()` doesn't give you the state. To read the state in a component, use
   * `useSelect`. In tests, use the store itself (see `Store.waitCondition`).
   *
   * See also:
   * - `waitCondition` - Waits until the state is in a given condition.
   * - `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * - `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * - `waitActionType` - Waits until an action of a given type is NOT in progress.
   * - `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * - `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   */
  waitCondition(
    condition: (state: St) => boolean,
    {
      timeoutMillis,
      onTimeout,
    }: {
      timeoutMillis: number,
      onTimeout?: () => void
    }
  ): Promise<KissAction<St> | null> {
    return this.store.waitCondition(condition, {timeoutMillis, onTimeout});
  }

  /**
   * Returns a Promise that resolves when some actions meet the given `condition`.
   *
   * If `completeImmediately` is false (the default), this method will throw an error if the
   * condition was already true when the method was called. Otherwise, the promise will complete
   * immediately and throw no error.
   *
   * The `condition` is a function that takes the set of actions "in progress", as well as an
   * action that just entered the set (by being dispatched) or left the set (by finishing
   * dispatching). The function should return `true` when the condition is met, and `false`
   * otherwise. For example:
   *
   * ```ts
   * let action = await store.waitActionCondition((actionsInProgress, triggerAction) => { ... });
   * ```
   *
   * Important: Your condition function should NOT modify the set of actions.
   *
   * You get back the set of the actions being dispatched that met the condition, as well as
   * the action that triggered the condition by being added or removed from the set.
   *
   * Note: The condition is only checked when some action is dispatched or finishes dispatching.
   * It's not checked every time action statuses change.
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Example, in a component:
   *
   * ```tsx
   * function RefreshButton() {
   *   const store = useStore();
   *
   *   async function refresh() {
   *     store.dispatch(new RefreshPrices());
   *
   *     // Waits until no RefreshPrices action is in progress.
   *     await store.waitActionCondition(
   *       (actions) => ![...actions].some((action) => action instanceof RefreshPrices),
   *       { timeoutMillis: 5000 });
   *
   *     showMessage('Prices refreshed.');
   *   }
   *
   *   return <button onClick={refresh}>Refresh</button>;
   * }
   * ```
   *
   * See also:
   * - `waitCondition` - Waits until the state is in a given condition.
   * - `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * - `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * - `waitActionType` - Waits until an action of a given type is NOT in progress.
   * - `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * - `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   */
  async waitActionCondition(
    //
    /// The condition receives the current actions in progress, and the action that triggered the condition.
    condition:
      (
        actions: Set<KissAction<St>>,
        triggerAction: KissAction<St> | null
      ) => boolean,
    {
      // If `completeImmediately` is `false` (the default), this method will throw an error if the
      // condition is already true when the method is called. Otherwise, the promise will complete
      // immediately and throw no error.
      completeImmediately = false,
      //
      // The maximum time to wait for the condition to be met. The default is 3 seconds.
      // To disable the timeout, make it 0 or -1.
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {})
    : Promise<{ actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null }> {

    return this.store.waitActionCondition(
      condition, {
        completeImmediately: completeImmediately,
        timeoutMillis: timeoutMillis,
        onTimeout: onTimeout,
      });
  }

  /**
   * Returns a promise that resolves when ALL given actions finished dispatching.
   *
   * If `completeImmediately` is false (the default), this method will throw an error if none
   * of the given actions are in progress when the method is called. Otherwise, the promise will
   * complete immediately and throw no error.
   *
   * However, if you don't provide any actions (empty list or `null`), the promise will complete
   * when ALL current actions in progress finish dispatching. In other words, when no actions are
   * currently in progress. In this case, if [completeImmediately] is `false`, the method will
   * throw an error if no actions are in progress when the method is called.
   *
   * Note: Waiting until no actions are in progress should only be done in test, never in
   * production, as it's very easy to create a deadlock. However, waiting for specific actions to
   * finish is safe in production, as long as you're waiting for actions you just dispatched.
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Example, in a component:
   *
   * ```tsx
   * function BuyBothButton() {
   *   const store = useStore();
   *
   *   async function buyBoth() {
   *     const buyIBM = new BuyStock('IBM');
   *     const buyTSLA = new BuyStock('TSLA');
   *     store.dispatch(buyIBM);
   *     store.dispatch(buyTSLA);
   *     await store.waitAllActions([buyIBM, buyTSLA]);
   *     showMessage('Done.');
   *   }
   *
   *   return <button onClick={buyBoth}>Buy IBM and TSLA</button>;
   * }
   * ```
   *
   * See also:
   * - `waitCondition` - Waits until the state is in a given condition.
   * - `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * - `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * - `waitActionType` - Waits until an action of a given type is NOT in progress.
   * - `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * - `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   */
  waitAllActions(
    actions: KissAction<St>[] | null,
    {
      completeImmediately = false,
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<{ actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null }> {

    return this.store.waitAllActions(
      actions, {
        completeImmediately: completeImmediately,
        timeoutMillis: timeoutMillis,
        onTimeout: onTimeout,
      });
  }

  /**
   * Returns a promise that completes when an action of the given type in NOT in progress
   * (it's not being dispatched):
   *
   * - If NO action of the given type is currently in progress when the method is called,
   *   and `completeImmediately` is false (the default), this method will throw an error.
   *
   * - If NO action of the given type is currently in progress when the method is called,
   *   and `completeImmediately` is true, the promise completes immediately, returns `null`,
   *   and throws no error.
   *
   * - If an action of the given type is in progress, the promise completes when the action
   *   finishes, and returns the action. You can use the returned action to check its `status`:
   *
   *   ```ts
   *   let action = await store.waitActionType(MyAction);
   *   expect(action?.status.originalError).toBeInstanceOf(UserException);
   *   ```
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * You should only use this method in tests. In tests you usually have the store itself,
   * so see the same method in `Store`, which has more examples.
   *
   * See also:
   * - `waitCondition` - Waits until the state is in a given condition.
   * - `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * - `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * - `waitActionType` - Waits until an action of a given type is NOT in progress.
   * - `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * - `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   */
  async waitActionType(
    actionType: { new(...args: any[]): KissAction<St> },
    {
      completeImmediately = false,
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<KissAction<St> | null> {
    return this.store.waitActionType(
      actionType, {
        completeImmediately: completeImmediately,
        timeoutMillis: timeoutMillis,
        onTimeout: onTimeout,
      });
  }

  /**
   * Returns a promise that completes when ALL actions of the given type are NOT in progress
   * (none of them is being dispatched):
   *
   * - If NO action of the given types is currently in progress when the method is called,
   *   and `completeImmediately` is false (the default), this method will throw an error.
   *
   * - If NO action of the given type is currently in progress when the method is called,
   *   and `completeImmediately` is true, the promise completes immediately and throws no error.
   *
   * - If any action of the given types is in progress, the promise completes only when
   *   no action of the given types is in progress anymore.
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * You should only use this method in tests. In tests you usually have the store itself,
   * so see the same method in `Store`, which has more examples.
   *
   * See also:
   * - `waitCondition` - Waits until the state is in a given condition.
   * - `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * - `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * - `waitActionType` - Waits until an action of a given type is NOT in progress.
   * - `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * - `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   */
  async waitAllActionTypes(
    actionTypes: { new(...args: any[]): KissAction<any> }[],
    {
      completeImmediately = false,
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<void> {
    return this.store.waitAllActionTypes(
      actionTypes, {
        completeImmediately: completeImmediately,
        timeoutMillis: timeoutMillis,
        onTimeout: onTimeout,
      });
  }

  /**
   * Returns a promise which will complete when ANY action of the given types FINISHES
   * dispatching. IMPORTANT: This method is different from the other similar methods, because
   * it does NOT complete immediately if no action of the given types is in progress. Instead,
   * it waits until an action of the given types finishes dispatching, even if they
   * were not yet in progress when the method was called.
   *
   * This method returns the action that completed the promise, which you can use to check
   * its `status`.
   *
   * It's useful when the actions you are waiting for are not yet dispatched when you call this
   * method. For example, suppose action `StartAction` starts a process that takes some time
   * to run and then dispatches an action called `MyFinalAction`. You can then write:
   *
   * ```ts
   * store.dispatch(new StartAction());
   * let action = await store.waitAnyActionTypeFinishes([MyFinalAction]);
   * expect(action.status.originalError).toBeInstanceOf(UserException);
   * ```
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * You should only use this method in tests. In tests you usually have the store itself,
   * so see the same method in `Store`, which has more examples.
   *
   * See also:
   * - `waitCondition` - Waits until the state is in a given condition.
   * - `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * - `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * - `waitActionType` - Waits until an action of a given type is NOT in progress.
   * - `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * - `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   */
  waitAnyActionTypeFinishes(
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    options?: { timeoutMillis?: number | null, onTimeout?: undefined }
  ): Promise<KissAction<St>>;
  waitAnyActionTypeFinishes(
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    options: { timeoutMillis?: number | null, onTimeout?: () => void }
  ): Promise<KissAction<St> | null>;
  async waitAnyActionTypeFinishes(
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    {
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<KissAction<St> | null> {
    return this.store.waitAnyActionTypeFinishes(
      actionTypes, {
        timeoutMillis: timeoutMillis,
        onTimeout: onTimeout,
      });
  }
}
