'use client';
import React from 'react';
import { Store } from './Store';
import { StoreException } from './StoreException';

// Read through the default import, not as named imports: under the `react-server` export
// condition, React's server build has no `createContext` or `useContext`, and Node's ESM loader
// rejects a named import that the module doesn't export, when it links the module. A React
// Server Components bundler never evaluates this module on the server (it's marked
// `'use client'`), but the package's server entry re-exports the components from here, and a
// plain Node import of it with that condition (the package's own tests) must load.
const { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } = React;

// This file has the `'use client'` directive, and so does `Hooks.tsx`, since the provider and
// the hooks need React's context and hooks, which only exist in client components. In a React
// Server Components app (like the Next.js app router), the bundler turns these modules into
// client references, so that a server component can import `createStore` and the actions from
// the package, while the hooks and the provider stay client-only. Also, the package has a
// `react-server` export condition pointing to `server.ts`, which doesn't include this file.

export interface StoreProviderProps<St> {
  /**
   * The store the components below get from the hooks. If it changes, the components switch to
   * the new store: they stop listening to the old one, read the new one right away, and the
   * `useStoreEffect` callbacks run `onUnmount` for the old store and `onMount` for the new one.
   */
  store: Store<St>;

  /**
   * The state the server HTML was rendered from, for server-side rendering and hydration.
   * On the server, it's the state to render. On the client, it's the state the HTML shows, which
   * React needs to hydrate without mismatches, even if the live store already changed. After
   * hydration, the components catch up with the live state. If not given, it's the
   * `initialState` the store was created with, which is right when:
   * - On the server, you put the data in the `initialState`, instead of dispatching actions
   *   before rendering. If you dispatch before rendering, pass `serverState={store.state}`.
   * - On the client, you create the store with the state transferred from the server. If you
   *   create it with some other state, pass the transferred state here.
   * It's only read while hydrating, so a later change is ignored. It should be a stable value.
   *
   * On the server and while hydrating, `useIsWaiting` and `useIsFailed` are false,
   * `useExceptionFor` is null, and `useIsStoreReady` is true: the server HTML never shows an
   * action in progress, a failed action, or a store that is not ready. After hydration, these
   * hooks catch up with the live store too. So, on the server, wait for your actions to finish
   * (and for `store.ready()`, if the server store has a persistor) before rendering.
   */
  serverState?: St;

  children: React.ReactNode;
}

export interface StoreContextType<St> {
  store: Store<St> | null;

  /** Returns the `serverState` of the provider (or the store's `initialState`). See `StoreProviderProps`. */
  getServerState: () => St;

  /**
   * Returns the state the components below render on the client: the live store state, or,
   * inside a `StoreSlice` that is not committed yet, the live state with the slice merged into
   * it. The hooks give it to `useSyncExternalStore`, so it must return the same object while
   * the live state doesn't change.
   */
  getState: () => St;
}

// Under the `react-server` export condition, React's server build has no `createContext`. A
// React Server Components bundler never evaluates this module on the server (it's marked
// `'use client'`, so its exports become client references), but the package's server entry
// re-exports the components from here, and a plain Node import of it with that condition (as in
// the package's own tests) must not throw.
export const StoreContext: React.Context<StoreContextType<any>> = (typeof createContext === 'function')
  ? createContext<StoreContextType<any>>({ store: null, getServerState: () => undefined, getState: () => undefined })
  : (null as unknown as React.Context<StoreContextType<any>>);

