import React, { useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import { UserException } from './UserException';
import { StoreException } from './StoreException';
import { Store, StoreContext, StoreContextType } from "./Store";
import { KissAction, ActionStatus } from './KissAction';

/**
 * Returns a part of the store state:
 *
 * ```ts
 * const name = useSelect((state: State) => state.user.name);
 * ```
 *
 * The component will rebuild only when the `name` changes, ignoring the
 * change in other parts of the state.
 *
 * Note: You can use `useSelect` and `useSelector` interchangeably.
 * Prefer `useSelect` because it's shorter.
 */
export function useSelect<St, T>(selector: (state: St) => T): T {
  const store: Store<St> = useStoreFromContext<St>();
  return useSubscribedSelector(store._refStateHooks, RefState, selector, () => store.state, true);
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
 * Returns an object (or array) with some parts of the store state:
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
 * selector returns an array: `useObject((state: State) => [state.name, state.age])`.
 *
 * Note the values themselves are compared by identity. So, the selector should return parts
 * of the state, and not create new objects or arrays for its values.
 */
export function useObject<St, T>(selector: (state: St) => T): T {
  // The last object returned. While the selector returns objects with the same values, we keep
  // returning this same object, so that `useSelect` sees no change.
  const lastRef = useRef<{ value: T } | null>(null);

  return useSelect((state: St) => {
    const value = selector(state);
    const last = lastRef.current;
    if (last !== null && _shallowEqual(last.value, value)) return last.value;
    lastRef.current = {value};
    return value;
  });
}

// Returns true if `a` and `b` are the same, or are both arrays (or both plain objects) with the
// same values (compared with `Object.is`).
function _shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++)
      if (!Object.is(a[i], b[i])) return false;
    return true;
  }

  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
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
 * You can get the store to use all dispatch and wait methods:
 *
 * - `dispatch` - Dispatches the action to the Redux store, to potentially change the state.
 * - `dispatchAndWait` - Dispatches an action and returns a promise that resolves when the action finishes.
 * - `dispatchSync` - Same as the regular dispatch, except it throws an error if the action is ASYNC.
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
 * await store.waitCondition((state) => state.user.name === "Bill", { timeoutMillis: 1000 });
 * await store.waitAllActionTypes([BuyAction, SellAction]);
 * ```
 *
 * IMPORTANT:
 * The store `state` and other store methods are NOT available when you get the store with `useStore`.
 * - To get the state: `useSelect`
 * - To wait for actions: `useIsWaiting`
 * - To deal with exceptions: `useIsFailed`, `useExceptionFor` and `clearExceptionFor`
 *
 * See also:
 * - `useDispatch()` - Hook equivalent to `useStore().dispatch`
 * - `useDispatchAndWait` - Hook equivalent to `useStore().dispatchAndWait`
 * - `useDispatchSync` - Hook equivalent to `useStore().dispatchSync`
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
 * Options for `useDispatch`, to run code when the component mounts, when its `deps` change,
 * and when it unmounts. See `useDispatch`.
 */
export interface UseDispatchOptions<St, D> {
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
 * ## Dispatching when the component mounts and unmounts
 *
 * You can pass `onMount`, `onUnmount`, and `onDepsChange` with its `deps`, to dispatch actions
 * when the component mounts, when some values change, and when it unmounts:
 *
 * ```tsx
 * const dispatch = useDispatch({
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
 * const dispatch = useDispatch({
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
 * `onMount: (store: Store<State>) => ...`.
 *
 * Note you can still dispatch actions from a `useEffect`, as usual, if you prefer.
 * These options are just more convenient, because:
 *
 * - They only run after the store is ready (see `useIsStoreReady`). If the store is not ready
 *   when the component mounts, `onMount` is called as soon as it is. If the component unmounts
 *   before that, none of them is called.
 *
 * - They run in order: `onMount`, then `onDepsChange` (any number of times), then `onUnmount`.
 *   `onMount` and `onUnmount` run once, even in React's `StrictMode`, which mounts components
 *   twice during development. And `onDepsChange` runs once per change.
 *
 * Note: Changing `deps` doesn't call `onMount` again. If you want to dispatch the same actions
 * on mount and when `deps` change, call the same function from both `onMount` and
 * `onDepsChange`. Each of them sees the values from the latest render.
 *
 * See also:
 * - `dispatchAll` which dispatches all given actions in parallel.
 * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
 * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
 * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
 */
export function useDispatch<St = any, const D = undefined>(
  options?: UseDispatchOptions<St, D>
): (action: KissAction<St>) => void {
  const store = useStoreFromContext<St>();
  useLifecycle(store, options);
  return useMemo(() => store.dispatch.bind(store), [store]);
}

// Runs `onMount`, `onDepsChange` and `onUnmount` of `useDispatch`. See `useDispatch`.
function useLifecycle<St, D>(store: Store<St>, options: UseDispatchOptions<St, D> | undefined): void {

  // The options from the latest committed render, so that the callbacks see the latest values.
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
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

      // Waits a microtask, so that it can be cancelled if this is not a real unmount (see above).
      const pendingUnmount = {store, isCancelled: false};
      pendingUnmountRef.current = pendingUnmount;
      Promise.resolve().then(() => {
        if (pendingUnmount.isCancelled) return;
        if (pendingUnmountRef.current === pendingUnmount) pendingUnmountRef.current = null;
        if (mountedStoreRef.current === store) mountedStoreRef.current = null;
        optionsRef.current?.onUnmount?.(store);
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
 * If the condition is already true, the action is dispatched right away.
 *
 * ```ts
 * const dispatchWhen = useDispatchWhen();
 * dispatchWhen(new BuyStock('IBM'), (state) => state.stocks.getPrice('IBM') >= 100, { timeoutMillis: 0 });
 * ```
 *
 * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
 * is not met in `timeoutMillis` milliseconds, the action is NOT dispatched, and the condition
 * stops being checked. In this case, `onTimeout` is called if you provided it. Otherwise, the
 * timeout is logged. To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1), but note that
 * while it waits, the condition runs on every state change.
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
 * - It returns true if an ASYNC action of the specific type is currently being processed.
 * - It returns false if an ASYNC action of the specific type is NOT currently being processed.
 * - This is only useful for ASYNC actions, since it always returns `false` when the action is SYNC.
 *
 * Note an action is ASYNC if it returns a promise from its `before` OR its `reduce` methods.
 *
 * ```ts
 * const isWaiting = useIsWaiting(MyAction);
 * if (isWaiting) { ... } // Show a spinner
 * ```
 */
export function useIsWaiting(type: abstract new (...args: any[]) => KissAction<any>): boolean {
  return useStoreSelector<any, boolean>((store) => store.isWaiting(type));
}

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
  const isReady: boolean = store._isReady;
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    let isMounted = true;
    // Re-renders when the store becomes ready, or right away if it became ready after this render.
    if (!isReady) store.ready().then(() => {
      if (isMounted) forceRender();
    });
    return () => {
      isMounted = false;
    };
  }, [store, isReady]);

  return isReady;
}

/**
 * Returns true if the given action `type` failed with an `UserException`.
 * Note: This method uses the EXACT action type. Subtypes are not considered.
 */
export function useIsFailed(type: { new(...args: any[]): KissAction<any> }): boolean {
  return useStoreSelector<any, boolean>((store) => store.isFailed(type));
}

/**
 * Returns the `UserException` of the `type` that failed.
 * Note: This method uses the EXACT type in `type`. Subtypes are not considered.
 */
export function useExceptionFor(type: { new(...args: any[]): KissAction<any> }): UserException | null {
  return useStoreSelector<any, UserException | null>((store) => store.exceptionFor(type));
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
 */
export function useClearExceptionFor(): (type: { new(...args: any[]): KissAction<any> }) => void {
  const store = useStoreFromContext<any>();
  return useMemo(() => (type: { new(...args: any[]): KissAction<any> }) => {
    store.clearExceptionFor(type);
  }, [store]);
}

function useStoreSelector<St, T>(selector: (store: Store<St>) => T): T {
  const store: Store<St> = useStoreFromContext<St>();
  return useSubscribedSelector(store._refStoreHooks, RefStore, selector, () => store);
}

/**
 * Selects a value and re-renders the component when it changes.
 *
 * The value is selected again on every render, using the selector passed in that render,
 * so selectors that depend on props or local state always use the latest props.
 * After each commit, the ref is updated with the latest selector and value, so that
 * when the store changes, it checks with the latest selector.
 *
 * When it subscribes, it selects again from the current store, in case the state changed
 * between the render and the subscription (for example, a child that dispatches on mount).
 *
 * If `isInputImmutable` is true (the input is the state), it only selects again after the
 * render if the input changed since the render. Otherwise, a selector that creates a new object
 * each time (like `(state) => ({ a: state.a })`) would be different every time, and the
 * component would re-render forever.
 */
function useSubscribedSelector<In, T, R>(
  hooks: Set<React.RefObject<R | undefined>>,
  RefClass: new (selectorAndValueAndSetValue: [(input: In) => T, T, React.Dispatch<React.SetStateAction<T>>]) => R,
  selector: (input: In) => T,
  getInput: () => In,
  isInputImmutable = false,
): T {

  // This ref will persist for the full lifetime of the component.
  const ref = useRef<R>(undefined);

  // Re-renders the component. The store calls it when the selected value changes.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  const input = getInput();
  const value = selector(input);

  // The input used in the last committed render.
  const renderedInputRef = useRef<In>(input);

  // After every render, save in the ref the latest selector and the value it selected.
  // Whenever the state changes, the store will:
  // 1. Retrieve all refs
  // 2. Apply each selector to calculate the selected value.
  // 3. And compare the selected value with the last selected value.
  // 4. If it changed, it calls setValue, which re-renders the component.
  // Child effects run before parent effects, so the state may have changed since the render,
  // while the store was still checking with the previous selector. If it did, re-render.
  // If the selector throws, re-render too, so the error is thrown during render,
  // where React can deal with it.
  const rerenderIfChanged = () => {
    // If the input is the same, the selector would select the same value it selected in the render.
    if (isInputImmutable && getInput() === renderedInputRef.current) return;
    try {
      const [latestSelector, renderedValue] = (ref.current as any).selectorAndValueAndSetValue;
      if (latestSelector(getInput()) !== renderedValue) forceRender();
    } catch {
      forceRender();
    }
  };

  useLayoutEffect(() => {
    ref.current = new RefClass([selector, value, forceRender as React.Dispatch<React.SetStateAction<T>>]);
    renderedInputRef.current = input;

    // On later commits (already subscribed), the new selector may have missed a change.
    if (hooks.has(ref)) rerenderIfChanged();
  });

  // Only once when the component mounts.
  useEffect(() => {
    hooks.add(ref);
    rerenderIfChanged();

    return () => {
      // When the component unmounts, delete the ref.
      hooks.delete(ref);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

function useStoreFromContext<St>(): Store<St> {
  const context = useContext<StoreContextType<St>>(StoreContext) as StoreContextType<St>;
  if (!context?.store) {
    throw new StoreException('useStore must be used within a StoreProvider');
  }
  return context.store as Store<St>;
}

/**
 * Helper class that allows us to write:
 *
 * ```js
 * const store = useStore();
 * store.dispatch(new MyAction());
 * store.dispatchSync(new MyAction());
 * await store.dispatchAndWait(new MyAction());
 * ```
 */
class StoreDispatchers<St> {

  constructor(public store: Store<St>) {
  }

  /**
   * Dispatches the action to the Redux store, to potentially change the state.
   */
  dispatch(action: KissAction<any>): void {
    return this.store.dispatch(action);
  }

  /**
   * Waits until the store state meets a certain condition, and then dispatches an action.
   * If the condition is already true, the action is dispatched right away.
   *
   * ```ts
   * store.dispatchWhen(new BuyStock('IBM'), (state) => state.stocks.getPrice('IBM') >= 100, { timeoutMillis: 0 });
   * ```
   *
   * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
   * is not met in `timeoutMillis` milliseconds, the action is NOT dispatched, and the condition
   * stops being checked. In this case, `onTimeout` is called if you provided it. Otherwise, the
   * timeout is logged with `Store.log()`. To wait with NO timeout, pass `{ timeoutMillis: 0 }`
   * (or -1), but note that while it waits, the condition runs on every state change.
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
   * Returns a promise which will resolve when the given state `condition` is true.
   * If the condition is already true when the method is called, the promise resolves immediately.
   *
   * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
   * is not met in `timeoutMillis` milliseconds, the promise rejects with a `TimeoutException`,
   * and the condition stops being checked. To wait with NO timeout, pass `{ timeoutMillis: 0 }`
   * (or -1):
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
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
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
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
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
   *   expect(action.status.originalError).toBeInstanceOf(UserException);
   *   ```
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
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
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
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
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
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
    options: { timeoutMillis?: number | null, onTimeout: () => void }
  ): Promise<KissAction<St> | null>;
  waitAnyActionTypeFinishes(
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    options?: { timeoutMillis?: number | null }
  ): Promise<KissAction<St>>;
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
      } as { timeoutMillis?: number | null, onTimeout: () => void });
  }
}

class RefState<St, T> {
  selectorAndValueAndSetValue: [(state: St) => T, T, React.Dispatch<React.SetStateAction<T>>];

  constructor(selectorAndValueAndSetValue: [(state: St) => T, T, React.Dispatch<React.SetStateAction<T>>]) {
    this.selectorAndValueAndSetValue = selectorAndValueAndSetValue;
  }
}

class RefStore<St, T> {
  selectorAndValueAndSetValue: [(store: Store<St>) => T, T, React.Dispatch<React.SetStateAction<T>>];

  constructor(selectorAndValueAndSetValue: [(store: Store<St>) => T, T, React.Dispatch<React.SetStateAction<T>>]) {
    this.selectorAndValueAndSetValue = selectorAndValueAndSetValue;
  }
}
