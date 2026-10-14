export type Item = { readonly id: number; readonly text: string };

/**
 * The state of the app. It's a plain object, so that it travels from the server to the client
 * as JSON, in a `<script>` of the page (see `server.tsx` and `client.tsx`). A class-based state
 * would need its own `toJSON`/`fromJSON`, or the serializer of `ClassPersistor`.
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
};

export const emptyState: State = { items: [], loadedAt: '', clicks: 0, hydrated: false };
