import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { ESLint, Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import plugin from '../src/index';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: demo files');

// The demo files, in `eslint-plugin/testing/demo`, show all the rules of the plugin. Each warning
// is marked with a comment block right above the line it underlines:
//
//   // kiss-for-react/rule-name
//   // (What the problem is.)
//   // Fix (automatic): Will ...
//   // Fix (suggestion): Will ...
//
// The rules are hidden by `/* eslint-disable kiss-for-react/rule-name */` lines at the top of
// the file. These tests remove those lines, lint the files, and check that the marks and the
// warnings match.

const demoDir = path.resolve(__dirname, '../testing/demo');

const demoFiles = fs.readdirSync(demoDir)
  .filter((file) => /\.tsx?$/.test(file))
  .sort();

const NAMING_RULES = [
  'action-name-ends-with-action',
  'action-name-ends-with-underscore-action',
  'action-name-without-action',
  'action-file-name-ends-with-action',
  'action-file-name-starts-with-action',
].map((name) => `kiss-for-react/${name}`);

// The same as `testing/demo/eslint.config.mjs`, but with the plugin's source, instead of the built plugin.
function createEslint(): ESLint {
  const allRules: Linter.RulesRecord = {...(plugin.configs.recommended.rules as Linter.RulesRecord)};
  for (const name of Object.keys(plugin.rules)) {
    const rule = `kiss-for-react/${name}`;
    if (!NAMING_RULES.includes(rule)) allRules[rule] ??= 'warn';
  }
  return new ESLint({
    cwd: demoDir,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
          parser: tsParser as Linter.Parser,
          parserOptions: {projectService: true, tsconfigRootDir: demoDir},
        },
        plugins: {'kiss-for-react': plugin as any},
        rules: allRules,
        linterOptions: {reportUnusedDisableDirectives: 'warn'},
      },
      {
        files: ['naming.ts'],
        rules: Object.fromEntries(NAMING_RULES.map((rule) => [rule, 'warn'])),
      },
    ],
  });
}

let eslint: ESLint | undefined;
const getEslint = () => eslint ??= createEslint();

const DISABLE_LINE = /^\/\* eslint-disable (kiss-for-react\/[a-z-]+) \*\/\r?$/;
const MARK_LINE = /^\s*\/\/ (kiss-for-react\/[a-z-]+)\s*$/;

interface Mark {
  rule: string;
  /** The line it marks (1-based): the first line of code after the comment block. */
  line: number;
  automaticFixes: number;
  suggestions: number;
}

/** The marks of the code, and the rules they mark. */
function marksOf(code: string): Mark[] {
  const lines = code.split('\n');
  const marks: Mark[] = [];
  let pending: Mark[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const mark = MARK_LINE.exec(line);
    if (mark) {
      pending.push({rule: mark[1], line: -1, automaticFixes: 0, suggestions: 0});
    } else if (trimmed.startsWith('//')) {
      const current = pending[pending.length - 1];
      if (current && trimmed.startsWith('// Fix (automatic):')) current.automaticFixes++;
      if (current && trimmed.startsWith('// Fix (suggestion):')) current.suggestions++;
    } else if (trimmed === '') {
      // A blank line ends the marks: they must be right above the code they mark.
      if (pending.length > 0) throw new Error(`Line ${index + 1}: a blank line after a mark.`);
    } else {
      for (const mark of pending) marks.push({...mark, line: index + 1});
      pending = [];
    }
  });
  return marks;
}

/** The rules disabled at the top of the file, and the code without those lines. */
function disabledRulesOf(code: string): string[] {
  return code.split('\n').map((line) => DISABLE_LINE.exec(line)?.[1]).filter((rule): rule is string => !!rule);
}

function withoutDisableLines(code: string): string {
  return code.split('\n').filter((line) => !DISABLE_LINE.test(line)).join('\n');
}

async function lintDemo(file: string, code: string) {
  const [result] = await getEslint().lintText(code, {filePath: path.join(demoDir, file)});
  return result.messages;
}

// One example for each demo file.
const withDemoFiles = (builder: any) => demoFiles.reduce((b, file) => b.example(val('File', file)), builder);

