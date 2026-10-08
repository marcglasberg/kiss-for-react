import { execSync } from 'child_process';
import * as path from 'path';

// Builds the package and checks that both published entry points load in plain Node.
// See BUGS.md, item 2.

const root = path.resolve(__dirname, '..');

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
