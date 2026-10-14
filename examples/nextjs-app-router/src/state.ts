export type Item = { readonly id: number; readonly text: string };

export type User = { readonly id: number; readonly name: string; readonly updatedAt: string };

/**
 * The state of the app. It's a plain object, so that it travels from the server component to
 * the client component as a prop (Next.js serializes props as JSON). A class-based state would
 * need its own `toJSON`/`fromJSON`, or the serializer of `ClassPersistor`.
 *
 * Being a plain object also means the default merge of `StoreSlice` (a shallow merge) works for
 * the per-route data below (`users` and `user`), with no `mergeServerState` option.
 */
export type State = {
  /** Loaded on the server, on every request. */
  readonly items: readonly Item[];

  /**
   * When the server loaded the items, as an ISO string. The HTML shows it, which proves the
   * page was rendered on the server. It's kept as a string: formatting it with the local time
   * zone would give different text on the server and on the client, a hydration mismatch.
   */
  readonly loadedAt: string;

  /** Changed on the client. The persistor keeps it in localStorage. */
  readonly clicks: number;

  /** Set on the client, after hydration, by `useStoreEffect`. */
  readonly hydrated: boolean;

  /** Loaded by the `/users` route, on the server, and merged into the store by `StoreSlice`. */
  readonly users: readonly User[];

  /** Loaded by the `/users/[id]` route, on the server, and merged into the store by `StoreSlice`. */
  readonly user: User | null;
};

export const emptyState: State = {
  items: [],
  loadedAt: '',
  clicks: 0,
  hydrated: false,
  users: [],
  user: null,
};
