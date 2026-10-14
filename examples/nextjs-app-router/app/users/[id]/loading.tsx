/**
 * The fallback Next.js shows while the user page loads. With it, the route is inside a Suspense
 * boundary: on a full load, the server streams the layout first and the route later, and the
 * route's `StoreSlice` hydrates against its own merged state when its chunk arrives. On a
 * client-side navigation, this shows while the route's data is fetched.
 */
export default function LoadingUser() {
  return <p data-testid="loading-user">Loading user…</p>;
}
