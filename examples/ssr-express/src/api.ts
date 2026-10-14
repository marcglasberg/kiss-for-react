import type { Item } from './state';

/** A fake API: the items a real app would get from a database or a service. */
export async function fetchItems(): Promise<Item[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [
    { id: 1, text: 'Render on the server' },
    { id: 2, text: 'Hydrate on the client' },
    { id: 3, text: 'Dispatch actions' },
  ];
}
