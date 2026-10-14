import { expect, test, type Page } from '@playwright/test';

// End-to-end checks of the streamed server rendering and the hydration, against the bundles in
// `dist` (see playwright.config.ts). What they prove is in SSR.md, section 4.2, at the
// repository root.

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

  // The content of the Suspense boundary was streamed after the shell, and is in the document.
  // Without JavaScript, it stays in the hidden element the server put it in: the inline script
  // that moves it in place of the fallback doesn't run.
  await expect(page.getByTestId('late-items')).toBeAttached();
  await expect(page.getByTestId('late-items')).toHaveText('3');

  await context.close();
});

test('The page hydrates without warnings, and then the store works: actions, status, and navigation', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');

  // Hydrated: the effect ran, and the store is ready (the persistor read localStorage).
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
  await expect(page.getByTestId('ready')).toHaveText('yes');

  // The streamed Suspense content is in place (visible), and hydrated too.
  await expect(page.getByTestId('late-items')).toBeVisible();
  await expect(page.getByTestId('late-items')).toHaveText('3');
  await expect(page.getByTestId('late-items-fallback')).toHaveCount(0);

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
  await expect(page.getByTestId('late-items')).toHaveText('4');

  // A failed action, with its error.
  await page.getByTestId('new-item').fill('fail');
  await page.getByTestId('add-item').click();
  await expect(page.getByTestId('add-error')).toHaveText('The server refused this item.');
  await expect(page.getByTestId('items').locator('li')).toHaveCount(4);

  // There is no client-side router: the About link is a full page load, with a new store on
  // the server (0 clicks in its HTML) and a new one on the client, whose persistor restores
  // the clicks after hydration. The items are loaded again on the server, so there are 3.
  const aboutHtml = await (await page.request.get('/about')).text();
  expect(aboutHtml).toContain('data-testid="clicks">0<');
  await page.getByTestId('to-about').click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
  await expect(page.getByTestId('clicks')).toHaveText('3');
  await expect(page.getByTestId('item-count')).toHaveText('3');

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

test('The raw HTML of the response has the items, the streamed content, and the state as JSON', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');

  const html = await response.text();
  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('Render on the server');
  expect(html).toContain('Hydrate on the client');
  expect(html).toContain('Dispatch actions');

  // The shell comes first, with the fallback; the content of the boundary comes after it.
  const fallbackAt = html.indexOf('data-testid="late-items-fallback"');
  const lateItemsAt = html.indexOf('data-testid="late-items"');
  expect(fallbackAt).toBeGreaterThan(-1);
  expect(lateItemsAt).toBeGreaterThan(fallbackAt);

  // The state the client creates its store with, as JSON, in a script of the page.
  const match = html.match(/<script id="kiss-state" type="application\/json">(.*?)<\/script>/s);
  expect(match).not.toBeNull();
  const state = JSON.parse(match![1]);
  expect(state.items.map((item: { text: string }) => item.text)).toEqual(['Render on the server', 'Hydrate on the client', 'Dispatch actions']);
  expect(state.clicks).toBe(0);
  expect(state.hydrated).toBe(false);

  // The client bundle is loaded by a bootstrap script.
  expect(html).toContain('src="/client.js"');
});
