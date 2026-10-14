import Link from 'next/link';
import type { ReactNode } from 'react';
import { KissProvider } from '@/src/infra/KissProvider';
import '@/src/ui/AppStyles.css';

export const metadata = { title: 'Todo App Example (Kiss + Next.js)' };

/**
 * The root layout is a server component. It renders the client `KissProvider`, which creates
 * the store (with the empty `State.initialState`: the todos come from each page's
 * `StoreSlice`). Since the layout stays mounted when the user navigates between pages, the
 * store is created once, and survives the navigation.
 *
 * `#dialog-root` is where the UserException dialog renders (see `src/infra/StoreParameters.tsx`).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>
        <KissProvider>
          <nav style={{ display: 'flex', gap: '1rem', justifyContent: 'center', padding: '12px 16px' }}>
            <Link href="/" data-testid="to-todos">Todos</Link>
            <Link href="/stats" data-testid="to-stats">Stats</Link>
          </nav>
          {children}
        </KissProvider>
        <div id="dialog-root" />
      </body>
    </html>
  );
}
