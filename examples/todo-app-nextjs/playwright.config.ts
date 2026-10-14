import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const port = 3104;

/**
 * The server's todos file during the tests: `data/todos.e2e.json`, not the app's own
 * `data/todos.json`. The server gets its name in `TODOS_FILE` (see `src/infra/todosFile.ts`),
 * and the tests read it at this absolute path. The global setup deletes it, so that every run
 * starts from the seed (`data/todos.seed.json`).
 */
const todosFileName = 'todos.e2e.json';
export const todosFile = path.resolve(__dirname, 'data', todosFileName);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${port}`,
  },
  // The production server. Run `npm run build` first (`npm test` does).
  webServer: {
    command: 'npm run start',
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, TODOS_FILE: todosFileName },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
