import {
  useDispatch,
  useExceptionFor,
  useIsFailed,
  useIsWaiting,
  useObject,
  useSelect,
  useStoreEffect,
} from 'kiss-for-react';
import Link from 'next/link';
import { useState } from 'react';
import { Increment, MarkHydrated, RenameUser } from './actions';
import type { State } from './state';

/**
 * The content of the `/users/[id]` route. It reads the user from the store, where the page
 * merged the slice of its `getServerSideProps` (see `pages/users/[id].tsx`). The rename goes
 * through the Kiss action `RenameUser`, which calls the API route; the status hooks show the
 * progress and the error, like the home page does with `AddItem`.
 */
export function UserView() {
  const user = useSelect((s: State) => s.user);
  const clicks = useSelect((s: State) => s.clicks);
  // The other users, from the slice of the `/users` route, which the store keeps across
  // navigation (so this is empty on a full load of this page, before the list was visited).
  const others = useObject((s: State) => s.users.filter((u) => u.id !== user?.id));
  const hydrated = useSelect((s: State) => s.hydrated);
  const isRenaming = useIsWaiting(RenameUser);
  const renameFailed = useIsFailed(RenameUser);
  const renameError = useExceptionFor(RenameUser);
  const dispatch = useDispatch();
  const [name, setName] = useState('');

  // Runs on the client only, after hydration. The tests wait for it before clicking.
  useStoreEffect({ onMount: (store) => store.dispatch(new MarkHydrated()) });

  return (
    <main>
      <h1 data-testid="user-name">{user === null ? 'No user' : user.name}</h1>
      {user !== null && (
        <p>
          Updated at <code data-testid="updated-at">{user.updatedAt}</code>
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (user !== null) dispatch(new RenameUser(user.id, name));
          setName('');
        }}
      >
        <input
          data-testid="rename-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder='New name ("fail" fails)'
        />
        <button type="submit" data-testid="rename-button" disabled={isRenaming || user === null}>
          {isRenaming ? 'Renaming…' : 'Rename'}
        </button>
        {renameFailed && (
          <p data-testid="rename-error" style={{ color: 'crimson' }}>{renameError?.message}</p>
        )}
      </form>

      <p>
        Clicks: <strong data-testid="clicks">{clicks}</strong>{' '}
        <button data-testid="increment" onClick={() => dispatch(new Increment())}>+1</button>
        {' · '}
        Hydrated: <span data-testid="hydrated">{hydrated ? 'yes' : 'no'}</span>
      </p>

      {others.length > 0 && (
        <p>
          Other users:{' '}
          {others.map((other) => (
            <Link key={other.id} href={`/users/${other.id}`} data-testid={`other-user-${other.id}`} style={{ marginRight: '0.5rem' }}>
              {other.name}
            </Link>
          ))}
        </p>
      )}

      <p>
        <Link href="/users" data-testid="back-to-users">Back to the users</Link>
      </p>
    </main>
  );
}
