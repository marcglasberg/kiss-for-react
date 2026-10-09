import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { findMethod, isKissActionClass, isTestFile, kissImportName, TypeInfo } from './utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

// ---------------------------------------------------------------------------------------------
// Which classes are checked.
// ---------------------------------------------------------------------------------------------

/**
 * True if the class is a concrete (non-abstract) Kiss action, which can be dispatched.
 *
 * With type information, it must extend `KissAction`, directly or not. Without it, it must
 * extend some class, and declare `reduce` (or inherit it from a class declared in the same
 * file), or extend Kiss's `OptimisticCommand`, which already declares `reduce`.
 */
export function isConcreteActionClass(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (classNode.type === AST_NODE_TYPES.ClassDeclaration && (classNode.abstract || classNode.declare)) return false;
  if (!classNode.superClass) return false;
  if (typeInfo) return isKissActionClass(classNode, typeInfo);
  return hasReduceSyntactically(classNode, context, new Set());
}

function hasReduceSyntactically(classNode: ClassNode, context: Context, seen: Set<ClassNode>): boolean {
  if (seen.has(classNode)) return false;
  seen.add(classNode);
  if (!classNode.superClass) return false;
  if (findMethod(classNode, 'reduce')) return true;
  const superClass = classNode.superClass;
  if (kissImportName(superClass, context) === 'OptimisticCommand') return true;
  if (superClass.type !== AST_NODE_TYPES.Identifier) return false;
  // A superclass declared in the same file, which declares `reduce`.
  const variable = findVariableInScopes(context.sourceCode.getScope(classNode), superClass.name);
  const def = variable?.defs.find((d) => d.type === 'ClassName');
  if (!def) return false;
  const superNode = def.node as TSESTree.Node;
  if (superNode.type !== AST_NODE_TYPES.ClassDeclaration && superNode.type !== AST_NODE_TYPES.ClassExpression) return false;
  return hasReduceSyntactically(superNode, context, seen);
}

function findVariableInScopes(scope: TSESLint.Scope.Scope | null, name: string): TSESLint.Scope.Variable | null {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) return variable;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Action names.
// ---------------------------------------------------------------------------------------------

export type ActionNameStyle = 'ends-with-action' | 'ends-with-underscore-action' | 'without-action';

/** The name without its `Action` or `_Action` ending: `LoadUser` for `LoadUserAction` or `LoadUser_Action`. */
export function actionBaseName(name: string): string {
  if (name.endsWith('_Action')) return name.slice(0, -'_Action'.length);
  if (name.endsWith('Action')) return name.slice(0, -'Action'.length);
  return name;
}

/**
 * The name the action should have, in the given style, or `null` if its name is already right
 * (or if there is no good name to suggest, like for an action called `Action`).
 */
export function expectedActionName(name: string, style: ActionNameStyle): string | null {
  const base = actionBaseName(name);
  // Names like `Action` or `_Action`: there's no name to suggest.
  if (base === '' || base === '_') return null;
  let expected: string;
  switch (style) {
    case 'ends-with-action':
      expected = (base.endsWith('_') ? base.slice(0, -1) : base) + 'Action';
      if (expected === 'Action') return null;
      break;
    case 'ends-with-underscore-action':
      expected = (base.endsWith('_') ? base.slice(0, -1) : base) + '_Action';
      if (expected === '_Action') return null;
      break;
    case 'without-action':
      expected = base;
      break;
  }
  return expected === name ? null : expected;
}

const RESERVED_NAMES = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements', 'interface',
  'package', 'private', 'protected', 'public', 'await', 'arguments', 'eval',
  // TypeScript doesn't accept these as class names.
  'any', 'unknown', 'never', 'string', 'number', 'boolean', 'symbol', 'bigint', 'object', 'undefined',
]);

/**
 * Reports a concrete action class whose name doesn't follow the style. When the class can be
 * safely renamed in this file, it also offers a suggestion that renames it (and all its
 * references in the file).
 */
export function checkActionName(
  context: Context,
  classNode: TSESTree.ClassDeclaration,
  style: ActionNameStyle,
  typeInfo: TypeInfo | null,
): void {
  if (!classNode.id || !isConcreteActionClass(classNode, context, typeInfo)) return;
  const name = classNode.id.name;
  const newName = expectedActionName(name, style);
  if (!newName) return;

  const fixes = renameFixes(context, classNode, name, newName);
  context.report({
    node: classNode.id,
    messageId: fixes ? 'rename' : 'renameWithIde',
    data: {name, newName},
    suggest: fixes ? [{
      messageId: 'renameSuggestion',
      data: {name, newName},
      fix: (fixer: TSESLint.RuleFixer) => fixes.map(({range, text}) => fixer.replaceTextRange(range, text)),
    }] : [],
  });
}

