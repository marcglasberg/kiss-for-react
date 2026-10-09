import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import type { TSESLint } from '@typescript-eslint/utils';
import * as path from 'path';
import * as ts from 'typescript';
import plugin from '../src/index.js';

const repoRoot = path.resolve(__dirname, '../..');

// The directory of the files being linted. They are not on disk: their code is given to
// TypeScript and ESLint in memory.
const virtualDir = path.join(repoRoot, 'eslint-plugin', 'testing', 'virtual').replace(/\\/g, '/');

const compilerOptions: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  skipLibCheck: true,
  noEmit: true,
  types: [],
  // `import ... from 'kiss-for-react'` uses the source of this repo.
  paths: {'kiss-for-react': [path.join(repoRoot, 'src', 'index.ts').replace(/\\/g, '/')]},
};

let previousProgram: ts.Program | undefined;

// Creates a TypeScript program with the virtual files. Reuses the previous program, so it's fast.
function createProgram(virtualFiles: Map<string, string>): ts.Program {
  const find = (name: string) => virtualFiles.get(path.resolve(name).replace(/\\/g, '/'));
  const host = ts.createCompilerHost(compilerOptions, true);
  const getSourceFile = host.getSourceFile;
  host.getSourceFile = (name, languageVersion, ...rest) => {
    const code = find(name);
    return code !== undefined
      ? ts.createSourceFile(name, code, languageVersion, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      : getSourceFile.call(host, name, languageVersion, ...rest);
  };
  const fileExists = host.fileExists;
  host.fileExists = (name) => find(name) !== undefined || fileExists.call(host, name);
  const readFile = host.readFile;
  host.readFile = (name) => find(name) ?? readFile.call(host, name);
  // The virtual directories don't exist on disk, but module resolution must find them.
  const directoryExists = host.directoryExists;
  host.directoryExists = (name) => {
    const dir = path.resolve(name).replace(/\\/g, '/') + '/';
    return [...virtualFiles.keys()].some((file) => file.startsWith(dir)) ||
      (directoryExists ? directoryExists.call(host, name) : true);
  };

  previousProgram = ts.createProgram([...virtualFiles.keys()], compilerOptions, host, previousProgram);
  return previousProgram;
}

// Applies the automatic fixes, like one pass of `eslint --fix`: in order, skipping overlapping ones.
// (`Linter.verifyAndFix` would lint the fixed code again, but the TypeScript program has the original.)
function applyFixes(code: string, messages: Linter.LintMessage[]): string {
  const fixes = messages.flatMap((message) => message.fix ? [message.fix] : [])
    .sort((a, b) => a.range[0] - b.range[0]);
  let result = '';
  let position = 0;
  for (const fix of fixes) {
    if (fix.range[0] < position) continue;
    result += code.slice(position, fix.range[0]) + fix.text;
    position = fix.range[1];
  }
  return result + code.slice(position);
}

export interface LintMessage {
  line: number;
  message: string;
  messageId: string | undefined;
  /** The text the message points to (only its first line, if it spans more than one). */
  text: string;
  /** The suggestions' descriptions. */
  suggestions: string[];
}

export interface LintResult {
  messages: LintMessage[];
  /** The code after applying the automatic fixes. */
  fixed: string;
  /** The code after applying the given suggestion of the given message. */
  withSuggestion(messageIndex: number, suggestionIndex: number): string;
  /** TypeScript's errors for the linted file (only with type information). */
  typeErrors: string[];
}

export interface LintOptions {
  /** With `true` (the default), the rule gets type information, as with `parserOptions.projectService`. */
  types?: boolean;
  /**
   * The name of the linted file, relative to the virtual directory. The default is `file.tsx`.
   * For example, `'__tests__/user.test.ts'` or `'actions/LoadUserAction.ts'`.
   */
  filename?: string;
  /**
   * Other files, by name relative to the virtual directory, with their code. They are part of
   * the TypeScript program (so the linted file can import them, like `import { State } from './state'`),
   * but are not linted.
   */
  files?: Record<string, string>;
  /** The options of the rule, if it has any. */
  ruleOptions?: unknown[];
}

/**
 * Lints the code with the given rule: the name of a rule of the plugin, like
 * `'no-new-object-in-use-select'`, or a rule module (to test a rule before it's added to the plugin).
 */
export function lint(
  rule: string | TSESLint.RuleModule<string, readonly unknown[]>,
  code: string,
  {types = true, filename = 'file.tsx', files = {}, ruleOptions = []}: LintOptions = {},
): LintResult {
  const linter = new Linter({cwd: repoRoot});
  const fileName = `${virtualDir}/${filename}`;

  const virtualFiles = new Map<string, string>();
  virtualFiles.set(path.resolve(fileName).replace(/\\/g, '/'), code);
  for (const [name, fileCode] of Object.entries(files)) {
    virtualFiles.set(path.resolve(`${virtualDir}/${name}`).replace(/\\/g, '/'), fileCode);
  }
  const program = types ? createProgram(virtualFiles) : undefined;

  const ruleName = typeof rule === 'string' ? rule : 'rule-being-tested';
  const testPlugin = typeof rule === 'string'
    ? plugin
    : {...plugin, rules: {...plugin.rules, [ruleName]: rule}};

  const config: Linter.Config[] = [{
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser as Linter.Parser,
      parserOptions: {
        ecmaFeatures: {jsx: true},
        ...(program ? {programs: [program]} : {}),
      },
    },
    plugins: {'kiss-for-react': testPlugin as any},
    rules: {[`kiss-for-react/${ruleName}`]: ['error', ...ruleOptions] as any},
  }];

  const messages = linter.verify(code, config, {filename: fileName});
  const fatal = messages.find((message) => message.fatal);
  if (fatal) throw new Error(`Parsing error: ${fatal.message}`);

  const lines = code.split('\n');
  const textOf = (message: Linter.LintMessage) => {
    if (message.endLine !== message.line || message.endColumn == null) return lines[message.line - 1].slice(message.column - 1);
    return lines[message.line - 1].slice(message.column - 1, message.endColumn - 1);
  };

  const typeErrors = program
    ? ts.getPreEmitDiagnostics(program, program.getSourceFile(path.resolve(fileName).replace(/\\/g, '/')))
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    : [];

  return {
    messages: messages.map((message) => ({
      line: message.line,
      message: message.message,
      messageId: message.messageId,
      text: textOf(message),
      suggestions: (message.suggestions ?? []).map((suggestion) => suggestion.desc),
    })),
    fixed: applyFixes(code, messages),
    withSuggestion(messageIndex, suggestionIndex) {
      const fix = messages[messageIndex].suggestions![suggestionIndex].fix;
      return code.slice(0, fix.range[0]) + fix.text + code.slice(fix.range[1]);
    },
    typeErrors,
  };
}
