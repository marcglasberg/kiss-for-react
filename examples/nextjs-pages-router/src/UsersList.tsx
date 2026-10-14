import { useObject, useSelect } from 'kiss-for-react';
import Link from 'next/link';
import type { State } from './state';

/**
 * The content of the `/users` route. It reads the users from the store: the page merged the
 * slice its `getServerSideProps` loaded (see `pages/users/index.tsx`) before this renders, on
 * the server and on the client. It also shows the clicks, which are client state: navigating
 * between routes keeps them, since the store lives in `pages/_app.tsx`.
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
        <small>(client state, kept across routes)</small>
      </p>
    </main>
  );
}
