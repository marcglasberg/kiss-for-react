import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TodoJson } from '../business/TodoList';

// SERVER-ONLY CODE. This module uses `fs`, so it must only be imported by server components
// (`app/page.tsx`) and server actions (`app/actions.ts`), never by a client component or by
// the business actions. (With the `server-only` package installed, an `import 'server-only'`
// here would make such an import a build error.)

/**
 * The file that holds the todos on the server: a stand-in for a database, which survives
 * server restarts. `version` grows by one on every write, and the page uses it as the `key`
 * of its `StoreSlice`, so that a new version of the list is merged into the store again.
 */
export type TodosFile = { version: number; todos: TodoJson[] };

/**
 * `data/todos.json` by default, in the directory the server runs in. The tests set
 * `TODOS_FILE` to another file name (see playwright.config.ts), so that they don't touch the
 * app's own file. It's a name inside `data/`, not a path: Turbopack traces the files the
 * server code may read, and a path it can't scope statically to a folder would make it trace
 * (and deploy) the whole project, with a build warning.
 */
function todosFilePath(): string {
  return path.join(process.cwd(), 'data', process.env.TODOS_FILE ?? 'todos.json');
}

/** The committed seed, which the file is created from when it doesn't exist. */
function seedFilePath(): string {
  return path.resolve(process.cwd(), 'data/todos.seed.json');
}

/** Reads the file. If it doesn't exist yet, creates it from the seed, and returns the seed. */
export async function readTodosFile(): Promise<TodosFile> {
  try {
    return JSON.parse(await fs.readFile(todosFilePath(), 'utf8')) as TodosFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const seed = JSON.parse(await fs.readFile(seedFilePath(), 'utf8')) as TodosFile;
    const file: TodosFile = { version: seed.version ?? 1, todos: seed.todos };
    await writeAtomically(file);
    return file;
  }
}

/** Writes the todos, with the next version, and returns what it wrote. */
export async function writeTodosFile(todos: TodoJson[]): Promise<TodosFile> {
  const current = await readTodosFile();
  const file: TodosFile = { version: current.version + 1, todos };
  await writeAtomically(file);
  return file;
}

/**
 * Runs a read-modify-write of the file, one at a time in this process, so that two server
 * actions that arrive together don't lose each other's change. (A real database would do
 * this itself.)
 */
let queue: Promise<unknown> = Promise.resolve();
export function withTodosFileLock<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Writes to a temporary file, then renames it over the real one: a rename is atomic, so a
 * reader never sees a half-written file, and a crash during the write leaves the old file.
 */
async function writeAtomically(file: TodosFile): Promise<void> {
  const target = todosFilePath();
  const temp = target + '.tmp';
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(file, null, 2) + '\n', 'utf8');
  await fs.rename(temp, target);
}
