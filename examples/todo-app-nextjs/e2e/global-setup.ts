import { promises as fs } from 'node:fs';
import { todosFile } from '../playwright.config';

/** Deletes the server's test file, so that the run starts from the seed. */
export default async function globalSetup(): Promise<void> {
  await fs.rm(todosFile, { force: true });
}
