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
 * The users, for the `/users` routes. For the demo, this array lives in memory, in the server
 * process (only server components and the server action read and change it), where a real app
 * would have a database. A rename changes it for every request that follows, until the server
 * restarts.
 */
const users: User[] = [
  { id: 1, name: 'Ann', updatedAt: '2025-01-01T10:00:00.000Z' },
  { id: 2, name: 'Bob', updatedAt: '2025-01-02T10:00:00.000Z' },
  { id: 3, name: 'Cid', updatedAt: '2025-01-03T10:00:00.000Z' },
];

export async function fetchUsers(): Promise<User[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return users.map((user) => ({ ...user }));
}

/**
 * The user with that id, or null if there is none. It takes longer than the layout's load, so
 * that the user route streams after the shell: the server sends the layout's HTML first, and
 * the route's HTML (with its slice) in a later chunk, which is what its `loading.tsx` is for.
 */
export async function fetchUser(id: number): Promise<User | null> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const user = users.find((u) => u.id === id);
  return user === undefined ? null : { ...user };
}

/** Renames a user, and returns it, with `updatedAt` set to now. Throws if there is no such user. */
export async function updateUserName(id: number, name: string): Promise<User> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) throw new Error(`There is no user with id ${id}.`);
  const user: User = { ...users[index], name, updatedAt: new Date().toISOString() };
  users[index] = user;
  return { ...user };
}
