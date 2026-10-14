import { Persistor } from 'kiss-for-react';
import type { State } from './state';

const KEY = 'kiss-ssr-express-clicks';

/**
 * Keeps the clicks in localStorage, so that they survive a reload. Only the clicks: the items
 * come from the server on every request, so `readState` puts the saved clicks into the state
 * the server sent.
 *
 * It's created on the client only (see `store.ts`): on the server there is no localStorage.
 * When it restores the clicks before the page hydrates, the hooks still render the
 * `serverState` while hydrating (see `client.tsx`), so there is no hydration mismatch, and
 * then the page shows the restored clicks.
 */
export class ClicksPersistor extends Persistor<State> {
  constructor(private readonly serverState: State) {
    super();
  }

  /** Saves right away. By default, a persistor waits a couple of seconds between saves. */
  get throttle(): number | null {
    return null;
  }

  async readState(): Promise<State | null> {
    const saved = window.localStorage.getItem(KEY);
    return saved === null ? null : { ...this.serverState, clicks: Number(saved) };
  }

  async deleteState(): Promise<void> {
    window.localStorage.removeItem(KEY);
  }

  async persistDifference(_lastPersistedState: State | null, newState: State): Promise<void> {
    window.localStorage.setItem(KEY, String(newState.clicks));
  }
}
