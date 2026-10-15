import { expect, test, type Page } from '@playwright/test';

// End-to-end checks of the server rendering and the hydration, against the production build
// (see playwright.config.ts). What they prove is in the "Server-side rendering" section of the
// README at the repository root.

/** Collects the console errors and warnings, and the uncaught errors, of the page. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

test('With JavaScript disabled, the HTML already shows the state the server rendered', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');

  await expect(page.getByTestId('items').locator('li')).toHaveText(['Render on the server', 'Hydrate on the client', 'Dispatch actions']);
  await expect(page.getByTestId('loaded-at')).toHaveText(/^\d{4}-\d{2}-\d{2}T/);
  await expect(page.getByTestId('clicks')).toHaveText('0');
  // On the server, the store is always rendered as ready, and the hydration effect never runs.
  await expect(page.getByTestId('ready')).toHaveText('yes');
  await expect(page.getByTestId('hydrated')).toHaveText('no');

  await context.close();
});

test('The page hydrates without warnings, and then the store works: actions, status, and navigation', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');

  // Hydrated: the effect ran, and the store is ready (the persistor read localStorage).
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
  await expect(page.getByTestId('ready')).toHaveText('yes');

  // A sync action.
  for (let i = 0; i < 3; i++) await page.getByTestId('increment').click();
  await expect(page.getByTestId('clicks')).toHaveText('3');

  // An async action, with its waiting status.
  await page.getByTestId('new-item').fill('Ship it');
  await page.getByTestId('add-item').click();
  await expect(page.getByTestId('add-item')).toHaveText('Adding…');
  await expect(page.getByTestId('items').locator('li')).toHaveCount(4);
  await expect(page.getByTestId('items').locator('li').last()).toHaveText('Ship it');
  await expect(page.getByTestId('add-item')).toHaveText('Add');

  // A failed action, with its error.
  await page.getByTestId('new-item').fill('fail');
  await page.getByTestId('add-item').click();
  await expect(page.getByTestId('add-error')).toHaveText('The server refused this item.');
  await expect(page.getByTestId('items').locator('li')).toHaveCount(4);

  // Client-side navigation keeps the store: the clicks, the items and the hydration flag.
  await page.getByTestId('to-about').click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByTestId('clicks')).toHaveText('3');
  await expect(page.getByTestId('item-count')).toHaveText('4');
  await expect(page.getByTestId('hydrated')).toHaveText('yes');

  expect(errors).toEqual([]);
});

test('The state the persistor restored before hydration does not cause a mismatch, and shows after it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
  await page.getByTestId('increment').click();
  await page.getByTestId('increment').click();
  await expect(page.getByTestId('clicks')).toHaveText('2');

  // The server renders 0 clicks (it doesn't know the browser's localStorage). The client store
  // restores 2 from localStorage, possibly before hydration. Hydration renders the serverState
  // (0), matching the HTML, and then the page catches up with the store (2).
  await page.reload();
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
  await expect(page.getByTestId('clicks')).toHaveText('2');

  expect(errors).toEqual([]);
});
