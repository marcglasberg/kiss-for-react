import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import {
  enclosingClass,
  isFunction,
  isKissActionClass,
  KISS_PACKAGE,
  kissImportName,
  returnedExpressions,
  TypeInfo,
  unwrap,
  walk,
} from './utils.js';

/*
 * Helpers for the rules about components and hooks: which functions are components, which
 * code runs while they render, and which expressions are Kiss stores and dispatch functions.
 */

export type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

export type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

/** The dispatch methods of the store, of `useStore()`, and of actions. */
export const DISPATCH_METHODS = new Set([
  'dispatch', 'dispatchAll', 'dispatchAndWait', 'dispatchAndWaitAll', 'dispatchSync', 'dispatchWhen',
]);

/** The Kiss hooks that return a dispatch function, and the store method it calls. */
export const DISPATCH_HOOKS: Record<string, string> = {
  useDispatch: 'dispatch',
  useDispatcher: 'dispatch',
  useDispatchAll: 'dispatchAll',
  useDispatchAndWait: 'dispatchAndWait',
  useDispatchAndWaitAll: 'dispatchAndWaitAll',
  useDispatchSync: 'dispatchSync',
  useDispatchWhen: 'dispatchWhen',
};

// ---------------------------------------------------------------------------------------------
// Components.

/** True for `memo(...)`, `forwardRef(...)`, `React.memo(...)` and `React.forwardRef(...)`. */
function isComponentWrapper(call: TSESTree.CallExpression): boolean {
  const callee = call.callee;
  const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name
    : (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier)
      ? callee.property.name : null;
  return name === 'memo' || name === 'forwardRef';
}

/** True if the function is the argument of `memo(...)` or `forwardRef(...)`. */
function isWrappedComponent(fn: FunctionNode): boolean {
  const parent = fn.parent;
  return parent?.type === AST_NODE_TYPES.CallExpression && parent.arguments[0] === fn && isComponentWrapper(parent);
}

/**
 * The name of a function: `function User() {}`, `const User = () => {}`,
 * `const User = memo(() => {})`, or `const User = function () {}`.
 */
export function functionName(fn: FunctionNode): string | null {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) return fn.id?.name ?? null;
  let node: TSESTree.Node = fn;
  let parent = node.parent;
  while (parent?.type === AST_NODE_TYPES.CallExpression && parent.arguments[0] === node && isComponentWrapper(parent)) {
    node = parent;
    parent = parent.parent;
  }
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.init === node && parent.id.type === AST_NODE_TYPES.Identifier) {
    return parent.id.name;
  }
  return fn.type === AST_NODE_TYPES.FunctionExpression ? fn.id?.name ?? null : null;
}

/** True if the function is declared at the top level of the module (maybe exported). */
function isTopLevel(fn: FunctionNode): boolean {
  for (let current: TSESTree.Node | undefined = fn.parent; current; current = current.parent) {
    if (isFunction(current) || current.type === AST_NODE_TYPES.ClassBody) return false;
  }
  return true;
}

/** True for a function declared with a name, or assigned to a variable, or the default export. */
function isNamedOrExported(fn: FunctionNode): boolean {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) return true;
  const parent = fn.parent;
  return parent?.type === AST_NODE_TYPES.VariableDeclarator || parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration;
}

const isHookName = (name: string) => /^use[A-Z0-9]/.test(name);

/** True if the function returns JSX (in some `return`, or in a branch of `?:`, `&&` or `||`). */
export function returnsJsx(fn: FunctionNode): boolean {
  const isJsx = (node: TSESTree.Node): boolean => {
    const expression = unwrap(node);
    switch (expression.type) {
      case AST_NODE_TYPES.JSXElement:
      case AST_NODE_TYPES.JSXFragment:
        return true;
      case AST_NODE_TYPES.ConditionalExpression:
        return isJsx(expression.consequent) || isJsx(expression.alternate);
      case AST_NODE_TYPES.LogicalExpression:
        return isJsx(expression.left) || isJsx(expression.right);
      default:
        return false;
    }
  };
  return returnedExpressions(fn).some(isJsx);
}

