// Bundles the app with esbuild: the client for the browser, and the server for Node. A script
// instead of two command lines, since the quoting of `--define` differs between shells.
import { build } from 'esbuild';

// The browser bundle. `hydrateRoot` runs in it, so it includes React, React DOM and Kiss. The
// server sends it with `bootstrapScripts: ['/client.js']` (see `src/server.tsx`), which adds a
// classic `<script async src="/client.js">` to the HTML, so the format is IIFE, not ESM.
//
// React chooses its development or production build by `process.env.NODE_ENV`, which doesn't
// exist in the browser, so it must be defined here. The development build is used, since it
// reports hydration mismatches, and other problems, in the console, which the end-to-end tests
// check (`e2e/ssr.spec.ts`). A real app would use "production", and `minify: true`.
await build({
  entryPoints: ['src/client.tsx'],
  outfile: 'dist/public/client.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'info',
});

// The server bundle. The packages (React, Express, Kiss) stay external: Node loads them from
// node_modules, like any Node app. Only the app's own files are bundled, so that the TSX runs
// without a loader.
await build({
  entryPoints: ['src/server.tsx'],
  outfile: 'dist/server.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  packages: 'external',
  logLevel: 'info',
});
