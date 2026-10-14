import { useSelect } from 'kiss-for-react';
import type { GetServerSideProps } from 'next';
import { loadInitialState } from '@/src/server-state';
import type { State } from '@/src/state';

/**
 * Every page loads the state on the server, so that any of them can be the first page the user
 * opens. When the user navigates here from the home page, Next.js still calls this (and sends
 * the result as `pageProps`), but `pages/_app.tsx` keeps the store it already has.
 */
export const getServerSideProps: GetServerSideProps<{ initialState: State }> = async () => {
  return { props: { initialState: await loadInitialState() } };
};

/**
 * A second page, to show that the store survives client-side navigation: the clicks made on
 * the home page are still here, since the store lives in `pages/_app.tsx`, which stays mounted.
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
