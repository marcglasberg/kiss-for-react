import { StoreSlice } from 'kiss-for-react';
import { TodoApp } from '@/src/ui/TodoApp';
import { readTodosFile } from '@/src/infra/todosFile';

// The todos are read from the server's file on every request, not at build time.
export const dynamic = 'force-dynamic';

/**
 * The todo page is a server component: it reads the todos from the server's file, and gives
 * them to the store with `StoreSlice`, which merges them before `TodoApp` (the client
 * component with the UI) renders: on the server, so the HTML already lists them; while
 * hydrating, against the same merged state, so there is no mismatch; and on client-side
 * navigation (back from `/stats`), so the first render already shows them.
 *
 * `kiss-for-react` resolves to its server entry here, which exports `StoreSlice` as a client
 * reference. The slice is a plain object (a prop that crosses the server/client boundary);
 * `createAppStore`'s `mergeServerState` option (`src/infra/store.ts`) rebuilds the `TodoList`.
 *
 * The key is the file's version. A slice is merged once per mount, so the key decides when
 * it's merged again: after a server action (which writes a new version and calls
 * `revalidatePath('/')`), the refreshed page comes with the new version, and the fresh list
 * is merged again. With a constant key, a refresh with new data would be ignored.
 */
export default async function TodoPage() {
  const { version, todos } = await readTodosFile();
  return (
    <StoreSlice state={{ todos }} key={version}>
      <TodoApp />
    </StoreSlice>
  );
}
