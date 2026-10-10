import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { isFunction, isKissActionClass, KISS_PACKAGE, kissImportName, memberName, TypeInfo, unwrap } from './utils.js';

// Helpers for the rules about errors: `UserException`, `wrapError`, `globalWrapError`,
// and the store's debug options.

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

export type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

/** The nearest function that contains the node (not counting the node itself). */
export function enclosingFunction(node: TSESTree.Node): FunctionNode | null {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunction(current)) return current;
  }
  return null;
}

/** Goes up from `node` through the TypeScript wrappers around it (`as`, `!`, `satisfies`). */
export function outermost(node: TSESTree.Node): TSESTree.Node {
  for (let parent = node.parent; parent; parent = node.parent) {
    if ((parent.type === AST_NODE_TYPES.TSAsExpression ||
      parent.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      parent.type === AST_NODE_TYPES.TSNonNullExpression ||
      parent.type === AST_NODE_TYPES.TSTypeAssertion) && parent.expression === node) node = parent;
    else break;
  }
  return node;
}

/** If the expression is `new X(...)`, with `X` imported from Kiss as `name`, returns it. */
export function kissNew(node: TSESTree.Node | null | undefined, name: string, context: Context): TSESTree.NewExpression | null {
  if (!node) return null;
  const expression = unwrap(node);
  if (expression.type !== AST_NODE_TYPES.NewExpression) return null;
  return kissImportName(expression.callee, context) === name ? expression : null;
}

/**
 * The `new UserException(...)` of the expression. It may be followed by method calls, like
 * `new UserException('Failed').withHardCause(error)`.
 */
export function userExceptionOf(node: TSESTree.Node | null | undefined, context: Context): TSESTree.NewExpression | null {
  if (!node) return null;
  let expression = unwrap(node);
  while (expression.type === AST_NODE_TYPES.CallExpression &&
    expression.callee.type === AST_NODE_TYPES.MemberExpression) {
    expression = unwrap(expression.callee.object);
  }
  return kissNew(expression, 'UserException', context);
}

/** True if `node` is inside the `try` block of a `try` with a `catch`, in the same function. */
export function isCaughtInSameFunction(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  for (let current = node.parent; current && !isFunction(current); current = current.parent) {
    if (current.type === AST_NODE_TYPES.TryStatement && current.block === child && current.handler) return true;
    child = current;
  }
  return false;
}

/**
 * True if `node` only runs under some condition: it's in a branch of an `if`, of a conditional
 * expression (`a ? b : c`), of a `switch`, or in the right side of `&&`, `||` or `??`.
 */
export function isConditional(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === AST_NODE_TYPES.IfStatement && child !== current.test) return true;
    if (current.type === AST_NODE_TYPES.ConditionalExpression && child !== current.test) return true;
    if (current.type === AST_NODE_TYPES.LogicalExpression && child === current.right) return true;
    if (current.type === AST_NODE_TYPES.SwitchCase && child !== current.test) return true;
    child = current;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// The store options.
// ---------------------------------------------------------------------------------------------

/**
 * If the node creates a Kiss store, with `createStore({...})` or `new Store({...})`, returns
 * the object with its options.
 */
export function storeOptions(node: TSESTree.CallExpression | TSESTree.NewExpression, context: Context): TSESTree.ObjectExpression | null {
  const name = kissImportName(node.callee, context);
  if (node.type === AST_NODE_TYPES.CallExpression ? name !== 'createStore' : name !== 'Store') return null;
  const options = node.arguments[0] ? unwrap(node.arguments[0]) : null;
  return options?.type === AST_NODE_TYPES.ObjectExpression ? options : null;
}

/** The property with the given name in the object (`name: value`, `name() {}` or `name`). */
export function findObjectProperty(object: TSESTree.ObjectExpression, name: string): TSESTree.Property | null {
  for (const property of object.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.computed || property.kind !== 'init') continue;
    if (propertyName(property) === name) return property;
  }
  return null;
}

