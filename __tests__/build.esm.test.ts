import { execSync, spawnSync } from 'child_process';
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

/** The code without its comments, which mention things like `window` and `'use client'` in examples. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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

test('The react-server condition resolves Kiss to its server entry without evaluating React', () => {
  const esm = spawnSync(process.execPath, ['--conditions=react-server', '--input-type=module', '-e',
    "console.log(import.meta.resolve('kiss-for-react'))"], { cwd: root, encoding: 'utf8' });
  const cjs = spawnSync(process.execPath, ['--conditions=react-server', '-e',
    "console.log(require.resolve('kiss-for-react'))"], { cwd: root, encoding: 'utf8' });
  expect(esm.status).toBe(0);
  expect(cjs.status).toBe(0);
  expect(esm.stdout.trim().replace(/\\/g, '/')).toMatch(/\/lib\/esm\/server\.mjs$/);
  expect(cjs.stdout.trim().replace(/\\/g, '/')).toMatch(/\/lib\/cjs\/server\.js$/);
});

test('The react-server condition gives the server entry, without the hooks, in ESM and CJS', () => {
  // As a React Server Components bundler resolves the package for server components.
  for (const file of ['server-smoke.mjs', 'server-smoke.cjs']) {
    const result = spawnSync(process.execPath, ['--conditions=react-server', path.join(smokeDir, file)],
      { cwd: root, encoding: 'utf8' });
    const reactVersion = jest.requireActual<{ version: string }>('react/package.json').version;
    if (reactVersion.startsWith('18.')) {
      // Stable React 18 rejects its own experimental entry, before Kiss can load.
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('This entry point is not yet supported outside of experimental channels');
    } else {
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('function:undefined:undefined:2');
    }
  }
});

test('The "kiss-for-react/server" subpath loads the server entry, in ESM and CJS', () => {
  const esm = run(
    `node --input-type=module -e "const m = await import('kiss-for-react/server'); ` +
    `console.log(typeof m.createStore, typeof m.KissAction, typeof m.useSelect, typeof m.StoreProvider)"`,
  );
  // The provider is there (a component the bundler turns into a client reference); no hook is.
  expect(esm.trim()).toBe('function function undefined function');
  const cjs = run(`node -e "const m = require('kiss-for-react/server'); console.log(typeof m.createStore, typeof m.useSelect)"`);
  expect(cjs.trim()).toBe('function undefined');
});

test('The hooks and the provider modules keep the "use client" directive, in both builds', () => {
  for (const file of ['esm/Hooks.mjs', 'esm/StoreProvider.mjs', 'cjs/Hooks.js', 'cjs/StoreProvider.js']) {
    const code = fs.readFileSync(path.join(root, 'lib', file), 'utf8');
    // The directive must be in the prologue: only "use strict" may come before it.
    const prologue = code.split(/\r?\n/).slice(0, 2).map((line) => line.trim());
    expect({ file, hasDirective: prologue.includes(`'use client';`) || prologue.includes(`"use client";`) })
      .toEqual({ file, hasDirective: true });
  }
  // The other modules are not client-only (the directive is only mentioned in comments).
  for (const file of ['esm/index.mjs', 'esm/server.mjs', 'esm/Store.mjs', 'esm/KissAction.mjs']) {
    expect(withoutComments(fs.readFileSync(path.join(root, 'lib', file), 'utf8'))).not.toMatch(/use client/);
  }
});

test('The server entry does not import react, except through the "use client" modules, which a bundler does not evaluate on the server', () => {
  const seen = new Set<string>();
  const clientModules = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = withoutComments(fs.readFileSync(file, 'utf8'));
    // A "use client" module becomes client references in the server graph: its imports don't run there.
    if (/^\s*'use client';/.test(code)) {
      clientModules.add(path.basename(file));
      return;
    }
    for (const match of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      if (spec.startsWith('.')) visit(path.resolve(path.dirname(file), spec));
      else expect({ file: path.relative(root, file), imports: spec }).toEqual({ file: path.relative(root, file), imports: 'none' });
    }
  };
  visit(path.join(root, 'lib', 'esm', 'server.mjs'));
  expect(seen.size).toBeGreaterThan(5);
  expect([...clientModules]).toEqual(['StoreProvider.mjs']);
  expect([...seen].some((f) => /Hooks\.mjs$/.test(f))).toBe(false);
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
