import { expect, test, type Browser, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { todosFile } from '../playwright.config';

// End-to-end checks of the server-backed todo app, against the production build (see
// playwright.config.ts): the server HTML, the hydration (no warning), the changes saved on the
// server (in `data/todos.e2e.json`, which the tests read with `fs`), the ClassPersistor keeping the
// client's filter, the dialog, and the store across client-side navigation.

/** The todos of the seed (`data/todos.seed.json`), which the server starts from. */
const seedTodos = ['Render on the server', 'Hydrate on the client', 'Dispatch actions'];

type TodoJson = { text: string; completed: boolean };

/** The todos the server has saved in its file. */
async function savedTodos(): Promise<TodoJson[]> {
  const file = JSON.parse(await fs.readFile(todosFile, 'utf8')) as { version: number; todos: TodoJson[] };
  return file.todos;
}

/** Collects the console errors and warnings, and the uncaught errors, of the page. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

/** Waits for the page to hydrate and for the store to be ready (the persistor read localStorage). */
async function waitForReady(page: Page): Promise<void> {
  await expect(page.getByTestId('ready')).toHaveText('yes');
}

/** The todo rows the list shows (with the current filter). */
function todoItems(page: Page) {
  return page.getByTestId('todo-list').getByTestId('todo-item');
}

/** The checkbox of the todo with that text. The tests click it (not `check()`: the toggle goes to the server, so the controlled checkbox changes later), and wait with `toBeChecked`. */
function checkboxOf(page: Page, text: string) {
  return todoItems(page).filter({ hasText: text }).getByRole('checkbox');
}

/** Types a todo and presses Enter, and waits for the input to be cleared (the action completed). */
async function addTodo(page: Page, text: string): Promise<void> {
  await page.getByTestId('todo-input').fill(text);
  await page.getByTestId('todo-input').press('Enter');
  await expect(page.getByTestId('todo-input')).toHaveValue('');
}

/** Opens the page with JavaScript disabled: what the test sees is the server HTML, as sent. */
async function openWithoutJavaScript(browser: Browser) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  return { context, page };
}

// The todos live on the server, so a test's changes would be seen by the next one. Each test
// starts from the seed: deleting the file makes the server create it from the seed again on
// the next request. (The global setup also deletes it, so a run never starts from a previous
// run's file.)
test.beforeEach(async () => {
  await fs.rm(todosFile, { force: true });
});

test('With JavaScript disabled, the HTML already lists the todos the server loaded', async ({ browser }) => {
  const { context, page } = await openWithoutJavaScript(browser);

  await expect(todoItems(page)).toHaveText(seedTodos);
  await expect(page.getByTestId('filter-button')).toHaveText('Showing ALL');
  // On the server, the store is always rendered as ready: the buttons are enabled, there is no
  // spinner. The "ready" line says "no", since the hydration never happens.
  await expect(page.getByTestId('add-button')).toBeEnabled();
  await expect(page.getByTestId('loading')).toHaveCount(0);
  await expect(page.getByTestId('ready')).toHaveText('no');

  // The server created its file from the seed.
  expect(await savedTodos()).toEqual(seedTodos.map((text) => ({ text, completed: false })));

  await context.close();
});

test('An added todo is saved on the server: the server HTML lists it after a full reload without JavaScript', async ({ page, browser }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForReady(page);

  // The add goes through the server action; the button shows a spinner meanwhile, and the
  // todo goes to the top of the list.
  await page.getByTestId('todo-input').fill('Ship it');
  await page.getByTestId('todo-input').press('Enter');
  await expect(page.getByTestId('add-button')).toBeDisabled();
  await expect(todoItems(page)).toHaveText(['Ship it', ...seedTodos]);
  await expect(page.getByTestId('todo-input')).toHaveValue('');
  await expect(page.getByTestId('add-button')).toBeEnabled();

  // The server's file has it (it would survive a server restart).
  expect(await savedTodos()).toEqual([
    { text: 'Ship it', completed: false },
    ...seedTodos.map((text) => ({ text, completed: false })),
  ]);

  // A full reload, in another browser context, with JavaScript disabled: the server HTML lists
  // it, so it came from the server, not from this browser's localStorage.
  const other = await openWithoutJavaScript(browser);
  await expect(todoItems(other.page)).toHaveText(['Ship it', ...seedTodos]);
  await other.context.close();

  expect(errors).toEqual([]);
});