withDemoFiles(Bdd(feature)
  .scenario('Each demo file shows its rules, each warning marked right above the line it underlines.')
  .given('The demo file {File}.')
  .when('Its eslint-disable lines are removed, and it is linted with all the rules.')
  .then('Each mark has a warning of its rule, on the line below it.')
  .and('Each warning is marked.')
  .and('The marks say which quick fixes there are: automatic, and suggestions.')
  .and('The eslint-disable lines at the top are exactly the rules the file shows.')
  .and('With the eslint-disable lines, the file has no warnings at all.'))
  .run(async (ctx: any) => {
    const file = ctx.example.val('File') as string;
    const original = fs.readFileSync(path.join(demoDir, file), 'utf8');

    // The file, without its eslint-disable lines.
    const code = withoutDisableLines(original);
    const marks = marksOf(code);
    const messages = await lintDemo(file, code);

    const problems: string[] = [];
    const describe = (message: Linter.LintMessage) => `line ${message.line}: ${message.ruleId}: ${message.message}`;

    for (const message of messages) {
      if (message.fatal || !message.ruleId?.startsWith('kiss-for-react/')) {
        problems.push(`Not a Kiss warning: ${describe(message)}`);
      }
    }

    // Each mark has its warning, with the same quick fixes.
    const used = new Set<Linter.LintMessage>();
    for (const mark of marks) {
      const message = messages.find((m) => !used.has(m) && m.ruleId === mark.rule && m.line === mark.line);
      if (!message) {
        problems.push(`Line ${mark.line}: marked with ${mark.rule}, but there's no such warning there.`);
        continue;
      }
      used.add(message);
      const automaticFixes = message.fix ? 1 : 0;
      const suggestions = message.suggestions?.length ?? 0;
      if (automaticFixes !== mark.automaticFixes || suggestions !== mark.suggestions) {
        problems.push(`Line ${mark.line}: ${mark.rule} is marked with ${mark.automaticFixes} automatic fix(es) and ` +
          `${mark.suggestions} suggestion(s), but has ${automaticFixes} and ${suggestions}: ` +
          `${(message.suggestions ?? []).map((s) => s.desc).join(' | ')}`);
      }
    }

    // Each warning is marked.
    for (const message of messages) {
      if (!used.has(message) && message.ruleId?.startsWith('kiss-for-react/')) problems.push(`Not marked: ${describe(message)}`);
    }

    // The eslint-disable lines are the rules the file shows. (The naming rules are only on in `naming.ts`.)
    const shown = [...new Set(marks.map((mark) => mark.rule))].sort();
    const disabled = disabledRulesOf(original).sort();
    for (const rule of shown) if (!disabled.includes(rule)) problems.push(`No eslint-disable line at the top for ${rule}.`);
    for (const rule of disabled) if (!shown.includes(rule)) problems.push(`An eslint-disable line for ${rule}, which the file doesn't show.`);

    // With the eslint-disable lines, there are no warnings.
    for (const message of await lintDemo(file, original)) problems.push(`With the eslint-disable lines: ${describe(message)}`);

    expect({file, problems}).toEqual({file, problems: []});
  });

Bdd(feature)
  .scenario('Together, the demo files show all the rules of the plugin.')
  .given('All the demo files.')
  .when('We collect the rules they mark.')
  .then('They are all the rules of the plugin.')
  .run(async (_) => {
    const shown = new Set<string>();
    for (const file of demoFiles) {
      const code = withoutDisableLines(fs.readFileSync(path.join(demoDir, file), 'utf8'));
      for (const mark of marksOf(code)) shown.add(mark.rule.replace('kiss-for-react/', ''));
    }
    expect([...shown].sort()).toEqual(Object.keys(plugin.rules).sort());
  });

Bdd(feature)
  .scenario('The demo files compile.')
  .given('The demo files, and their tsconfig.json.')
  .when('TypeScript checks them.')
  .then('There are no errors.')
  .run(async (_) => {
    const configFile = ts.readConfigFile(path.join(demoDir, 'tsconfig.json'), ts.sys.readFile);
    const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, demoDir);
    const program = ts.createProgram(config.fileNames, config.options);
    const errors = ts.getPreEmitDiagnostics(program).map((diagnostic) =>
      `${diagnostic.file ? path.basename(diagnostic.file.fileName) : ''}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    expect(errors).toEqual([]);
  });
