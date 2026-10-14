'use server';
import { revalidatePath } from 'next/cache';
import { TodoList, type TodoJson } from '@/src/business/TodoList';
import { readTodosFile, withTodosFileLock, writeTodosFile } from '@/src/infra/todosFile';

/**
 * The API of the app: Next.js server actions, which the Kiss actions (`src/business/`) call
 * from their reducers like any async function (Next.js turns the call into a request). The
 * todos live on the server, in a JSON file (`src/infra/todosFile.ts`); every change comes
 * through here.
 *
 * Each action reads the file into a `TodoList` (the same class the client uses), applies a
 * method of the class, writes the list back, and revalidates `/`, so that the open page gets a
 * fresh `StoreSlice` (with a new `version` as its key) in the response of the action. It
 * returns the server's list, which the Kiss action puts in the state.
 *
 * They never throw: in production, Next.js replaces an error thrown by a server action with a
 * generic message, so that the server's internals don't leak to the client. So failures are
 * returned as a value, and the Kiss action turns `{ ok: false }` into a `UserException`.
 *
 * The items are identified by their text, which is unique in this app (see `TodoList.addTodo`).
 */
export type TodosResult = { ok: true; todos: TodoJson[] } | { ok: false; error: string };

export async function addTodo(text: string): Promise<TodosResult> {
  return change((todos) => {
    if (text.trim() === '') return 'The todo text is empty.';
    const added = todos.addTodoFromText(text);
    if (added === todos) return 'This todo already exists.';
    return added;
  });
}

export async function toggleTodo(text: string): Promise<TodosResult> {
  return change((todos) => {
    const item = todos.findByText(text);
    return item === undefined ? 'This todo no longer exists.' : todos.toggleTodo(item);
  });
}

export async function removeTodo(text: string): Promise<TodosResult> {
  return change((todos) => {
    const item = todos.findByText(text);
    return item === undefined ? 'This todo no longer exists.' : todos.removeTodo(item);
  });
}

export async function removeCompletedTodos(): Promise<TodosResult> {
  return change((todos) => todos.removeCompletedTodos());
}

/**
 * Reads the file, applies the change (a new list, or an error message), writes the new list
 * and revalidates the page. Under the file lock, so that concurrent actions don't lose changes.
 */
async function change(apply: (todos: TodoList) => TodoList | string): Promise<TodosResult> {
  return withTodosFileLock(async () => {
    const file = await readTodosFile();
    const result = apply(TodoList.fromJson(file.todos));
    if (typeof result === 'string') return { ok: false, error: result };
    const written = await writeTodosFile(result.toJson());
    revalidatePath('/');
    return { ok: true, todos: written.todos };
  });
}
