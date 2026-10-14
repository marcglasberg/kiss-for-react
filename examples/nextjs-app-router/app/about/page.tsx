'use client';
import { useSelect } from 'kiss-for-react';
import type { State } from '@/src/state';

/**
 * A second page, to show that the store survives client-side navigation: the clicks made on
 * the home page are still here, since the store lives in the root layout, which stays mounted.
 */
export default function AboutPage() {
  const clicks = useSelect((s: State) => s.clicks);
  const hydrated = useSelect((s: State) => s.hydrated);
  const itemCount = useSelect((s: State) => s.items.length);
  return (
    <main>
      <h1>About</h1>
      <p>
        The same store, after navigating: <strong data-testid="clicks">{clicks}</strong> clicks,{' '}
        <span data-testid="item-count">{itemCount}</span> items, hydrated:{' '}
        <span data-testid="hydrated">{hydrated ? 'yes' : 'no'}</span>.
      </p>
    </main>
  );
}
