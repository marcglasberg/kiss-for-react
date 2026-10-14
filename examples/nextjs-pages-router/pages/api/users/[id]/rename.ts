import type { NextApiRequest, NextApiResponse } from 'next';
import { updateUserName, type RenameResponse } from '@/src/api';

/**
 * The API route that renames a user: `POST /api/users/[id]/rename` with a JSON body
 * `{ name }`. In the pages router there are no server actions, so an API route is the API
 * layer that the Kiss action `RenameUser` (in `src/actions.ts`) calls.
 *
 * A refused name is answered as a value, `{ ok: false, error }`, which the action turns into a
 * `UserException`, instead of an HTTP error. The name "fail" is refused, to show the failure
 * path.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<RenameResponse>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  const id = Number(req.query.id);
  const name = String((req.body as { name?: unknown } | undefined)?.name ?? '').trim();

  if (name.toLowerCase() === 'fail') {
    res.status(200).json({ ok: false, error: 'The server refused this name.' });
    return;
  }

  const user = await updateUserName(id, name);
  if (user === null) {
    res.status(404).json({ ok: false, error: 'No such user.' });
    return;
  }

  res.status(200).json({ ok: true, user });
}
