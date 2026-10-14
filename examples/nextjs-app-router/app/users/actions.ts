'use server';
import { revalidatePath } from 'next/cache';
import { updateUserName } from '@/src/api';
import type { User } from '@/src/state';

export type RenameUserResult = { ok: true; user: User } | { ok: false; error: string };

/**
 * A Next.js server action: a function that runs on the server, and that client code can import
 * and call like any async function (Next.js turns the call into a request). The Kiss action
 * `RenameUser` (`src/actions.ts`) calls it from its reducer, so the app has no fetch code.
 *
 * It never throws: in production, Next.js replaces an error thrown by a server action with a
 * generic message, so that the server's internals don't leak to the client. So failures are
 * returned as a value, and the Kiss action turns `{ ok: false }` into a `UserException`, which
 * the page shows with `useIsFailed` and `useExceptionFor`.
 *
 * After the change, `revalidatePath` refreshes the server components of the routes that show
 * the user. The user page, which is open, gets its new slice in the response of the action, and
 * its `StoreSlice` is rendered again with a new key (the key has `updatedAt`), so the slice is
 * merged again.
 */
export async function renameUser(id: number, name: string): Promise<RenameUserResult> {
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 'fail') return { ok: false, error: 'The server refused this name.' };
  const user = await updateUserName(id, trimmed);
  revalidatePath('/users');
  revalidatePath('/users/' + id);
  return { ok: true, user };
}