interface Replacement {
  range: [number, number];
  text: string;
}

/**
 * The replacements that rename the class in this file, or `null` if it's not safe:
 * the class is exported (so other files may use it), the file is a script (so the class is
 * global), or the new name is not a valid name, or is already used in the file.
 */
function renameFixes(context: Context, classNode: TSESTree.ClassDeclaration, name: string, newName: string): Replacement[] | null {
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;

  if (!/^[A-Za-z_$][\w$]*$/.test(newName) || RESERVED_NAMES.has(newName)) return null;

  // Declared with `export class` or `export default class`.
  const parent = classNode.parent;
  if (parent?.type === AST_NODE_TYPES.ExportNamedDeclaration || parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration) return null;

  // A file without imports or exports is a script, and its classes are global.
  const isModule = program.body.some((statement) =>
    statement.type === AST_NODE_TYPES.ImportDeclaration ||
    statement.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    statement.type === AST_NODE_TYPES.ExportDefaultDeclaration ||
    statement.type === AST_NODE_TYPES.ExportAllDeclaration ||
    statement.type === AST_NODE_TYPES.TSExportAssignment ||
    statement.type === AST_NODE_TYPES.TSImportEqualsDeclaration);
  if (!isModule) return null;

  // The new name must not be used anywhere in the file, nor be a known global.
  if (program.tokens?.some((token) => token.value === newName)) return null;
  if (sourceCode.scopeManager?.globalScope?.set.has(newName)) return null;

  const identifiers = new Map<number, TSESTree.Identifier | TSESTree.JSXIdentifier>();
  for (const variable of sourceCode.getDeclaredVariables(classNode)) {
    if (variable.name !== name) continue;
    for (const id of variable.identifiers) identifiers.set(id.range[0], id);
    for (const reference of variable.references) identifiers.set(reference.identifier.range[0], reference.identifier);
  }

  const replacements: Replacement[] = [];
  for (const id of identifiers.values()) {
    const idParent = id.parent;
    // Exported with `export { LoadUser }`, `export default LoadUser` or `export = LoadUser`.
    if (idParent?.type === AST_NODE_TYPES.ExportSpecifier ||
      idParent?.type === AST_NODE_TYPES.ExportDefaultDeclaration ||
      idParent?.type === AST_NODE_TYPES.TSExportAssignment) return null;
    // Must be the class name itself, not something else (like a quoted name).
    if (sourceCode.getText(id) !== name) return null;
    // `{ LoadUser }` becomes `{ LoadUser: NewName }`, to keep the property name.
    if (idParent?.type === AST_NODE_TYPES.Property && idParent.shorthand && idParent.value === id) {
      replacements.push({range: id.range, text: `${name}: ${newName}`});
    } else {
      replacements.push({range: id.range, text: newName});
    }
  }
  return replacements.sort((a, b) => a.range[0] - b.range[0]);
}

/** The messages of the action name rules. */
export function actionNameMessages(rule: string) {
  return {
    rename: `Rename the action \`{{name}}\` to \`{{newName}}\`. ${rule}`,
    renameWithIde: `Rename the action \`{{name}}\` to \`{{newName}}\`, with your IDE's rename refactoring, which also renames it in the other files. ${rule}`,
    renameSuggestion: 'Rename `{{name}}` to `{{newName}}` in this file.',
  };
}

// ---------------------------------------------------------------------------------------------
// Action file names.
// ---------------------------------------------------------------------------------------------

export type ActionFileNameStyle = 'ends-with-action' | 'starts-with-action';

type CaseStyle = 'pascal' | 'camel' | 'kebab' | 'snake';

const EXTENSION = /\.[cm]?[jt]sx?$/i;

/**
 * Splits a name into words: `LoadUserAction`, `load-user-action`, `load_user_action`,
 * `loadUserAction` and `LOAD_USER_ACTION` all become `Load`, `User`, `Action` (in their case).
 */
export function splitWords(name: string): string[] {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s\-_.]+/)
    .filter((word) => word !== '');
}

function isActionWord(word: string | undefined): boolean {
  const lower = word?.toLowerCase();
  return lower === 'action' || lower === 'actions';
}

