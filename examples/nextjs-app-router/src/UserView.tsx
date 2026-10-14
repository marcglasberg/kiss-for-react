'use client';
import { useDispatch, useExceptionFor, useIsFailed, useIsWaiting, useSelect } from 'kiss-for-react';
import Link from 'next/link';
import { useState } from 'react';
import { Increment, RenameUser } from './actions';
import type { State } from './state';

/**
 * The content of the `/users/[id]` route. The user comes from the store, where the route's
 * server component merged it with `StoreSlice`, so it's already there in the first render (on
 * the server, while hydrating, and on client-side navigation). The rename goes through the Kiss
 * action `RenameUser`, which calls a server action, so the usual status hooks apply.
 */
export function UserView() {
  const user = useSelect((s: State) => s.user);
  const clicks = useSelect((s: State) => s.clicks);
  const isRenaming = useIsWaiting(RenameUser);
  const renameFailed = useIsFailed(RenameUser);
  const renameError = useExceptionFor(RenameUser);
  const dispatch = useDispatch();
  const [name, setName] = useState('');

  if (user === null) return <main><h1 data-testid="user-name">No user</h1></main>;

  return (
    <main>
      <h1 data-testid="user-name">{user.name}</h1>
      <p>
        Id {user.id}, updated at <code data-testid="updated-at">{user.updatedAt}</code>
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          dispatch(new RenameUser(user.id, name));
          setName('');
        }}
      >
        <input
          data-testid="rename-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder='New name ("fail" fails)'
        />
        <button type="submit" data-testid="rename-button" disabled={isRenaming}>
          {isRenaming ? 'Renaming…' : 'Rename'}
        </button>
        {renameFailed && <p data-testid="rename-error" style={{ color: 'crimson' }}>{renameError?.message}</p>}
      </form>

      <p>
        Clicks: <strong data-testid="clicks">{clicks}</strong>{' '}
        <button data-testid="increment" onClick={() => dispatch(new Increment())}>+1</button>
      </p>

      <p>
        <Link href="/users" data-testid="back-to-users">Back to the users</Link>
      </p>
    </main>
  );
}