test('Toggling a todo and removing the completed ones change the server list, which a reload shows', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForReady(page);

  // Toggle: the checkboxes are disabled while the server answers, then the todo is checked.
  await checkboxOf(page, 'Dispatch actions').click();
  await expect(checkboxOf(page, 'Dispatch actions')).toBeChecked();
  await expect(checkboxOf(page, 'Dispatch actions')).toBeEnabled();
  expect((await savedTodos()).find((todo) => todo.text === 'Dispatch actions')?.completed).toBe(true);

  // A reload shows the server's list: the todo is still completed.
  await page.reload();
  await waitForReady(page);
  await expect(checkboxOf(page, 'Dispatch actions')).toBeChecked();

  // Remove the completed todos.
  await page.getByTestId('remove-completed-button').click();
  await expect(todoItems(page)).toHaveText(['Render on the server', 'Hydrate on the client']);
  await expect(page.getByTestId('remove-completed-button')).toHaveText('Remove Completed Todos');
  expect((await savedTodos()).map((todo) => todo.text)).toEqual(['Render on the server', 'Hydrate on the client']);

  await page.reload();
  await waitForReady(page);
  await expect(todoItems(page)).toHaveText(['Render on the server', 'Hydrate on the client']);

  expect(errors).toEqual([]);
});

test('The filter is client state, restored by the persistor after a reload, while the todos are the server\'s', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForReady(page);

  // Complete one todo, and set the filter to COMPLETED: ALL -> ACTIVE -> COMPLETED.
  await checkboxOf(page, 'Hydrate on the client').click();
  await expect(checkboxOf(page, 'Hydrate on the client')).toBeChecked();
  await page.getByTestId('filter-button').click();
  await expect(page.getByTestId('filter-button')).toHaveText('Showing ACTIVE');
  await expect(todoItems(page)).toHaveText(['Render on the server', 'Dispatch actions']);
  await page.getByTestId('filter-button').click();
  await expect(page.getByTestId('filter-button')).toHaveText('Showing COMPLETED');
  await expect(todoItems(page)).toHaveText(['Hydrate on the client']);

  // The ClassPersistor throttles the saves (2 seconds by default): wait for the filter to be in
  // localStorage before reloading. The saved state has the classes under their `typeName`, not
  // under the minified class names of the production build.
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('state'))).toContain('Showing COMPLETED');
  const saved = (await page.evaluate(() => window.localStorage.getItem('state'))) ?? '';
  expect(saved).toContain('"State"');
  expect(saved).toContain('"TodoList"');
  expect(saved).toContain('"TodoItem"');

  // Meanwhile, the server's list changes behind this browser's back (another user, say): a
  // todo is added, completed, straight into the file.
  const file = JSON.parse(await fs.readFile(todosFile, 'utf8')) as { version: number; todos: TodoJson[] };
  file.todos.unshift({ text: 'Added on the server', completed: true });
  file.version += 1;
  await fs.writeFile(todosFile, JSON.stringify(file));

  // The server renders the page with its todos and the filter ALL (it doesn't know the
  // browser's localStorage). The client store restores the saved state (stale todos, filter
  // COMPLETED), possibly before hydration, and the page's slice (the server's todos) is merged
  // on top of it. Hydration renders the server state, matching the HTML, and then the page
  // shows the server's todos with the restored filter.
  await page.reload();
  await waitForReady(page);
  await expect(page.getByTestId('filter-button')).toHaveText('Showing COMPLETED');
  await expect(todoItems(page)).toHaveText(['Added on the server', 'Hydrate on the client']);
  await page.getByTestId('filter-button').click();
  await expect(page.getByTestId('filter-button')).toHaveText('Showing ALL');
  await expect(todoItems(page)).toHaveText(['Added on the server', ...seedTodos]);

  // The restored todos are class instances: toggling one calls `toggleCompleted` of a `TodoItem`.
  await checkboxOf(page, 'Added on the server').click();
  await expect(checkboxOf(page, 'Added on the server')).not.toBeChecked();
  expect((await savedTodos()).find((todo) => todo.text === 'Added on the server')?.completed).toBe(false);

  expect(errors).toEqual([]);
});

