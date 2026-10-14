import { KissAction, UserException } from 'kiss-for-react';
import { fetchItems, type RenameResponse } from './api';
import type { Item, State } from './state';

// This module is imported by `getServerSideProps` (through `server-state.ts`) and by the pages.
// In the pages router there are no React Server Components: `kiss-for-react` resolves to its
// normal entry on both sides, so the same actions run on the server and on the client.

export abstract class Action extends KissAction<State> {}

/** Loads the items from the API. The server dispatches it before rendering. */
export class LoadItems extends Action {
  async reduce() {
    const items = await fetchItems();
    return (state: State) => ({ ...state, items, loadedAt: new Date().toISOString() });
  }
}

export class Increment extends Action {
  reduce() {
    return { ...this.state, clicks: this.state.clicks + 1 };
  }
}

/** Adds an item, after a delay that simulates the API. The text "fail" makes it fail. */
export class AddItem extends Action {
  constructor(readonly text: string) {
    super();
  }

  async reduce() {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const text = this.text.trim();
    if (text.toLowerCase() === 'fail') throw new UserException('The server refused this item.');
    const item: Item = { id: Date.now(), text };
    return (state: State) => ({ ...state, items: [...state.items, item] });
  }
}

/** Dispatched by `useStoreEffect` when the page mounts on the client, after hydration. */
export class MarkHydrated extends Action {
  reduce() {
    return { ...this.state, hydrated: true };
  }
}

/**
 * Renames a user, through the API route `pages/api/users/[id]/rename.ts`. In the pages router
 * there are no server actions, so the mutation is an API route, and the action calls it with
 * `fetch`, like any API. Kiss's status hooks (`useIsWaiting`, `useIsFailed`, `useExceptionFor`)
 * and error handling sit on top of it: the route answers a refused name as `{ ok: false, error }`,
 * which becomes a `UserException` here, and the page shows it.
 *
 * It's only dispatched on the client (the relative URL needs the browser). The reducer updates
 * both the open user and the list, so that both routes show the new name right away; the next
 * visit of either route also brings it fresh from the server, in its slice.
 */
export class RenameUser extends Action {
  constructor(readonly id: number, readonly name: string) {
    super();
  }

  async reduce() {
    const response = await fetch(`/api/users/${this.id}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.name }),
    });
    const result: RenameResponse = await response.json();
    if (!result.ok) throw new UserException(result.error);
    const user = result.user;
    return (state: State) => ({
      ...state,
      user,
      users: state.users.map((u) => (u.id === user.id ? user : u)),
    });
  }
}
