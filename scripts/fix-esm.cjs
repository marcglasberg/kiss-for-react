// Makes the ESM build in `lib/esm` loadable by Node native ESM, Vitest and webpack 5.
// TypeScript emits `.js` files with extensionless relative imports (`from './Persistor'`).
// Node ESM needs full paths, and since the package has no `"type": "module"`, the files
// must be `.mjs` to be treated as ESM. So this renames every `.js` file to `.mjs`, and
// rewrites each relative import to its full path (`./Persistor.mjs`, `./Esserializer/index.mjs`).
const fs = require('fs');
const path = require('path');

const esmDir = path.resolve(__dirname, '..', 'lib', 'esm');

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'types' ? [] : listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = listJsFiles(esmDir);
const fileSet = new Set(files);

function resolveSpecifier(fromFile, spec) {
  const target = path.resolve(path.dirname(fromFile), spec);
  if (fileSet.has(target + '.js')) return spec + '.mjs';
  if (fileSet.has(path.join(target, 'index.js'))) return spec.replace(/\/?$/, '/index.mjs');
  if (target.endsWith('.js') && fileSet.has(target)) return spec.replace(/\.js$/, '.mjs');
  throw new Error(`fix-esm: cannot resolve "${spec}" imported from ${fromFile}`);
}

// Matches: import/export ... from '<rel>', import '<rel>', and import('<rel>').
const importRegex = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}(?:\/[^'"]*)?)\2/g;

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const fixed = code.replace(importRegex, (_m, prefix, quote, spec) =>
    `${prefix}${quote}${resolveSpecifier(file, spec)}${quote}`);
  fs.writeFileSync(file.replace(/\.js$/, '.mjs'), fixed);
  fs.unlinkSync(file);
}
