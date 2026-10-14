import { StoreSlice } from 'kiss-for-react';
import { notFound } from 'next/navigation';
import { UserView } from '@/src/UserView';
import { fetchUser } from '@/src/api';

// The user is loaded on every request, not at build time.
export const dynamic = 'force-dynamic';

/**
 * A route with a parameter, which loads one user on the server and merges it into the store
 * with `StoreSlice`, like `app/users/page.tsx` does with the list. Since this route has a
 * `loading.tsx`, it streams: the layout's HTML is sent first, and this route's HTML (with its
 * slice) follows, inside a Suspense boundary.
 */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await fetchUser(Number((await params).id));
  if (user === null) notFound();

  // A slice is merged once per mount, so the key decides when it's merged again: a new key
  // when the data changes. After a rename, the server action calls `revalidatePath`, and the
  // refreshed page comes with a new `updatedAt`, so this key changes, and the slice is merged
  // again. With the id alone, a refresh with new data for the same user would be ignored.
  return (
    <StoreSlice state={{ user }} key={`${user.id}:${user.updatedAt}`}>
      <UserView />
    </StoreSlice>
  );
}