/** The case style of a file name (without the extension), ignoring its `ACTION_` or `_action` part. */
function caseStyleOf(stem: string): CaseStyle {
  const rest = stem.replace(/^actions?[-_.]/i, '').replace(/[-_.]actions?$/i, '');
  if (rest !== '') stem = rest;
  if (stem.includes('-')) return 'kebab';
  if (stem.includes('_')) return 'snake';
  if (/^[A-Z]/.test(stem)) return 'pascal';
  if (/[A-Z]/.test(stem)) return 'camel';
  // A single lowercase word, like `user`: kebab-case, snake_case and camelCase look the same.
  return 'kebab';
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function joinWords(words: string[], style: CaseStyle): string {
  switch (style) {
    case 'pascal':
      return words.map(capitalize).join('');
    case 'camel':
      return words.map((word, index) => index === 0 ? word.toLowerCase() : capitalize(word)).join('');
    case 'kebab':
      return words.map((word) => word.toLowerCase()).join('-');
    case 'snake':
      return words.map((word) => word.toLowerCase()).join('_');
  }
}

/** True if the file name (without the extension) follows the style. */
export function fileNameFollowsStyle(stem: string, style: ActionFileNameStyle): boolean {
  const words = splitWords(stem);
  return style === 'ends-with-action' ? isActionWord(words[words.length - 1]) : isActionWord(words[0]);
}

/**
 * The file name to suggest, in the case style of the current file name. With a single action,
 * it's based on the action's name, like `load-user-action.ts` for `LoadUser`. Otherwise, it's
 * based on the current file name, like `user-actions.ts` or `action-user.ts` for `user.ts`.
 */
export function suggestedFileName(
  stem: string,
  extension: string,
  actionNames: (string | null)[],
  style: ActionFileNameStyle,
): string {
  const caseStyle = caseStyleOf(stem);
  const single = actionNames.length === 1;
  let words = (single && actionNames[0]) ? splitWords(actionBaseName(actionNames[0])) : splitWords(stem);
  // Remove `action` words in the wrong place.
  while (words.length > 1 && isActionWord(words[0])) words.shift();
  while (words.length > 1 && isActionWord(words[words.length - 1])) words.pop();
  if (words.length === 0) words = [stem];

  // `user-actions.ts` reads better than `user-action.ts`, for a file with more than one action.
  if (style === 'ends-with-action') return joinWords([...words, single ? 'action' : 'actions'], caseStyle) + extension;

  const actionWord = 'action';

  // `ACTION_LoadUser.ts`, `ACTION_load_user.ts`, `action-load-user.ts`, `actionLoadUser.ts`.
  switch (caseStyle) {
    case 'pascal':
      return `${actionWord.toUpperCase()}_${joinWords(words, 'pascal')}${extension}`;
    case 'snake':
      return `${actionWord.toUpperCase()}_${joinWords(words, 'snake')}${extension}`;
    default:
      return joinWords([actionWord, ...words], caseStyle) + extension;
  }
}

/**
 * Creates the visitors of an action file name rule. They collect the concrete action classes
 * of the file, and report the first one if the file name doesn't follow the style.
 */
export function checkActionFileName(context: Context, style: ActionFileNameStyle, typeInfo: TypeInfo | null): TSESLint.RuleListener {
  const filename = context.filename.replace(/\\/g, '/');
  const baseName = filename.slice(filename.lastIndexOf('/') + 1);
  const extensionMatch = EXTENSION.exec(baseName);

  // Not a real file, a declaration file, or a test.
  if (!extensionMatch || baseName === '<input>' || baseName === '<text>' || /\.d\.[cm]?ts$/i.test(baseName) || isTestFile(context)) return {};

  const extension = extensionMatch[0];
  const stem = baseName.slice(0, -extension.length);
  // An `index` file is named by its directory.
  if (stem === 'index' || fileNameFollowsStyle(stem, style)) return {};

  const actions: ClassNode[] = [];
  const visit = (classNode: ClassNode) => {
    if (isConcreteActionClass(classNode, context, typeInfo)) actions.push(classNode);
  };

  return {
    ClassDeclaration: visit,
    ClassExpression: visit,
    'Program:exit'() {
      if (actions.length === 0) return;
      const suggested = suggestedFileName(stem, extension, actions.map(classNameOf), style);
      context.report({
        node: actions[0].id ?? actions[0],
        messageId: 'wrongFileName',
        data: {fileName: baseName, suggested},
      });
    },
  };
}

/** The name of a class: its own name, or the name of the variable it's assigned to. */
function classNameOf(classNode: ClassNode): string | null {
  if (classNode.id) return classNode.id.name;
  const parent = classNode.parent;
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) return parent.id.name;
  return null;
}
