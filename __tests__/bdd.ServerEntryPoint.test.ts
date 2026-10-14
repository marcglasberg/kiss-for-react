import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import * as fs from 'fs';
import * as path from 'path';
import * as main from '../src';
import * as server from '../src/server';

// The package has two entry points: `src/index.ts`, and `src/server.ts` for the `react-server`
// export condition and the `kiss-for-react/server` subpath (see package.json). The server entry
// is for React Server Components, which can't use React's context or hooks. The React Server
// Components environment itself is checked in `bdd.ReactServerComponents.test.ts`.

reporter(new FeatureFileReporter());

const feature = new Feature('The server entry point of the package');

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

/** The runtime exports of the main entry that only work in client components: the hooks. */
function clientOnlyExports(): string[] {
  return Object.keys(main).filter((name) => /^use[A-Z]/.test(name));
}

Bdd(feature)
  .scenario('The server entry exports everything of the main entry, except the hooks.')
  .given('The main entry of the package, and its server entry.')
  .when('Their runtime exports are compared.')
  .then('The server entry has every export of the main entry that is not a hook, including the StoreProvider and StoreSlice components.')
  .and('The server entry has no hook.')
  .run(async (_) => {
    const clientOnly = clientOnlyExports();
    expect(clientOnly).toContain('useSelect');
    expect(clientOnly).toContain('useDispatch');

    const expected = Object.keys(main).filter((name) => !clientOnly.includes(name)).sort();
    expect(Object.keys(server).sort()).toEqual(expected);
    expect(expected).toContain('createStore');
    expect(expected).toContain('KissAction');
    expect(expected).toContain('ClassPersistor');
    expect(expected).toContain('StoreProvider');
    expect(expected).toContain('StoreSlice');
    expect(expected).toContain('MergeServerStateAction');
    for (const name of clientOnly) expect(name in server).toBe(false);
  });

Bdd(feature)
  .scenario('Only the modules of the hooks and the provider use React, and they are marked "use client".')
  .given('The source files of the package.')
  .when('Their imports and first lines are checked.')
  .then('Hooks.tsx and StoreProvider.tsx start with the "use client" directive.')
  .and('No other source file imports react, so the server entry does not load React at all.')
  .run(async (_) => {
    const clientFiles = ['src/Hooks.tsx', 'src/StoreProvider.tsx'];
    for (const file of clientFiles) expect(read(file).split(/\r?\n/)[0]).toBe(`'use client';`);

    const sources = fs.readdirSync(path.join(root, 'src')).filter((f) => /\.tsx?$/.test(f)).map((f) => `src/${f}`);
    expect(sources).toContain('src/server.ts');
    for (const file of sources.filter((f) => !clientFiles.includes(f))) {
      expect({ file, importsReact: /from ['"]react['"]/.test(read(file)) }).toEqual({ file, importsReact: false });
    }
    expect(read('src/server.ts')).not.toMatch(/from ['"]\.\/Hooks['"]/);
  });

Bdd(feature)
  .scenario('The package exports map gives the server entry to React Server Components, and as a subpath.')
  .given('The package.json of the package.')
  .when('Its exports map is read.')
  .then('The "react-server" condition of the main entry points to the server build, in ESM and CJS, with its types.')
  .and('The "./server" subpath points to the same files.')
  .and('The default main entry still points to the full build.')
  .run(async (_) => {
    const pkg = JSON.parse(read('package.json'));
    const serverEntry = {
      import: { types: './lib/esm/types/server.d.ts', default: './lib/esm/server.mjs' },
      require: { types: './lib/cjs/types/server.d.ts', default: './lib/cjs/server.js' },
    };
    expect(pkg.exports['.']['react-server']).toEqual(serverEntry);
    expect(pkg.exports['./server']).toEqual(serverEntry);
    expect(pkg.exports['.'].import.default).toBe('./lib/esm/index.mjs');
    expect(pkg.exports['.'].require.default).toBe('./lib/cjs/index.js');
    // The condition must come before the generic ones, since the first matching condition wins.
    expect(Object.keys(pkg.exports['.'])[0]).toBe('react-server');
  });
