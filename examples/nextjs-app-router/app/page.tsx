'use client';
import {
  useDispatch,
  useExceptionFor,
  useIsFailed,
  useIsStoreReady,
  useIsWaiting,
  useObject,
  useSelect,
  useStoreEffect,
} from 'kiss-for-react';
import { useState } from 'react';
import { AddItem, Increment, MarkHydrated } from '@/src/actions';
import type { State } from '@/src/state';

/**
 * The home page is a client component, since it uses the hooks. On the server, the hooks
 * render the `serverState` of the provider; the status hooks render "nothing in progress".
 */
export default function HomePage() {
  const loadedAt = useSelect((s: State) => s.loadedAt);
  const items = useObject((s: State) => s.items);
  const clicks = useSelect((s: State) => s.clicks);
  const hydrated = useSelect((s: State) => s.hydrated);
  const isReady = useIsStoreReady();
  const isAdding = useIsWaiting(AddItem);
  const addFailed = useIsFailed(AddItem);
  const addError = useExceptionFor(AddItem);
  const dispatch = useDispatch();
  const [text, setText] = useState('');

  // Runs on the client only, after hydration (and after the store is ready).
  useStoreEffect({ onMount: (store) => store.dispatch(new MarkHydrated()) });

  return (
    <main>
      <h1>Kiss + Next.js app router</h1>
      <p>
        Items loaded on the server at <code data-testid="loaded-at">{loadedAt}</code>
      </p>
      <ul data-testid="items">
        {items.map((item) => <li key={item.id}>{item.text}</li>)}
      </ul>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          dispatch(new AddItem(text));
          setText('');
        }}
      >
        <input
          data-testid="new-item"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder='New item ("fail" fails)'
        />
        <button type="submit" data-testid="add-item" disabled={isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </button>
        {addFailed && <p data-testid="add-error" style={{ color: 'crimson' }}>{addError?.message}</p>}
      </form>

      <p>
        Clicks: <strong data-testid="clicks">{clicks}</strong>{' '}
        <button data-testid="increment" onClick={() => dispatch(new Increment())}>+1</button>
        <br />
        <small>The clicks are kept in localStorage, and survive a reload. The items come from the server.</small>
      </p>

      <p>
        Hydrated: <span data-testid="hydrated">{hydrated ? 'yes' : 'no'}</span>
        {' · '}
        Store ready: <span data-testid="ready">{isReady ? 'yes' : 'no'}</span>
      </p>
    </main>
  );
}
