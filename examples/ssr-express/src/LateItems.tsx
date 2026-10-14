import { useSelect } from 'kiss-for-react';
import type { State } from './state';

/**
 * A component that is loaded lazily (see `App.tsx`), to show streaming: the server sends the
 * shell of the page first, with the Suspense fallback, and this content later, in the same
 * response, when the lazy import resolves. It reads the store with a hook, like any other
 * component: on the server it renders the `serverState`, and on the client it hydrates with
 * the `serverState` too, when the boundary hydrates, and then follows the live store.
 */
export default function LateItems() {
  const count = useSelect((s: State) => s.items.length);
  return (
    <p>
      Streamed after the shell: <span data-testid="late-items">{count}</span> items.
    </p>
  );
}
