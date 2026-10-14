import { StoreProvider } from 'kiss-for-react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import type { State } from '@/src/state';
import { createAppStore } from '@/src/store';

/**
 * The props every page gets from its `getServerSideProps`: the whole `initialState`, for a
 * full load, and, for the pages that load their own data, a `slice` the page merges into the
 * store with `StoreSlice` (see `pages/users/index.tsx`).
 */
type PageProps = { initialState: State; slice?: object };

/**
 * The custom App wraps every page, and stays mounted when the user navigates between pages. So
 * it's where the store is created, and where the nav lives. In the pages router there are no
 * React Server Components: this component, like the pages, is rendered on the server and then
 * hydrated on the client, and `kiss-for-react` resolves to its normal entry on both sides
 * (the `'use client'` directive is irrelevant here).
 *
 * The store is created once, with `useState`, from the `initialState` the first page got in
 * its `getServerSideProps`. It survives re-renders and client-side navigation: later
 * navigations bring new `pageProps` (each page has its own `getServerSideProps`), but the store
 * is not re-created from them, since it already holds the live state the user changed. A page
 * that has its own server data merges it into the store with `StoreSlice`, instead. When
 * this component is server-rendered, it creates a store for that render, which is discarded
 * with it.
 *
 * `serverState` is the state the server HTML was rendered from. React needs to render exactly
 * that while hydrating, and the client store may already differ: the persistor may have
 * restored the clicks before hydration. With `serverState`, the hooks render it while
 * hydrating, and then catch up with the live store. Hydration happens only once, on the first
 * page load, so `serverState` is also kept in `useState` from the first `pageProps`: the
 * `initialState` of a later navigation is not what the HTML was rendered from. A page's
 * `StoreSlice` provides this state plus its slice to its own subtree, so a full load of a page
 * with a slice hydrates correctly too.
 */
export default function App({ Component, pageProps }: AppProps<PageProps>) {
  const [serverState] = useState(() => pageProps.initialState);
  const [store] = useState(() => createAppStore(serverState));
  return (
    <>
      <Head>
        <title>Kiss + Next.js pages router</title>
      </Head>
      <div style={{ fontFamily: 'sans-serif', maxWidth: 640, margin: '2rem auto' }}>
        <StoreProvider store={store} serverState={serverState}>
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <Link href="/">Home</Link>
            <Link href="/about" data-testid="to-about">About</Link>
            <Link href="/users" data-testid="to-users">Users</Link>
          </nav>
          <Component {...pageProps} />
        </StoreProvider>
      </div>
    </>
  );
}
