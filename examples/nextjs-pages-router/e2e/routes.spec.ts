import { expect, test, type Page } from '@playwright/test';

// End-to-end checks of the routes that load their own data on the server (`getServerSideProps`)
// and merge it into the store with `StoreSlice`, against the production build (see
// playwright.config.ts). The users are kept in memory by the server process, and these tests
// run in order in one worker, so a test that changes a user puts it back at the end.

/** Collects the console errors and warnings, and the uncaught errors, of the page. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

declare global {
  interface Window {
    __names?: string[];
  }
}

test('With JavaScript disabled, the HTML of a route already has its server-loaded slice', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto('/users');
  await expect(page.getByTestId('users').locator('a')).toHaveText(['Ann', 'Bob', 'Cid']);

  await page.goto('/users/2');
  await expect(page.getByTestId('user-name')).toHaveText('Bob');
  await expect(page.getByTestId('clicks')).toHaveText('0');

  await context.close();
});

test("Client-side navigation merges each route's slice before its first render, and keeps the client state", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('hydrated')).toHaveText('yes');

  // Client state, made on the home page.
  await page.getByTestId('increment').click();
  await page.getByTestId('increment').click();
  await expect(page.getByTestId('clicks')).toHaveText('2');

  // The list route: its slice (the users) shows, and the clicks are kept.
  await page.getByTestId('to-users').click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByTestId('users').locator('a')).toHaveCount(3);
  await expect(page.getByTestId('clicks')).toHaveText('2');

  // The user route: its slice (the user) shows, and the clicks are still kept.
  await page.getByTestId('user-link-2').click();
  await expect(page).toHaveURL(/\/users\/2$/);
  await expect(page.getByTestId('user-name')).toHaveText('Bob');
  await expect(page.getByTestId('clicks')).toHaveText('2');

  // Another user, directly from this one: the same page component, with new params, so this is
  // the key of the StoreSlice at work. The observer records every text the name shows: it must
  // go straight from Bob to Cid (no empty frame, no frame with Bob after the slice changed).
  await page.evaluate(() => {
    const names: string[] = (window.__names = []);
    const record = () => {
      const element = document.querySelector('[data-testid="user-name"]');
      if (element === null) return;
      const text = element.textContent ?? '';
      if (names[names.length - 1] !== text) names.push(text);
    };
    record();
    new MutationObserver(record).observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.getByTestId('other-user-3').click();
  await expect(page).toHaveURL(/\/users\/3$/);
  await expect(page.getByTestId('user-name')).toHaveText('Cid');
  await expect(page.getByTestId('clicks')).toHaveText('2');
  const names = await page.evaluate(() => window.__names ?? []);
  expect(names).not.toContain('');
  const cidAt = names.indexOf('Cid');
  expect(cidAt).toBeGreaterThanOrEqual(0);
  expect(names.slice(cidAt)).toEqual(['Cid']);
  expect(names).toEqual(['Bob', 'Cid']);

  // Back: again the same page component with new params. The key changes back, so the slice
  // of the previous user is merged again (getServerSideProps runs again, with fresh data).
  await page.goBack();
  await expect(page).toHaveURL(/\/users\/2$/);
  await expect(page.getByTestId('user-name')).toHaveText('Bob');
  await page.goBack();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByTestId('users').locator('a')).toHaveCount(3);
  await expect(page.getByTestId('clicks')).toHaveText('2');

  expect(errors).toEqual([]);
});

test('A rename goes through a Kiss action that calls the API route, and the route shows it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/users/2');
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
  await expect(page.getByTestId('user-name')).toHaveText('Bob');

  // The action updates the store from the API route's answer.
  await page.getByTestId('rename-input').fill('Robert');
  await page.getByTestId('rename-button').click();
  await expect(page.getByTestId('user-name')).toHaveText('Robert');
  await expect(page.getByTestId('rename-button')).toHaveText('Rename');

  // The list shows it: the action updated it in the store, and the route's slice is fresh too.
  await page.getByTestId('to-users').click();
  await expect(page.getByTestId('user-link-2')).toHaveText('Robert');
  await page.getByTestId('user-link-2').click();
  await expect(page.getByTestId('user-name')).toHaveText('Robert');

  // A full load: the server has the new name.
  await page.goto('/users/2');
  await expect(page.getByTestId('user-name')).toHaveText('Robert');
  await expect(page.getByTestId('hydrated')).toHaveText('yes');

  // The failure path: the route refuses the name, and the action fails with its message.
  await page.getByTestId('rename-input').fill('fail');
  await page.getByTestId('rename-button').click();
  await expect(page.getByTestId('rename-error')).toHaveText('The server refused this name.');
  await expect(page.getByTestId('user-name')).toHaveText('Robert');

  // Put the user back, for the other tests (the users live in the server process).
  await page.getByTestId('rename-input').fill('Bob');
  await page.getByTestId('rename-button').click();
  await expect(page.getByTestId('user-name')).toHaveText('Bob');
  await expect(page.getByTestId('rename-error')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("The persisted clicks and a route's slice coexist after a reload, with no mismatch", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/users/2');
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
  await page.getByTestId('increment').click();
  await expect(page.getByTestId('clicks')).toHaveText('1');

  // The server renders 0 clicks and the user Bob. The client store restores the clicks from
  // localStorage, possibly before hydration: the route hydrates against the server state plus
  // its slice (Bob, 0 clicks), matching the HTML, and then shows the restored clicks. The slice
  // is merged again into the persisted state when it arrives, so Bob is not lost either.
  await page.reload();
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
  await expect(page.getByTestId('user-name')).toHaveText('Bob');
  await expect(page.getByTestId('clicks')).toHaveText('1');

  expect(errors).toEqual([]);
});