test('A duplicate todo shows the UserException dialog, without going to the server', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForReady(page);

  // Adding a todo that already exists: `AddTodoAction` throws a UserException before calling
  // the server action, which the store gives to `showUserException` (the MUI dialog), and
  // `useIsFailed`/`useExceptionFor` show the error text under the input.
  await page.getByTestId('todo-input').fill(seedTodos[0]);
  await page.getByTestId('todo-input').press('Enter');
  await expect(page.getByTestId('user-exception-dialog')).toContainText(`The item "${seedTodos[0]}" already exists.`);
  await expect(page.getByText(`Type something else other than "${seedTodos[0]}"`)).toBeVisible();
  await expect(todoItems(page)).toHaveText(seedTodos);
  await expect(page.getByTestId('todo-input')).toHaveValue(seedTodos[0]); // Not cleared: the action failed.

  // Close it. The server's list didn't change.
  await page.getByTestId('user-exception-ok').click();
  await expect(page.getByTestId('user-exception-dialog')).toHaveCount(0);
  expect((await savedTodos()).map((todo) => todo.text)).toEqual(seedTodos);

  expect(errors).toEqual([]);
});

test('A random todo (from the mocked DummyJSON API) is added and saved on the server', async ({ page }) => {
  const errors = collectErrors(page);
  // `AddRandomTodoAction` fetches a todo from dummyjson.com. The test answers that request
  // itself, so that it doesn't depend on the network.
  const text = 'Learn Kiss with Next.js';
  await page.route('https://dummyjson.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, todo: text, completed: false, userId: 1 }]),
    }));
  await page.goto('/');
  await waitForReady(page);

  // The button shows a spinner while the todo is fetched and saved.
  await page.getByTestId('add-random-button').click();
  await expect(page.getByTestId('add-random-button').getByRole('progressbar')).toBeVisible();
  await expect(todoItems(page)).toHaveText([text, ...seedTodos]);
  await expect(page.getByTestId('add-random-button')).toHaveText('Add Random Todo');
  expect((await savedTodos())[0]).toEqual({ text, completed: false });

  expect(errors).toEqual([]);
});

test('The store survives client-side navigation: the stats page counts the same todos', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForReady(page);
  await addTodo(page, 'First');
  await addTodo(page, 'Second');
  await expect(todoItems(page)).toHaveText(['Second', 'First', ...seedTodos]);
  await checkboxOf(page, 'Second').click();
  await expect(checkboxOf(page, 'Second')).toBeChecked();

  // The stats page counts the todos of the same store (with methods of the `TodoList` class).
  await page.getByTestId('to-stats').click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByTestId('total')).toHaveText('5');
  await expect(page.getByTestId('completed')).toHaveText('1');
  await expect(page.getByTestId('active')).toHaveText('4');

  // Back: the page's slice (the server's list, which agrees) is merged again, and the list is intact.
  await page.getByTestId('back-to-todos').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(todoItems(page)).toHaveText(['Second', 'First', ...seedTodos]);
  await expect(checkboxOf(page, 'Second')).toBeChecked();

  expect(errors).toEqual([]);
});