export function StoreProvider<St>(props: StoreProviderProps<St>): React.ReactElement {
  const {store, children} = props;
  const serverState = ('serverState' in props) ? props.serverState as St : store._initialState;
  const value = useMemo<StoreContextType<St>>(
    () => ({ store, getServerState: () => serverState, getState: store._getState }),
    [store, serverState]);
  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export interface StoreSliceProps {
  /**
   * The slice of state the server loaded for this route: a plain, serializable object (in
   * Next.js, it's a prop a server component gives to this client component). It's merged into
   * the store state once, when the component mounts; to merge it again, remount the component
   * with a new `key`. A later change of this prop, without a new key, is ignored.
   */
  state: object;

  children?: React.ReactNode;
}

// `useLayoutEffect` doesn't run on the server, and React 18 warns when it's rendered there.
const useIsomorphicLayoutEffect = (typeof window === 'undefined') ? useEffect : useLayoutEffect;

/**
 * Merges the state the server loaded for a route into the store, in a server-rendered app with
 * several routes (see "Server-side rendering" in the README). The store lives above the routes
 * (the root layout in the Next.js app router, `_app.tsx` in the pages router), and each route's
 * server code loads its own data. Render the route's content inside a `StoreSlice` with that
 * data, in the Next.js app router:
 *
 * ```tsx
 * // app/users/[id]/page.tsx, a server component.
 * export default async function UserPage({ params }) {
 *   const user = await loadUser((await params).id);
 *   return <StoreSlice state={{ user }} key={user.id}><UserView /></StoreSlice>;
 * }
 * ```
 *
 * What it does:
 * - On the server, it merges the slice into the request's store, and the components inside it
 *   render the merged state, so the HTML shows the route's data.
 * - On the client, while hydrating, the components inside it hydrate against the same merged
 *   server state (no mismatch, even if the live store already differs), and the slice is merged
 *   into the live store in the same commit, before their effects run, so nothing changes under
 *   them after hydration.
 * - On client-side navigation, the components inside it read the live state with the slice
 *   merged into it from their first render, so the first render of the route already shows its
 *   data: no empty or stale frame. The live store gets the slice when the route commits, before
 *   the effects of the route and before the browser paints, and the other components (the
 *   layout) catch up right then. A render that React throws away (a transition to the route
 *   that is cancelled, or that suspends and never commits) leaves nothing in the live store.
 *
 * The merge is `store.mergeServerState(slice)`: the `mergeServerState` option of `createStore`,
 * or a shallow merge for plain-object states. The slice is merged once per mount: use `key`
 * (the entity id, for example) to merge again when the route's data changes. If the store is
 * not ready yet (a persistor still reading), the slice is merged again into the persisted
 * state when it arrives.
 */
export function StoreSlice(props: StoreSliceProps): React.ReactElement {
  const { state: slice, children } = props;
  const parent = useContext(StoreContext);
  const store = parent.store;
  if (store === null) throw new StoreException('StoreSlice must be used within a StoreProvider.');

  // Once per mount. The server state of the subtree is the parent's server state with the slice:
  // what the server HTML shows for this route. (React calls this initializer twice in
  // StrictMode, and keeps one of the results.)
  const [applied] = useState(() => new AppliedSlice(store, parent.getServerState(), slice));

  const value = useMemo<StoreContextType<any>>(
    () => ({ store, getServerState: applied.getServerState, getState: applied.getState }),
    [store, applied]);

  // `CommitSlice` comes before the children, so that its layout effect runs before theirs.
  return (
    <StoreContext.Provider value={value}>
      <CommitSlice applied={applied} />
      {children}
    </StoreContext.Provider>
  );
}

/**
 * The slice of a mounted `StoreSlice`, and how the components inside it read the state.
 *
 * On the server there is no commit, so the slice is merged into the request's store right away,
 * while React renders (the server render is synchronous and never thrown away, and nothing
 * listens to the request's store, so nothing is published).
 *
 * On the client, the live store is not changed while React renders: React may throw the render
 * away (a cancelled transition, a route that suspends and never commits), and a change made in
 * it would stay in the store and show up in the other components later. Instead, until the
 * route commits, the components inside the slice read the live state with the slice merged
 * into it (`getState`, cached by the live state, since `useSyncExternalStore` needs the same
 * object while nothing changed), and the other components still read the live state. When the
 * route commits, `commit` merges the slice into the live store, in a layout effect that runs
 * before the effects of the route's components, and publishes the change, so that the other
 * components catch up before the browser paints. From then on, the components inside the
 * slice read the live state, which has the slice.
 */
class AppliedSlice<St> {
  private readonly serverState: St;
  private isCommitted = false;
  private base: St | undefined = undefined;
  private merged: St | undefined = undefined;

  constructor(
    private readonly store: Store<St>,
    parentServerState: St,
    private readonly slice: object,
  ) {
    this.serverState = store._mergeSlice(parentServerState, slice);
    if (typeof window === 'undefined' || store.isServer) {
      store._mergeServerStateSilently(slice);
      this.isCommitted = true;
    }
  }

  readonly getServerState = (): St => this.serverState;

  readonly getState = (): St => {
    const state = this.store._getState();
    if (this.isCommitted) return state;
    if (this.base !== state) {
      this.base = state;
      this.merged = this.store._mergeSlice(state, this.slice);
    }
    return this.merged as St;
  };

  /** Merges the slice into the live store, once. The second call (StrictMode) does nothing. */
  commit(): void {
    if (this.isCommitted) return;
    this.isCommitted = true;
    this.store.mergeServerState(this.slice);
  }
}

/** Rendered before the children of a `StoreSlice`: its layout effect runs before theirs. */
function CommitSlice(props: { applied: AppliedSlice<any> }): null {
  const { applied } = props;
  useIsomorphicLayoutEffect(() => {
    applied.commit();
  }, [applied]);
  return null;
}
