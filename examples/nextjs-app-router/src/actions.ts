import { KissAction, UserException } from 'kiss-for-react';
import { renameUser } from '@/app/users/actions';
import { fetchItems } from './api';
import type { Item, State } from './state';

// This module is imported by server components (through `server-state.ts`) and by client
// components. In the server components, `kiss-for-react` resolves to its server entry (which has
// `KissAction`, `createStore` and the rest, but no hooks), so the same actions run on both sides.

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

/**
 * Renames a user, through the Next.js server action `renameUser` (`app/users/actions.ts`).
 * Client code may import a `'use server'` function and call it like any async function, so a
 * Kiss action's reducer calls it like it would call an API. This gives Kiss's status hooks
 * (`useIsWaiting`, `useIsFailed`, `useExceptionFor`), retries and error handling on top of
 * server actions, with no fetch code. The server action returns failures as a value (see why
 * there), and this turns them into a `UserException`, like `AddItem` does.
 *
 * On success, the store gets the renamed user. The server action also revalidates the user
 * routes, so the open page refreshes with a new slice, which agrees with this change.
 */
export class RenameUser extends Action {
  constructor(readonly id: number, readonly name: string) {
    super();
  }

  async reduce() {
    const result = await renameUser(this.id, this.name);
    if (!result.ok) throw new UserException(result.error);
    const user = result.user;
    return (state: State) => ({
      ...state,
      user,
      users: state.users.map((u) => (u.id === user.id ? user : u)),
    });
  }
}

/** Dispatched by `useStoreEffect` when the page mounts on the client, after hydration. */
export class MarkHydrated extends Action {
  reduce() {
    return { ...this.state, hydrated: true };
  }
}
