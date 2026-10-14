import { StoreSlice } from 'kiss-for-react';
import { UsersList } from '@/src/UsersList';
import { fetchUsers } from '@/src/api';

// The users are loaded on every request, not at build time.
export const dynamic = 'force-dynamic';

/**
 * A route that loads its own data on the server. It's a server component, so `kiss-for-react`
 * resolves to its server entry, which exports `StoreSlice` as a client reference. The slice
 * (`{ users }`, a plain object, since it crosses the server/client boundary as a prop) is
 * merged into the store before `UsersList` renders: on the server, so the HTML shows the list;
 * while hydrating, against the same merged state; and on client-side navigation, so the first
 * render of the route already shows the list. The rest of the store (the clicks) is kept.
 */
export default async function UsersPage() {
  const users = await fetchUsers();
  return (
    <StoreSlice state={{ users }}>
      <UsersList />
    </StoreSlice>
  );
}