/** True if the function calls a hook, like `useSelect(...)` or `React.useState(...)`. */
function callsHook(fn: FunctionNode): boolean {
  let found = false;
  walk(fn.body, (node) => {
    if (found || node.type !== AST_NODE_TYPES.CallExpression) return;
    const callee = node.callee;
    if (callee.type === AST_NODE_TYPES.Identifier && (isHookName(callee.name) || callee.name === 'use')) found = true;
    if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
      callee.property.type === AST_NODE_TYPES.Identifier && isHookName(callee.property.name)) found = true;
  });
  return found;
}

/**
 * True if the function's body runs while a component renders:
 * - A component: a function whose name starts with an uppercase letter, and that returns JSX or
 *   calls hooks. Or a function wrapped in `memo(...)` or `forwardRef(...)`. Or a top-level
 *   function (declared with a name, assigned to a variable, or the default export) that returns JSX.
 * - A custom hook: a function whose name starts with `use`, like `useUser`.
 */
export function isRenderFunction(fn: FunctionNode): boolean {
  if (isWrappedComponent(fn)) return true;
  const name = functionName(fn);
  if (name && isHookName(name)) return true;
  if (name && /^[A-Z]/.test(name)) return returnsJsx(fn) || callsHook(fn);
  return isNamedOrExported(fn) && isTopLevel(fn) && returnsJsx(fn);
}

/** True if hooks can be called in the function: a component with an uppercase name, or a custom hook. */
export function canCallHooks(fn: FunctionNode): boolean {
  if (isWrappedComponent(fn)) return true;
  const name = functionName(fn);
  return !!name && (isHookName(name) || /^[A-Z]/.test(name));
}

/** True for a function called right away: `(() => { ... })()`. */
function isImmediatelyCalled(fn: FunctionNode): boolean {
  const parent = fn.parent;
  return parent?.type === AST_NODE_TYPES.CallExpression && parent.callee === fn;
}

/**
 * If the node runs while a component (or custom hook) renders, returns the component.
 * That's code in the component's body, but not in nested functions, like event handlers,
 * effects, `useDispatch` options, and other closures (except functions called right away).
 */
export function renderingComponentOf(node: TSESTree.Node): FunctionNode | null {
  for (let current: TSESTree.Node | undefined = node.parent; current; current = current.parent) {
    if (current.type === AST_NODE_TYPES.ClassBody) return null;
    if (isFunction(current)) {
      if (isImmediatelyCalled(current)) continue;
      // Default values of parameters run while rendering too, but they are rare. Ignore them.
      if (!isInside(node, current.body)) return null;
      return isRenderFunction(current) ? current : null;
    }
  }
  return null;
}

function isInside(node: TSESTree.Node, outer: TSESTree.Node): boolean {
  return outer.range[0] <= node.range[0] && node.range[1] <= outer.range[1];
}

/**
 * True if the node always runs when the component renders, so a hook can replace it: it's not
 * inside an `if`, a loop, a `?:`, the right side of `&&`, `||` or `??`, a `try`, or a nested
 * function, and there's no `return` before it.
 */
export function runsOnEveryRender(node: TSESTree.Node, component: FunctionNode): boolean {
  if (component.body.type !== AST_NODE_TYPES.BlockStatement) {
    return isUnconditional(node, component.body);
  }
  const statement = component.body.body.find((s) => isInside(node, s));
  if (!statement || !isUnconditional(node, statement)) return false;
  for (const previous of component.body.body) {
    if (previous === statement) break;
    let hasReturn = false;
    walk(previous, (n) => {
      if (n.type === AST_NODE_TYPES.ReturnStatement || n.type === AST_NODE_TYPES.ThrowStatement) hasReturn = true;
    });
    if (hasReturn) return false;
  }
  return true;
}

