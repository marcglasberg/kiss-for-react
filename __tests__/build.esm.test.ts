import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Builds the package and checks that both published entry points load in plain Node, and that
// the hooks work from the built artifacts (not only from the sources). See BUGS.md, item 2, and
// STATE_REFACTOR.md, I09. The packed artifact is checked by `scripts/pack-smoke.cjs`.

const root = path.resolve(__dirname, '..');
const smokeDir = path.join('__tests__', 'fixtures', 'built-package');

function run(cmd: string): string {
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
}

beforeAll(() => {
  run('npm run build');
}, 120000);

test('The ESM build loads with Node native ESM, through the package "import" condition', () => {
  const out = run(
    `node --input-type=module -e "const m = await import('kiss-for-react'); ` +
    `console.log(typeof m.createStore, typeof m.Store, typeof m.ClassPersistor)"`,
  );
  expect(out.trim()).toBe('function function function');
});

test('The ESM build creates a working store', () => {
  const out = run(
    `node --input-type=module -e "const { createStore } = await import('kiss-for-react'); ` +
    `const s = createStore({ initialState: 42 }); console.log(s.state)"`,
  );
  expect(out.trim()).toBe('42');
});

test('The CJS build loads through the package "require" condition', () => {
  const out = run(`node -e "console.log(typeof require('kiss-for-react').createStore)"`);
  expect(out.trim()).toBe('function');
});

test('The ESM build imports the selector helper as a bare package subpath, which Node resolves', () => {
  const hooks = fs.readFileSync(path.join(root, 'lib', 'esm', 'Hooks.mjs'), 'utf8');
  expect(hooks).toContain(`from 'use-sync-external-store/with-selector'`);
  const out = run(
    `node --input-type=module -e "const m = await import('use-sync-external-store/with-selector'); ` +
    `console.log(typeof m.useSyncExternalStoreWithSelector)"`,
  );
  expect(out.trim()).toBe('function');
});

test('The hooks render on the server from the ESM build', () => {
  const out = run(`node ${path.join(smokeDir, 'hooks-smoke.mjs')}`);
  expect(out.trim()).toBe('<p>2:2:false:false:none:true</p>');
});

test('The hooks render on the server from the CJS build', () => {
  const out = run(`node ${path.join(smokeDir, 'hooks-smoke.cjs')}`);
  expect(out.trim()).toBe('<p>2:2:false:false:none:true</p>');
});

test('The emitted declarations do not depend on the helper types', () => {
  // The helper is only used inside the hooks, so the published types must not reference it:
  // consumers don't install `@types/use-sync-external-store`.
  for (const dir of ['esm', 'cjs']) {
    const declarations = fs.readFileSync(path.join(root, 'lib', dir, 'types', 'Hooks.d.ts'), 'utf8');
    expect(declarations).not.toContain('use-sync-external-store');
  }
});

test('The core runtime does not import react-dom or browser-only modules', () => {
  for (const file of fs.readdirSync(path.join(root, 'lib', 'esm')).filter((f) => f.endsWith('.mjs'))) {
    // Without the comments, which mention `window.localStorage` in examples.
    const code = fs.readFileSync(path.join(root, 'lib', 'esm', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/from ['"]react-dom/);
    expect(code).not.toMatch(/\b(document|window|localStorage)\b\s*[.[]/);
  }
});
