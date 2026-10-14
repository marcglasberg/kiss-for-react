import Link from 'next/link';
import type { ReactNode } from 'react';
import { KissProvider } from '@/src/KissProvider';
import { loadInitialState } from '@/src/server-state';

// The items are loaded on every request, not at build time.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Kiss + Next.js app router' };

/**
 * The root layout is a server component: it loads the state on the server, and gives it to the
 * client `KissProvider`. Since the layout stays mounted when the user navigates between pages,
 * the store is created once, and survives the navigation.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialState = await loadInitialState();
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', maxWidth: 640, margin: '2rem auto' }}>
        <KissProvider initialState={initialState}>
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <Link href="/">Home</Link>
            <Link href="/about" data-testid="to-about">About</Link>
            <Link href="/users" data-testid="to-users">Users</Link>
          </nav>
          {children}
        </KissProvider>
      </body>
    </html>
  );
}
