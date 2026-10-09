// The ESLint config of the demo files. It turns on ALL the rules of the Kiss plugin: the
// recommended ones with their severities, and the opt-in ones as warnings. With type information.
//
// It uses the BUILT plugin, so first run `npm run build` in the `eslint-plugin` directory
// (and again after you change the plugin).
import { existsSync } from 'fs';
import tseslint from 'typescript-eslint';

const pluginPath = new URL('../../lib/index.js', import.meta.url);
if (!existsSync(pluginPath)) {
  throw new Error('The Kiss ESLint plugin is not built. Run `npm run build` in the `eslint-plugin` directory.');
}
const { default: kiss } = await import(pluginPath.href);

// The naming rules (opt-in) report every action, so they're only on in `naming.ts`.
const namingRules = [
  'action-name-ends-with-action',
  'action-name-ends-with-underscore-action',
  'action-name-without-action',
  'action-file-name-ends-with-action',
  'action-file-name-starts-with-action',
].map((name) => `kiss-for-react/${name}`);

// The other opt-in rules are not in the recommended config, so they're added here as warnings.
const allRules = { ...kiss.configs.recommended.rules };
for (const name of Object.keys(kiss.rules)) {
  const rule = `kiss-for-react/${name}`;
  if (!namingRules.includes(rule)) allRules[rule] ??= 'warn';
}

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'kiss-for-react': kiss },
    rules: allRules,
    linterOptions: {
      // Each file hides its rules with `eslint-disable` comments at the top. This shows a
      // warning when one of them is not needed anymore.
      reportUnusedDisableDirectives: 'warn',
    },
  },
  {
    files: ['naming.ts'],
    rules: Object.fromEntries(namingRules.map((rule) => [rule, 'warn'])),
  },
];