function isUnconditional(node: TSESTree.Node, top: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  for (let parent = node.parent; parent && child !== top; child = parent, parent = parent.parent) {
    switch (parent.type) {
      case AST_NODE_TYPES.ConditionalExpression:
        if (child !== parent.test) return false;
        break;
      case AST_NODE_TYPES.LogicalExpression:
        if (child === parent.right) return false;
        break;
      case AST_NODE_TYPES.MemberExpression:
        if (parent.optional && child === parent.property) return false;
        break;
      case AST_NODE_TYPES.CallExpression:
        if (parent.optional && child !== parent.callee) return false;
        break;
      case AST_NODE_TYPES.IfStatement:
        if (child !== parent.test) return false;
        break;
      case AST_NODE_TYPES.ForStatement:
      case AST_NODE_TYPES.ForInStatement:
      case AST_NODE_TYPES.ForOfStatement:
      case AST_NODE_TYPES.WhileStatement:
      case AST_NODE_TYPES.DoWhileStatement:
      case AST_NODE_TYPES.SwitchStatement:
      case AST_NODE_TYPES.TryStatement:
      case AST_NODE_TYPES.ArrowFunctionExpression:
      case AST_NODE_TYPES.FunctionExpression:
      case AST_NODE_TYPES.FunctionDeclaration:
      case AST_NODE_TYPES.ClassBody:
        return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Stores and dispatch functions.

/** What a Kiss object is: a `Store`, or what `useStore()` returns. */
export type StoreKind = 'store' | 'dispatchers';

/**
 * If the expression is a Kiss store (`'store'`), or what `useStore()` returns (`'dispatchers'`).
 * Without type information (or when the type doesn't say), it must clearly be one:
 * - `useStore()`, `createStore(...)` or `new Store(...)`, imported from Kiss.
 * - A `const` initialized with one of these, or a variable or parameter typed as `Store<...>`.
 * - `x.store`, where `x` is what `useStore()` returns, and `this.store` inside a Kiss action.
 */
export function storeKind(node: TSESTree.Node, context: Context, typeInfo: TypeInfo | null, depth = 0): StoreKind | null {
  const expression = unwrap(node);
  if (depth > 5) return null;

  if (expression.type === AST_NODE_TYPES.CallExpression) {
    const name = kissImportName(expression.callee, context);
    if (name === 'useStore') return 'dispatchers';
    if (name === 'createStore') return 'store';
  }
  if (expression.type === AST_NODE_TYPES.NewExpression && kissImportName(expression.callee, context) === 'Store') return 'store';

  if (expression.type === AST_NODE_TYPES.MemberExpression && !expression.computed &&
    expression.property.type === AST_NODE_TYPES.Identifier && expression.property.name === 'store') {
    if (expression.object.type === AST_NODE_TYPES.ThisExpression) {
      const classNode = enclosingClass(expression);
      if (classNode && isKissActionClass(classNode, typeInfo)) return 'store';
    } else if (storeKind(expression.object, context, typeInfo, depth + 1) === 'dispatchers') {
      return 'store';
    }
  }

  if (expression.type === AST_NODE_TYPES.Identifier) {
    const variable = ASTUtils.findVariable(context.sourceCode.getScope(expression), expression.name);
    const def = variable?.defs[0];
    if (def) {
      // `const store = createStore(...)`
      if (def.type === 'Variable' && def.node.type === AST_NODE_TYPES.VariableDeclarator &&
        def.node.id === def.name && def.node.init && (def.parent as TSESTree.VariableDeclaration).kind === 'const') {
        const kind = storeKind(def.node.init, context, typeInfo, depth + 1);
        if (kind) return kind;
      }
      // `store: Store<State>`
      const annotation = (def.name as TSESTree.Identifier).typeAnnotation?.typeAnnotation;
      if (annotation?.type === AST_NODE_TYPES.TSTypeReference && annotation.typeName.type === AST_NODE_TYPES.Identifier &&
        kissImportName(annotation.typeName, context) === 'Store') return 'store';
    }
  }

  if (typeInfo) return storeKindOfType(expression, typeInfo);
  return null;
}

function storeKindOfType(expression: TSESTree.Node, typeInfo: TypeInfo): StoreKind | null {
  const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(expression);
  if (!tsNode) return null;
  const type = typeInfo.checker.getNonNullableType(typeInfo.checker.getTypeAtLocation(tsNode));
  const name = type.getSymbol()?.getName();
  if (!type.getProperty('dispatchAndWait')) return null;
  if (name === 'Store' && type.getProperty('state')) return 'store';
  if (name === 'StoreDispatchers') return 'dispatchers';
  return null;
}

/**
 * If the callee is a Kiss dispatch function, returns the store method it calls, like
 * `'dispatch'` or `'dispatchAndWait'`. Recognizes:
 * - The functions returned by the dispatch hooks: `const dispatch = useDispatch()`.
 * - The dispatch methods of a store, or of `useStore()`: `store.dispatch`, `useStore().dispatch`.
 * - Dispatch methods destructured from `useStore()`: `const { dispatch } = useStore()`.
 */
export function dispatchMethodOf(callee: TSESTree.Node, context: Context, typeInfo: TypeInfo | null): string | null {
  const expression = unwrap(callee);

  if (expression.type === AST_NODE_TYPES.MemberExpression && !expression.computed &&
    expression.property.type === AST_NODE_TYPES.Identifier && DISPATCH_METHODS.has(expression.property.name)) {
    return storeKind(expression.object, context, typeInfo) ? expression.property.name : null;
  }

  if (expression.type !== AST_NODE_TYPES.Identifier) return null;
  const def = ASTUtils.findVariable(context.sourceCode.getScope(expression), expression.name)?.defs[0];
  if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator || !def.node.init) return null;
  if ((def.parent as TSESTree.VariableDeclaration).kind !== 'const') return null;
  const init = unwrap(def.node.init);

  // `const dispatch = useDispatch()`
  if (def.node.id === def.name) {
    if (init.type !== AST_NODE_TYPES.CallExpression) return null;
    const hook = kissImportName(init.callee, context);
    return hook && DISPATCH_HOOKS[hook] ? DISPATCH_HOOKS[hook] : null;
  }

  // `const { dispatch } = useStore()`
  if (def.node.id.type === AST_NODE_TYPES.ObjectPattern && storeKind(init, context, typeInfo)) {
    for (const property of def.node.id.properties) {
      if (property.type !== AST_NODE_TYPES.Property || property.computed || property.key.type !== AST_NODE_TYPES.Identifier) continue;
      const value = property.value.type === AST_NODE_TYPES.AssignmentPattern ? property.value.left : property.value;
      if (value === def.name && DISPATCH_METHODS.has(property.key.name)) return property.key.name;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Fixes.

/** The kiss-for-react imports of the file (not `import type`). */
function kissImports(context: Context): TSESTree.ImportDeclaration[] {
  return context.sourceCode.ast.body.filter((statement): statement is TSESTree.ImportDeclaration =>
    statement.type === AST_NODE_TYPES.ImportDeclaration &&
    statement.source.value === KISS_PACKAGE &&
    statement.importKind !== 'type');
}

/** The import specifier of a Kiss export, like `useSelect` in `import { useSelect as select } ...`. */
export function kissImportSpecifier(context: Context, exported: string): TSESTree.ImportSpecifier | null {
  for (const declaration of kissImports(context)) {
    for (const specifier of declaration.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind !== 'type' &&
        specifier.imported.type === AST_NODE_TYPES.Identifier && specifier.imported.name === exported) return specifier;
    }
  }
  return null;
}

/**
 * How to call a Kiss export (like `useSelect`) at `location`, and the fixes that import it:
 * - Already imported: its local name, and no fixes.
 * - With `import * as kiss from 'kiss-for-react'`: `kiss.useSelect`.
 * - Otherwise, adds it to an import from Kiss, or adds a new import.
 *
 * `replacing` is an import specifier that the fix makes unused (like `useAllState`). When given,
 * the new name replaces it, or it's removed.
 *
 * Returns null if the name is already used for something else.
 */
export function importKissExport(
  context: Context,
  fixer: TSESLint.RuleFixer,
  exported: string,
  location: TSESTree.Node,
  replacing: TSESTree.ImportSpecifier | null = null,
): { name: string, fixes: TSESLint.RuleFix[] } | null {
  const existing = kissImportSpecifier(context, exported);
  if (existing) {
    return {name: existing.local.name, fixes: replacing ? [removeSpecifier(context, fixer, replacing)] : []};
  }

  for (const declaration of kissImports(context)) {
    for (const specifier of declaration.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
        return {name: `${specifier.local.name}.${exported}`, fixes: replacing ? [removeSpecifier(context, fixer, replacing)] : []};
      }
    }
  }

  if (ASTUtils.findVariable(context.sourceCode.getScope(location), exported)) return null;

  if (replacing) return {name: exported, fixes: [fixer.replaceText(replacing, exported)]};

  for (const declaration of kissImports(context)) {
    const last = declaration.specifiers[declaration.specifiers.length - 1];
    if (last?.type === AST_NODE_TYPES.ImportSpecifier) {
      return {name: exported, fixes: [fixer.insertTextAfter(last, `, ${exported}`)]};
    }
  }

  const imports = context.sourceCode.ast.body.filter((s) => s.type === AST_NODE_TYPES.ImportDeclaration);
  const text = `import { ${exported} } from '${KISS_PACKAGE}';`;
  if (imports.length > 0) return {name: exported, fixes: [fixer.insertTextAfter(imports[imports.length - 1], `\n${text}`)]};
  return {name: exported, fixes: [fixer.insertTextBeforeRange([0, 0], `${text}\n`)]};
}

/** Removes an import specifier, with its comma (or the whole import, if it's the only one). */
function removeSpecifier(context: Context, fixer: TSESLint.RuleFixer, specifier: TSESTree.ImportSpecifier): TSESLint.RuleFix {
  const declaration = specifier.parent as TSESTree.ImportDeclaration;
  if (declaration.specifiers.length === 1) {
    const next = context.sourceCode.getTokenAfter(declaration, {includeComments: true});
    const end = next && next.loc.start.line > declaration.loc.end.line
      ? context.sourceCode.getIndexFromLoc({line: declaration.loc.end.line + 1, column: 0})
      : declaration.range[1];
    return fixer.removeRange([declaration.range[0], end]);
  }
  const before = context.sourceCode.getTokenBefore(specifier);
  if (before?.value === ',') return fixer.removeRange([before.range[0], specifier.range[1]]);
  const after = context.sourceCode.getTokenAfter(specifier);
  const nextToken = after ? context.sourceCode.getTokenAfter(after) : null;
  if (after?.value === ',' && nextToken) return fixer.removeRange([specifier.range[0], nextToken.range[0]]);
  return fixer.remove(specifier);
}

/**
 * The longest path of properties read from `root`: for `state.user.name.length`, with `root`
 * being `state`, returns the `state.user.name.length` node and `['user', 'name', 'length']`.
 * Stops before a method call (`state.items.filter(...)` gives `state.items`), a computed property
 * (`state.items[0]`), an optional property (`state.user?.name`), or an assignment.
 */
export function propertyPath(root: TSESTree.Node): { node: TSESTree.Node, path: string[] } {
  let node: TSESTree.Node = root;
  const path: string[] = [];
  for (;;) {
    const parent = node.parent;
    if (parent?.type !== AST_NODE_TYPES.MemberExpression || parent.object !== node || parent.computed || parent.optional ||
      parent.property.type !== AST_NODE_TYPES.Identifier) break;
    const grandParent = parent.parent;
    if (grandParent?.type === AST_NODE_TYPES.CallExpression && grandParent.callee === parent) break;
    path.push(parent.property.name);
    node = parent;
  }
  return {node, path};
}

/** True if the node is assigned, incremented, or deleted. */
export function isWritten(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.left === node) return true;
  if (parent.type === AST_NODE_TYPES.UpdateExpression) return true;
  if (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'delete') return true;
  return false;
}

/**
 * The name of a type that can be written in the code at `location`, like `State`, or null if
 * it can't (for example, an anonymous type, or a class that's not imported in this file).
 */
export function writableTypeName(type: ts.Type, location: TSESTree.Node, context: Context, typeInfo: TypeInfo): string | null {
  const name = typeInfo.checker.typeToString(type);
  if (!/^[A-Za-z_$][\w$]*(<[\w$<>, .]*>)?$/.test(name)) return null;
  if (['any', 'unknown', 'never', 'object'].includes(name)) return null;
  if (['number', 'string', 'boolean', 'bigint', 'null', 'undefined'].includes(name)) return name;
  // All the names in it must be visible here.
  const identifiers = name.match(/[A-Za-z_$][\w$]*/g) ?? [];
  const builtIn = new Set(['number', 'string', 'boolean', 'bigint', 'null', 'undefined', 'Array', 'ReadonlyArray', 'Map', 'Set']);
  const scope = context.sourceCode.getScope(location);
  for (const identifier of identifiers) {
    if (!builtIn.has(identifier) && !ASTUtils.findVariable(scope, identifier)) return null;
  }
  return name;
}

/** The camelCase name of a path: `['user', 'name']` becomes `userName`. */
export function nameOfPath(path: string[]): string {
  return path.map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum',
  'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null',
  'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'let', 'static', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'await', 'arguments',
  'eval', 'undefined', 'NaN', 'Infinity',
]);

/** True if the name can be used for a new variable. */
export function isValidVariableName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED.has(name);
}

/** The indentation of the line where the node starts. */
export function indentOf(node: TSESTree.Node, context: Context): string {
  const line = context.sourceCode.lines[node.loc.start.line - 1];
  return /^\s*/.exec(line)![0];
}

