import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Nothing special is needed for Kiss. The pages router has no React Server Components: the
  // whole app is client code that is also rendered on the server, so `kiss-for-react` resolves
  // to its normal entry (store, actions and hooks) everywhere.
  reactStrictMode: true,

  // The package is installed from the repository root, which has its own lockfile. This silences
  // the "multiple lockfiles" warning of Next.js.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