function propertyName(property: TSESTree.Property): string | null {
  if (property.key.type === AST_NODE_TYPES.Identifier) return property.key.name;
  if (property.key.type === AST_NODE_TYPES.Literal && typeof property.key.value === 'string') return property.key.value;
  return null;
}

/**
 * The function the expression is, or refers to: a function declared in the same file, or a
 * `const` initialized with a function.
 */
export function resolveFunction(node: TSESTree.Node, context: Context): FunctionNode | null {
  const expression = unwrap(node);
  if (isFunction(expression)) return expression;
  if (expression.type !== AST_NODE_TYPES.Identifier) return null;
  const def = ASTUtils.findVariable(context.sourceCode.getScope(expression), expression.name)?.defs[0];
  if (!def) return null;
  if (def.type === 'FunctionName' && def.node.type === AST_NODE_TYPES.FunctionDeclaration) return def.node;
  if (def.type === 'Variable' && def.node.type === AST_NODE_TYPES.VariableDeclarator &&
    def.parent?.type === AST_NODE_TYPES.VariableDeclaration && def.parent.kind === 'const' && def.node.init) {
    const init = unwrap(def.node.init);
    if (isFunction(init)) return init;
  }
  return null;
}

/**
 * If the function is given to a Kiss store as one of its options, returns the option's name.
 * For example, `globalWrapError` for `createStore({ globalWrapError: (error) => ... })`.
 * The function may also be declared in the same file, and given by name.
 */
