'use client';
import { useObject, useSelect } from 'kiss-for-react';
import Link from 'next/link';
import type { State } from './state';

/**
 * The content of the `/users` route. It reads the users from the store: the route's server
 * component merged them with `StoreSlice` before this rendered. The clicks come from the same
 * store: they are client state, kept across the routes.
 */
export function UsersList() {
  const users = useObject((s: State) => s.users);
  const clicks = useSelect((s: State) => s.clicks);
  return (
    <main>
      <h1>Users</h1>
      <ul data-testid="users">
        {users.map((user) => (
          <li key={user.id}>
            <Link href={`/users/${user.id}`} data-testid={`user-link-${user.id}`}>{user.name}</Link>
          </li>
        ))}
      </ul>
      <p>
        Clicks: <strong data-testid="clicks">{clicks}</strong>{' '}
        <small>(client state, kept while navigating between the routes)</small>
      </p>
    </main>
  );
}
