import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Nothing special is needed for Kiss. The package has a `react-server` export condition, so
  // server components get its server entry (store and actions, no hooks), and its hooks and
  // provider are marked `'use client'`.

  // Only because this example lives inside the Kiss repository, which has its own lockfile:
  // without this, Next.js warns that it found several lockfiles.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
