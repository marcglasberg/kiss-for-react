// Validate the published plugin, with its actual runtime dependencies, against a supported ESLint.
// Usage: node scripts/plugin-pack-smoke.cjs 9.22.0 (or 10.13.0). Nothing is published.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const eslintVersion = process.argv[2] || '10.13.0';
if (!/^\d+\.\d+\.\d+$/.test(eslintVersion)) throw new Error('Use an explicit ESLint version.');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-plugin-pack-'));
// Windows distributions keep npm beside node; Unix distributions use a bin/npm symlink.
const npmCli = process.env.npm_execpath || (process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  : fs.realpathSync(path.join(path.dirname(process.execPath), 'npm')));
function npm(args, cwd) {
  execFileSync(process.execPath, [npmCli, ...args], { cwd, stdio: 'inherit' });
}
console.log(`Isolated plugin consumer: ${work}`);
npm(['pack', '--pack-destination', work], root);
npm(['pack', '--pack-destination', work], path.join(root, 'eslint-plugin'));
const library = fs.readdirSync(work).find(name => /^kiss-for-react-.*\.tgz$/.test(name));
const plugin = fs.readdirSync(work).find(name => /^eslint-plugin-kiss-for-react-.*\.tgz$/.test(name));
if (!library || !plugin) throw new Error('Both packed artifacts are required.');
fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({
  private: true, type: 'module', dependencies: {
    'kiss-for-react': `file:./${library}`, 'eslint-plugin-kiss-for-react': `file:./${plugin}`,
    eslint: eslintVersion, typescript: '6.0.3', '@typescript-eslint/parser': '^8.72.0',
    react: '^19.3.1', '@types/react': '^19.3.0',
  },
}, null, 2));
npm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], work);
fs.writeFileSync(path.join(work, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', skipLibCheck: true },
  include: ['*.ts'],
}));
for (const name of ['Load', 'LoadAction']) fs.writeFileSync(path.join(work, `${name}.ts`),
  `import { KissAction } from 'kiss-for-react'; class ${name} extends KissAction<number> { reduce() { return 1; } }`);
fs.writeFileSync(path.join(work, 'verify.mjs'), `
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import plugin from 'eslint-plugin-kiss-for-react';
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [{
  files: ['**/*.ts'], languageOptions: { parser, parserOptions: { project: './tsconfig.json', tsconfigRootDir: process.cwd() } },
  plugins: { 'kiss-for-react': plugin }, rules: { 'kiss-for-react/action-name-ends-with-action': 'error' },
}] });
const [invalid] = await eslint.lintFiles(['Load.ts']);
assert.equal(invalid.messages.length, 1, JSON.stringify(invalid.messages));
assert.equal(invalid.messages[0].ruleId, 'kiss-for-react/action-name-ends-with-action');
assert.ok(invalid.messages[0].suggestions?.length, 'The rename suggestion must remain available.');
const [valid] = await eslint.lintFiles(['LoadAction.ts']);
assert.deepEqual(valid.messages, []);
console.log('Packed plugin diagnostic and valid-code checks passed.');
`);
execFileSync(process.execPath, ['verify.mjs'], { cwd: work, stdio: 'inherit' });
console.log(`Plugin pack smoke OK (ESLint ${eslintVersion}, TypeScript 6.0.3).`);
