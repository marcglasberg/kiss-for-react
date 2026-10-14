import { StoreSlice } from 'kiss-for-react';
import type { GetServerSideProps } from 'next';
import { fetchUsers } from '@/src/api';
import { loadInitialState } from '@/src/server-state';
import type { State, User } from '@/src/state';
import { UsersList } from '@/src/UsersList';

type Props = {
  /** For a full load of this page: `pages/_app.tsx` creates the store from it. */
  initialState: State;
  /** The data of this route, merged into the store by `StoreSlice`. */
  slice: { users: User[] };
};

/**
 * Loads this route's data on the server. Like every page, it returns `initialState`, so that
 * a full load of this page can create the store in `pages/_app.tsx` (and hydrate against it).
 * It also returns `slice`, the data of this route, which the page merges into the store with
 * `StoreSlice`: on a full load, the store is created from `initialState` and then gets the
 * slice; on client-side navigation, the store already exists and gets just the slice.
 */
export const getServerSideProps: GetServerSideProps<Props> = async () => {
  return { props: { initialState: await loadInitialState(), slice: { users: await fetchUsers() } } };
};

/**
 * The slice is merged into the store once, when the `StoreSlice` mounts, before `UsersList`
 * renders: the server HTML has the users, hydration matches, and on client-side navigation the
 * first render of the route already shows them. No `key` is needed: this page unmounts whenever
 * the user leaves it, and a new visit mounts it again, with fresh data from `getServerSideProps`.
 */
export default function UsersPage({ slice }: Props) {
  return (
    <StoreSlice state={slice}>
      <UsersList />
    </StoreSlice>
  );
}
