import type { Item, User } from './state';

/** A fake API: the items a real app would get from a database or a service. */
export async function fetchItems(): Promise<Item[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [
    { id: 1, text: 'Render on the server' },
    { id: 2, text: 'Hydrate on the client' },
    { id: 3, text: 'Dispatch actions' },
  ];
}

/**
 * The users, for the `/users` routes. This array lives in the server process (`next start`),
 * in place of a database, for the demo: `getServerSideProps` and the API route read and change
 * it, and a rename is visible to every later request, until the server restarts. It never
 * reaches the browser: only `getServerSideProps` and the API route import this module.
 *
 * It's kept on `globalThis` because Next.js bundles this module separately into each page and
 * API route, so a module-level array would exist once per bundle, and a rename made by the API
 * route would not be seen by the pages (a real app would have a database here, of course).
 */
declare global {
  // eslint-disable-next-line no-var
  var __kissExampleUsers: User[] | undefined;
}

const users: User[] = (globalThis.__kissExampleUsers ??= [
  { id: 1, name: 'Ann', updatedAt: '2026-01-01T10:00:00.000Z' },
  { id: 2, name: 'Bob', updatedAt: '2026-01-02T10:00:00.000Z' },
  { id: 3, name: 'Cid', updatedAt: '2026-01-03T10:00:00.000Z' },
]);

export async function fetchUsers(): Promise<User[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return users.map((user) => ({ ...user }));
}

export async function fetchUser(id: number): Promise<User | null> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const user = users.find((u) => u.id === id);
  return user === undefined ? null : { ...user };
}

/** Renames a user, and stamps `updatedAt` with now. Returns the user, or null if there is none. */
export async function updateUserName(id: number, name: string): Promise<User | null> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return null;
  users[index] = { ...users[index], name, updatedAt: new Date().toISOString() };
  return { ...users[index] };
}

/** What the `/api/users/[id]/rename` route answers. The Kiss action `RenameUser` reads it. */
export type RenameResponse = { ok: true; user: User } | { ok: false; error: string };
