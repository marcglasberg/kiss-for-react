// Packs the package (`npm pack`, which builds it), installs the tarball in a minimal, isolated
// consumer project, and checks there that:
// - The declared runtime dependencies are installed with it (`use-sync-external-store`).
// - The ESM and CJS entry points load, and the hooks render on the server (`react-dom/server`).
// - The published types compile a component that uses the hooks, and reject invalid uses.
//
// Usage, from the repository root: `node scripts/pack-smoke.cjs [reactMajor]`.
// `reactMajor` is 18 or 19 (default: the major of the React installed in the repository).
// It needs network access, to install React in the consumer project. It never publishes.
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const reactMajor = process.argv[2] || require(path.join(root, 'node_modules', 'react', 'package.json')).version.split('.')[0];

function run(cmd, cwd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-pack-smoke-'));
console.log(`Working directory: ${work}`);

// 1) Pack (runs `prepack`, which builds `lib`).
run(`npm pack --pack-destination "${work}"`, root);
const tarballName = fs.readdirSync(work).find((f) => /^kiss-for-react-.*\.tgz$/.test(f));
if (tarballName === undefined) throw new Error(`No tarball was packed into ${work}`);
const tarball = path.join(work, tarballName);

// 2) A consumer project that depends only on the tarball and on React.
const consumer = path.join(work, 'consumer');
fs.mkdirSync(consumer);
fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
  name: 'kiss-pack-smoke-consumer',
  private: true,
  version: '1.0.0',
  dependencies: {
    'kiss-for-react': `file:${tarball.replace(/\\/g, '/')}`,
    'react': `^${reactMajor}.0.0`,
    'react-dom': `^${reactMajor}.0.0`,
  },
  devDependencies: {
    'typescript': '~6.0.3',
    '@types/react': `^${reactMajor}.0.0`,
    '@types/react-dom': `^${reactMajor}.0.0`,
  },
}, null, 2));
run('npm install --no-audit --no-fund --loglevel=error', consumer);

// 3) The runtime dependency came with the package.
const helper = path.join(consumer, 'node_modules', 'use-sync-external-store', 'package.json');
if (!fs.existsSync(helper)) throw new Error('use-sync-external-store was not installed with the package.');
const installed = require(path.join(consumer, 'node_modules', 'kiss-for-react', 'package.json'));
if (!installed.dependencies || !installed.dependencies['use-sync-external-store'])
  throw new Error('The packed package.json does not declare use-sync-external-store as a dependency.');
if (fs.existsSync(path.join(consumer, 'node_modules', '@types', 'use-sync-external-store')))
  throw new Error('@types/use-sync-external-store must not be installed by the package.');

// 4) ESM and CJS smoke, from the built artifacts of the installed package.
const smokeSource = path.join(root, '__tests__', 'fixtures', 'built-package');
for (const file of ['hooks-smoke-shared.cjs', 'hooks-smoke.mjs', 'hooks-smoke.cjs', 'server-smoke.mjs', 'server-smoke.cjs'])
  fs.copyFileSync(path.join(smokeSource, file), path.join(consumer, file));
const expected = '<p>2:2:false:false:none:true</p>';
for (const file of ['hooks-smoke.mjs', 'hooks-smoke.cjs']) {
  const out = run(`node ${file}`, consumer).trim();
  if (out !== expected) throw new Error(`${file} printed ${JSON.stringify(out)}, expected ${JSON.stringify(expected)}`);
}

// 4b) Under the `react-server` condition (React Server Components), the package resolves to its
// server entry, which has no hooks and doesn't need React's client features.
const expectedServer = 'function:undefined:undefined:2';
for (const file of ['server-smoke.mjs', 'server-smoke.cjs']) {
  const out = run(`node --conditions=react-server ${file}`, consumer).trim();
  if (out !== expectedServer) throw new Error(`${file} printed ${JSON.stringify(out)}, expected ${JSON.stringify(expectedServer)}`);
}

// 5) The published types: valid uses compile, invalid ones don't.
fs.writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    strict: true, noEmit: true, jsx: 'react-jsx', module: 'ESNext', moduleResolution: 'bundler',
    // 'ESNext.Disposable' declares Symbol.dispose, which the store's types use (`await using`).
    // A consumer with skipLibCheck off needs it, or @types/node: the README says so.
    target: 'ES2022', lib: ['ES2022', 'DOM', 'ESNext.Disposable'], skipLibCheck: false, types: [],
  },
  files: ['consumer.tsx'],
}, null, 2));
fs.writeFileSync(path.join(consumer, 'consumer.tsx'), `
import { createStore, KissAction, StoreProvider, useIsWaiting, useObject, useSelect, useStoreEffect } from 'kiss-for-react';
import { createStore as createServerStore, KissAction as ServerAction } from 'kiss-for-react/server';

class Point { constructor(readonly x: number) {} }
type State = { readonly count: number; readonly point: Point; readonly items: readonly string[] };
class Increment extends KissAction<State> {
  reduce() { return { ...this.state, count: this.state.count + 1 }; }
}
const store = createStore<State>({ initialState: { count: 0, point: new Point(1), items: [] } });

export function View() {
  const count: number = useSelect((s: State) => s.count);
  const point: Point = useSelect((s: State) => s.point);
  const items: readonly string[] = useObject((s: State) => s.items);
  const pair: { count: number } = useObject((s: State) => ({ count: s.count }));
  const waiting: boolean = useIsWaiting(Increment);
  useStoreEffect({ onMount: (s) => s.dispatch(new Increment()) });
  // @ts-expect-error A class instance is not accepted by useObject.
  useObject((s: State) => s.point);
  return <p>{count}{point.x}{items.length}{pair.count}{String(waiting)}</p>;
}

export const app = <StoreProvider store={store} serverState={store.state}><View /></StoreProvider>;

// The server entry (for React Server Components) has the store and the actions, with the same types.
class ServerIncrement extends ServerAction<State> {
  reduce() { return { ...this.state, count: this.state.count + 1 }; }
}
export const serverStore = createServerStore<State>({ initialState: { count: 0, point: new Point(1), items: [] } });
serverStore.dispatch(new ServerIncrement());
`);
run('npx tsc -p tsconfig.json', consumer);

console.log(`\nPack smoke OK (React ${reactMajor}, tarball ${path.basename(tarball)}).`);
