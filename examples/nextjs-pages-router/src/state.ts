export type Item = { readonly id: number; readonly text: string };

/** A user, loaded on the server by the `/users` and `/users/[id]` routes. */
export type User = { readonly id: number; readonly name: string; readonly updatedAt: string };

/**
 * The state of the app. It's a plain object, so that it travels from the server to the client
 * as a prop (Next.js serializes props as JSON), and so that the slices of the routes can be
 * merged into it with the default shallow merge of `StoreSlice`. A class-based state would
 * need its own `toJSON`/`fromJSON`, or the serializer of `ClassPersistor`, and the
 * `mergeServerState` option of `createStore`.
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

  /** The slice of the `/users` route: loaded by its `getServerSideProps`, merged by `StoreSlice`. */
  readonly users: readonly User[];

  /** The slice of the `/users/[id]` route. `null` until the user opens one. */
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