export function storeOptionNameOf(fn: FunctionNode, context: Context): string | null {
  const optionName = (value: TSESTree.Node): string | null => {
    const node = outermost(value);
    const property = node.parent;
    if (property?.type !== AST_NODE_TYPES.Property || property.value !== node ||
      property.computed || property.kind !== 'init') return null;
    const object = property.parent;
    if (object?.type !== AST_NODE_TYPES.ObjectExpression) return null;
    const call = outermost(object).parent;
    if (call?.type !== AST_NODE_TYPES.CallExpression && call?.type !== AST_NODE_TYPES.NewExpression) return null;
    return storeOptions(call, context) === object ? propertyName(property) : null;
  };

  const direct = optionName(fn);
  if (direct) return direct;

  // Declared with a name, and given by that name.
  let declaration: TSESTree.Node | null = null;
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) declaration = fn;
  else {
    const declarator = outermost(fn).parent;
    if (declarator?.type === AST_NODE_TYPES.VariableDeclarator && declarator.init && unwrap(declarator.init) === fn &&
      declarator.parent?.type === AST_NODE_TYPES.VariableDeclaration && declarator.parent.kind === 'const') {
      declaration = declarator;
    }
  }
  if (!declaration) return null;
  for (const variable of context.sourceCode.getDeclaredVariables(declaration)) {
    for (const reference of variable.references) {
      const name = optionName(reference.identifier);
      if (name) return name;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Classes.
// ---------------------------------------------------------------------------------------------

const PERSISTOR_CLASSES = ['Persistor', 'ClassPersistor', 'PersistorDummy', 'PersistorPrinterDecorator'];

/**
 * True if the class is a Kiss action: see `isKissActionClass`. Without type information, it's
 * also an action if it directly extends Kiss's `KissAction`, `OptimisticCommand` or `OptimisticSync`.
 */
export function isActionClass(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (!classNode.superClass) return false;
  if (isKissActionClass(classNode, typeInfo)) return true;
  if (typeInfo) return false;
  const superName = kissImportName(classNode.superClass, context);
  return superName === 'KissAction' || superName === 'OptimisticCommand' || superName === 'OptimisticSync';
}

/**
 * True if the class is a Kiss persistor: it extends Kiss's `Persistor` (directly, or with type
 * information also indirectly), or one of Kiss's persistor classes.
 */
export function isPersistorClass(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (!classNode.superClass) return false;
  const superName = kissImportName(classNode.superClass, context);
  if (superName && PERSISTOR_CLASSES.includes(superName)) return true;
  if (!typeInfo) return false;
  const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(classNode) as ts.ClassLikeDeclaration;
  return extendsKissClass(typeInfo.checker.getTypeAtLocation(tsNode), 'Persistor', typeInfo.checker, new Set());
}

function extendsKissClass(type: ts.Type, name: string, checker: ts.TypeChecker, seen: Set<ts.Type>): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  const target = (type as ts.TypeReference).target ?? type;
  if (target.getSymbol()?.getName() === name) return true;
  const bases = target.isClassOrInterface() ? checker.getBaseTypes(target) : [];
  return bases.some((base) => extendsKissClass(base, name, checker, seen));
}

/**
 * True if the function is the (non-static) method with the given name of a Kiss action (if
 * `actions`) or persistor (if `persistors`).
 */
export function isMethodOf(
  fn: FunctionNode,
  name: string,
  context: Context,
  typeInfo: TypeInfo | null,
  {actions = true, persistors = false}: { actions?: boolean, persistors?: boolean },
): boolean {
  const method = fn.parent;
  if (fn.type !== AST_NODE_TYPES.FunctionExpression || method?.type !== AST_NODE_TYPES.MethodDefinition ||
    method.static || method.kind !== 'method' || memberName(method) !== name) return false;
  const classNode = method.parent.parent;
  if (classNode.type !== AST_NODE_TYPES.ClassDeclaration && classNode.type !== AST_NODE_TYPES.ClassExpression) return false;
  return (actions && isActionClass(classNode, context, typeInfo)) ||
    (persistors && isPersistorClass(classNode, context, typeInfo));
}

// ---------------------------------------------------------------------------------------------
// Imports.
// ---------------------------------------------------------------------------------------------

/**
 * How to refer to the Kiss export `name` in the file, given a node that refers to another Kiss
 * export (like `UserException` or `kiss.UserException`). Returns the text to use, and the fix
 * that adds the import, if needed. Returns null if it can't be done safely.
 */
export function kissExportReference(
  name: string,
  sibling: TSESTree.Node,
  context: Context,
): { text: string, fix: ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix) | null } | null {
  // Used as `kiss.UserException`: use `kiss.UserExceptionAction`.
  if (sibling.type === AST_NODE_TYPES.MemberExpression && sibling.object.type === AST_NODE_TYPES.Identifier) {
    return {text: `${sibling.object.name}.${name}`, fix: null};
  }

  // Already imported by name.
  const program = context.sourceCode.ast;
  for (const statement of program.body) {
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration || statement.source.value !== KISS_PACKAGE ||
      statement.importKind === 'type') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind !== 'type' &&
        (specifier.imported.type === AST_NODE_TYPES.Identifier ? specifier.imported.name : specifier.imported.value) === name) {
        return {text: specifier.local.name, fix: null};
      }
    }
  }

  // Add it to the import of the sibling.
  if (sibling.type !== AST_NODE_TYPES.Identifier) return null;
  const def = ASTUtils.findVariable(context.sourceCode.getScope(sibling), sibling.name)?.defs[0];
  if (def?.type !== 'ImportBinding' || def.node.type !== AST_NODE_TYPES.ImportSpecifier) return null;
  // The name must be free in the module.
  const moduleScope = context.sourceCode.scopeManager?.globalScope?.childScopes.find((s) => s.type === 'module');
  if (!moduleScope || moduleScope.set.has(name) || hasReferenceTo(moduleScope, name)) return null;
  const specifier = def.node;
  return {text: name, fix: (fixer) => fixer.insertTextAfter(specifier, `, ${name}`)};
}

function hasReferenceTo(scope: TSESLint.Scope.Scope, name: string): boolean {
  return scope.through.some((reference) => reference.identifier.name === name) ||
    scope.childScopes.some((child) => child.set.has(name) || hasReferenceTo(child, name));
}
