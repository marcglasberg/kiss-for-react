import { StoreSlice } from 'kiss-for-react';
import type { GetServerSideProps } from 'next';
import { fetchUser } from '@/src/api';
import { loadInitialState } from '@/src/server-state';
import type { State, User } from '@/src/state';
import { UserView } from '@/src/UserView';

type Props = {
  /** For a full load of this page: `pages/_app.tsx` creates the store from it. */
  initialState: State;
  /** The data of this route, merged into the store by `StoreSlice`. */
  slice: { user: User };
};

/** Loads the user of the route on the server. See `pages/users/index.tsx` for the two props. */
export const getServerSideProps: GetServerSideProps<Props, { id: string }> = async ({ params }) => {
  const user = await fetchUser(Number(params?.id));
  if (user === null) return { notFound: true };
  return { props: { initialState: await loadInitialState(), slice: { user } } };
};

/**
 * The `key` of the `StoreSlice`: the slice is merged once per mount, and this page component
 * stays mounted when the route only changes its params (navigating back from `/users/3` to
 * `/users/2` re-renders it with new `pageProps`). So the key is new whenever the route's data
 * changes (the id, or the user's `updatedAt` after a rename), which remounts the slice, and
 * merges the new data. Navigating to the page, back or forward, always re-runs
 * `getServerSideProps`, so the slice brings fresh data.
 */
export default function UserPage({ slice }: Props) {
  return (
    <StoreSlice state={slice} key={`${slice.user.id}:${slice.user.updatedAt}`}>
      <UserView />
    </StoreSlice>
  );
}
