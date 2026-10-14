import { KissAction, UserException } from 'kiss-for-react';
import { fetchItems } from './api';
import type { Item, State } from './state';

// This module is bundled into the server (`server.tsx`) and into the client (`client.tsx`): the
// same actions run on both sides. The server only dispatches `LoadItems`, before rendering.

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
