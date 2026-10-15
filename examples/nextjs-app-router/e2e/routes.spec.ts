import { expect, test, type Page } from '@playwright/test';

// End-to-end checks of the routes that load their own data on the server and merge it into the
// store with `StoreSlice` (`/users` and `/users/[id]`), and of the rename through a server
// action. Against the production build (see playwright.config.ts). What they prove is in the
// "Server-side rendering" section of the README at the repository root.
//
// The users live in memory, in the server process, and the tests of this file run in order, in
// one worker: the rename test puts the data back as it found it.

/** Collects the console errors and warnings, and the uncaught errors, of the page. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

/** Renames the user of the open user page, and waits for the page to show the result. */
async function rename(page: Page, name: string): Promise<void> {
  await page.getByTestId('rename-input').fill(name);
  await page.getByTestId('rename-button').click();
}

test('With JavaScript disabled, the HTML of a route already has its server-loaded slice', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto('/users');
  await expect(page.getByTestId('users').locator('a')).toHaveText(['Ann', 'Bob', 'Cid']);
  await expect(page.getByTestId('clicks')).toHaveText('0');

  // The route streams inside a Suspense boundary (it has a loading.tsx), and without JavaScript
  // the streamed part can't replace the fallback, but the HTML the server sent has the user.
  await page.goto('/users/2');
  await expect(page.getByTestId('user-name')).toHaveText('Bob');

  await context.close();
});

test('Client-side navigation merges each route\'s slice before its first render, and keeps the client state', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
  await page.getByTestId('increment').click();
  await page.getByTestId('increment').click();
  await expect(page.getByTestId('clicks')).toHaveText('2');

  // To the list: its slice is in the store, and the clicks (client state) are kept.
  await page.getByTestId('to-users').click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByTestId('users').locator('a')).toHaveText(['Ann', 'Bob', 'Cid']);
  await expect(page.getByTestId('clicks')).toHaveText('2');

  // To a user.
  await page.getByTestId('user-link-2').click();
  await expect(page).toHaveURL(/\/users\/2$/);
  await expect(page.getByTestId('user-name')).toHaveText('Bob');
  await expect(page.getByTestId('clicks')).toHaveText('2');

  // To another user, recording every name the page shows on the way: the first render of the
  // route must already show Cid, with no empty frame (`user` null) and no stale one (Bob after
  // Cid). The element is replaced when the route changes, so the observer watches the body.
  await page.getByTestId('back-to-users').click();
  await expect(page).toHaveURL(/\/users$/);
  await page.evaluate(() => {
    const w = window as unknown as { __names: (string | null)[] };
    const read = () => document.querySelector('[data-testid="user-name"]')?.textContent ?? null;
    w.__names = [read()];
    new MutationObserver(() => {
      const name = read();
      if (name !== w.__names[w.__names.length - 1]) w.__names.push(name);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByTestId('user-link-3').click();
  await expect(page).toHaveURL(/\/users\/3$/);
  await expect(page.getByTestId('user-name')).toHaveText('Cid');
  await expect(page.getByTestId('clicks')).toHaveText('2');
  const names = await page.evaluate(() => (window as unknown as { __names: (string | null)[] }).__names);
  const shown = names.filter((name) => name !== null); // Null: no user page (the list, or the loading fallback).
  expect(shown).not.toContain('');
  expect(shown).not.toContain('No user');
  expect(shown).not.toContain('Bob');
  expect(shown.slice(shown.indexOf('Cid'))).toEqual(['Cid']);

  // Back through the history (/users/3 → /users → /users/2 → /users): each route merges its
  // own slice again. The store had Cid; the user page of Bob shows Bob.
  await page.goBack();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByTestId('users').locator('a')).toHaveText(['Ann', 'Bob', 'Cid']);
  await page.goBack();
  await expect(page).toHaveURL(/\/users\/2$/);
  await expect(page.getByTestId('user-name')).toHaveText('Bob');
  await expect(page.getByTestId('clicks')).toHaveText('2');
  await page.goBack();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByTestId('users').locator('a')).toHaveText(['Ann', 'Bob', 'Cid']);
  await expect(page.getByTestId('clicks')).toHaveText('2');

  expect(errors).toEqual([]);
});

test('A rename goes through a Kiss action that calls a server action, and the refreshed route shows it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/users/2');
  await expect(page.getByTestId('user-name')).toHaveText('Bob');

  // The Kiss action awaits the server action; the server action changes the data and
  // revalidates the routes, so the open page refreshes with a new slice.
  await rename(page, 'Robert');
  await expect(page.getByTestId('user-name')).toHaveText('Robert');
  await expect(page.getByTestId('rename-button')).toHaveText('Rename');

  // The list, loaded again on the server, has the new name; so does the user page.
  await page.getByTestId('to-users').click();
  await expect(page.getByTestId('users').locator('a')).toHaveText(['Ann', 'Robert', 'Cid']);
  await page.getByTestId('user-link-2').click();
  await expect(page.getByTestId('user-name')).toHaveText('Robert');

  // A full reload: the server data changed.
  await page.goto('/users/2');
  await expect(page.getByTestId('user-name')).toHaveText('Robert');

  // The failure path: the server action returns a failure value, which the Kiss action turns
  // into a UserException, shown with useIsFailed and useExceptionFor.
  await rename(page, 'fail');
  await expect(page.getByTestId('rename-error')).toHaveText('The server refused this name.');
  await expect(page.getByTestId('user-name')).toHaveText('Robert');

  // Put the shared data back, for the other tests.
  await rename(page, 'Bob');
  await expect(page.getByTestId('user-name')).toHaveText('Bob');

  expect(errors).toEqual([]);
});

test('The persisted clicks and a route\'s slice coexist after a reload, with no mismatch', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/users/2');
  await expect(page.getByTestId('user-name')).toHaveText('Bob');
  await page.getByTestId('increment').click();
  await expect(page.getByTestId('clicks')).toHaveText('1');

  // The server renders 0 clicks and the user; the persistor restores 1 click, possibly before
  // hydration; the slice is merged into the restored state too. Hydration matches the HTML,
  // and then the page shows both.
  await page.reload();
  await expect(page.getByTestId('user-name')).toHaveText('Bob');
  await expect(page.getByTestId('clicks')).toHaveText('1');

  expect(errors).toEqual([]);
});
