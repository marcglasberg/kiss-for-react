import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { classDeclarationOf } from './actions.js';
import { findMethod, findProperty, isAsyncMethod, isKissActionClass, isThenable, kissImportName, TypeInfo, unwrap, walk } from './utils.js';

// Helpers for the rules that check the methods of Kiss action classes: `reduce`, `before`,
// `after`, `abortDispatch`, `wrapReduce`.

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
export type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

/**
 * True if the class is a Kiss action. Like `isKissActionClass`, but without type information it
 * also accepts classes without a `reduce` (like a base action that only declares `after`), when
 * their superclasses in this file reach a class imported from 'kiss-for-react'.
 */
export function isActionClass(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (isKissActionClass(classNode, typeInfo)) return true;
  if (typeInfo) return false;
  const seen = new Set<TSESTree.Node>();
  let current: ClassNode | null = classNode;
  while (current?.superClass && !seen.has(current)) {
    seen.add(current);
    const superClass: TSESTree.Expression = current.superClass;
    if (kissImportName(superClass, context) !== null) return true;
    if (superClass.type !== AST_NODE_TYPES.Identifier) return false;
    current = classDeclarationOf(superClass, context);
    if (current && isKissActionClass(current, null)) return true;
  }
  return false;
}

/** The class and its superclasses declared in this file, from the class up. */
export function sameFileClassChain(classNode: ClassNode, context: Context): ClassNode[] {
  const chain: ClassNode[] = [];
  let current: ClassNode | null = classNode;
  while (current && !chain.includes(current)) {
    chain.push(current);
    const superClass: TSESTree.Expression | null = current.superClass;
    current = superClass?.type === AST_NODE_TYPES.Identifier ? classDeclarationOf(superClass, context) : null;
  }
  return chain;
}

/** The type of the instances of the class (with type information). */
export function instanceTypeOf(classNode: ClassNode, typeInfo: TypeInfo): ts.Type {
  const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(classNode) as ts.ClassLikeDeclaration;
  return typeInfo.checker.getTypeAtLocation(tsNode);
}

/** The name of the class that declares this member (with type information). */
function ownerName(declaration: ts.Declaration): string | undefined {
  return (declaration.parent as ts.Node & { name?: ts.Identifier })?.name?.text;
}

/** True if the member (with type information) is declared in a class other than `KissAction`. */
function isOverridden(symbol: ts.Symbol | undefined): boolean {
  return !!symbol?.getDeclarations()?.some((declaration) => ownerName(declaration) !== 'KissAction');
}

/** The initializer of the (most derived) property, with type information, if not declared in `KissAction`. */
function propertyInitializer(type: ts.Type, name: string): ts.Expression | null {
  const symbol = type.getProperty(name);
  if (!symbol || !isOverridden(symbol)) return null;
  const declaration = symbol.getDeclarations()?.find((d) => (d as ts.PropertyDeclaration).initializer);
  return (declaration as ts.PropertyDeclaration | undefined)?.initializer ?? null;
}

const isUnsetText = (text: string) => ['null', 'undefined'].includes(text.trim());

/** True if the value is `null` or `undefined`. */
export function isUnsetValue(value: TSESTree.Expression | null): boolean {
  if (!value) return true;
  const node = unwrap(value);
  return (node.type === AST_NODE_TYPES.Literal && node.value === null) ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined');
}

/**
 * The most derived declaration of the property, in the class or its superclasses in this file.
 * Null if not found.
 */
function sameFileProperty(classNode: ClassNode, name: string, context: Context): TSESTree.PropertyDefinition | null {
  for (const node of sameFileClassChain(classNode, context)) {
    const property = findProperty(node, name);
    if (property) return property;
  }
  return null;
}

/**
 * True if the action sets `checkInternet` to a value (not `null` or `undefined`): in the class
 * itself, or inherited from its superclasses in this file (or anywhere, with type information).
 */
export function setsCheckInternet(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) {
    const initializer = propertyInitializer(instanceTypeOf(classNode, typeInfo), 'checkInternet');
    return !!initializer && !isUnsetText(initializer.getText());
  }
  const property = sameFileProperty(classNode, 'checkInternet', context);
  return !!property && !isUnsetValue(property.value);
}

/** True if the class itself declares `checkInternet` with a value (not `null` or `undefined`). */
export function declaresCheckInternet(classNode: ClassNode): TSESTree.PropertyDefinition | null {
  const property = findProperty(classNode, 'checkInternet');
  return property && !isUnsetValue(property.value) ? property : null;
}

/**
 * True if retry may be on: the action sets `retry` (in the class, or inherited), to something
 * other than `{ on: false }`, `null` or `undefined`.
 */
export function mayRetry(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  let text: string | null = null;
  if (typeInfo) {
    text = propertyInitializer(instanceTypeOf(classNode, typeInfo), 'retry')?.getText() ?? null;
  } else {
    const property = sameFileProperty(classNode, 'retry', context);
    if (property?.value) text = context.sourceCode.getText(property.value);
  }
  if (text === null || isUnsetText(text)) return false;
  return !/\bon\s*:\s*false\b/.test(text);
}

/** True if the action overrides `name`, in the class or in its superclasses (or may, when unknown). */
export function overridesMethod(classNode: ClassNode, name: string, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) return isOverridden(instanceTypeOf(classNode, typeInfo).getProperty(name));
  return sameFileClassChain(classNode, context).some((node) => findMethod(node, name) !== null);
}

/**
 * True if the action's `before` is (or may be) async: its own or inherited `before` returns a
 * promise, or the default `before` checks the internet because `checkInternet` is set.
 */
export function hasAsyncBefore(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) {
    const type = instanceTypeOf(classNode, typeInfo);
    const symbol = type.getProperty('before');
    if (isOverridden(symbol)) {
      const declaration = symbol!.getDeclarations()![0];
      const signatures = typeInfo.checker.getTypeOfSymbolAtLocation(symbol!, declaration).getCallSignatures();
      return signatures.some((signature) => mayBeThenable(typeInfo.checker.getReturnTypeOfSignature(signature)));
    }
    return setsCheckInternet(classNode, context, typeInfo);
  }
  for (const node of sameFileClassChain(classNode, context)) {
    const before = findMethod(node, 'before');
    if (before) return isAsyncMethod(before, context, null);
  }
  return setsCheckInternet(classNode, context, null);
}

/**
 * The name of a built-in type, like `'any'`, `'unknown'`, `'null'` or `'undefined'`. Undefined
 * for other types. (The values of `ts.TypeFlags` change between TypeScript versions.)
 */
export function intrinsicName(type: ts.Type): string | undefined {
  return (type as ts.Type & { intrinsicName?: string }).intrinsicName;
}

/** True if the type is, or may be, a promise: a thenable, a union with a thenable, or `any`. */
export function mayBeThenable(type: ts.Type): boolean {
  if (intrinsicName(type) === 'any') return true;
  if (type.isUnion()) return type.types.some((t) => mayBeThenable(t));
  return isThenable(type);
}

/** True if the function has an `await` (or `for await`), not counting nested functions. */
export function hasAwait(body: TSESTree.Node): boolean {
  let found = false;
  walk(body, (node) => {
    if (node.type === AST_NODE_TYPES.AwaitExpression ||
      (node.type === AST_NODE_TYPES.ForOfStatement && node.await)) found = true;
  });
  return found;
}

/** The method body's text contains `super.<name>`, anywhere (also inside arrow functions). */
export function callsSuper(method: TSESTree.MethodDefinition, name: string): boolean {
  let found = false;
  if (!method.value.body) return false;
  walk(method.value.body, (node) => {
    if (node.type === AST_NODE_TYPES.MemberExpression && node.object.type === AST_NODE_TYPES.Super &&
      !node.computed && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === name) found = true;
  }, true);
  return found;
}

/** The method body reads `this.<name>`, anywhere (also inside arrow functions). */
export function readsThisMember(method: TSESTree.MethodDefinition, name: string): boolean {
  let found = false;
  if (!method.value.body) return false;
  walk(method.value.body, (node) => {
    if (node.type === AST_NODE_TYPES.MemberExpression && node.object.type === AST_NODE_TYPES.ThisExpression &&
      !node.computed && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === name) found = true;
  }, true);
  return found;
}

/**
 * If an action that sets `checkInternet` inherits a `before` (from a superclass) that doesn't call
 * `super.before()`, returns the name of that superclass. A `before` that reads `this.checkInternet`
 * is assumed to check the internet by itself. Returns null if the chain is fine, or not known.
 */
export function inheritedBeforeWithoutSuper(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): string | null {
  if (typeInfo) {
    const {checker} = typeInfo;
    let type: ts.Type | undefined = instanceTypeOf(classNode, typeInfo);
    const seen = new Set<ts.Symbol>();
    let first = true;
    while (type) {
      const symbol = type.getProperty('before');
      if (!symbol || !isOverridden(symbol) || seen.has(symbol)) return null;
      seen.add(symbol);
      const declaration = symbol.getDeclarations()![0];
      // Only methods (not, for example, properties with a function).
      const body = (declaration as ts.MethodDeclaration).body;
      if (!body || !('parameters' in declaration)) return null;
      const owner = declaration.parent as ts.ClassLikeDeclaration;
      // The class itself is checked by the caller.
      if (!(first && owner === typeInfo.services.esTreeNodeToTSNodeMap.get(classNode))) {
        const text = body.getText();
        if (/\bthis\s*\.\s*checkInternet\b/.test(text)) return null;
        if (!/\bsuper\s*\.\s*before\b/.test(text)) return owner.name?.text ?? null;
      }
      first = false;
      const ownerType = checker.getTypeAtLocation(owner);
      const bases = ownerType.isClassOrInterface() ? checker.getBaseTypes(ownerType) : [];
      type = bases[0];
    }
    return null;
  }

  for (const node of sameFileClassChain(classNode, context).slice(1)) {
    const before = findMethod(node, 'before');
    if (!before) continue;
    if (readsThisMember(before, 'checkInternet')) return null;
    if (!callsSuper(before, 'before')) return node.id?.name ?? null;
  }
  return null;
}

/** True if the class extends Kiss's `OptimisticCommand`, directly or not. */
export function extendsOptimisticCommand(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) {
    const {checker} = typeInfo;
    const seen = new Set<ts.Type>();
    const visit = (type: ts.Type, isClassItself: boolean): boolean => {
      if (seen.has(type)) return false;
      seen.add(type);
      const target = (type as ts.TypeReference).target ?? type;
      if (!isClassItself && target.getSymbol()?.getName() === 'OptimisticCommand' &&
        checker.getBaseTypes(target as ts.InterfaceType).some((base) =>
          ((base as ts.TypeReference).target ?? base).getSymbol()?.getName() === 'KissAction')) return true;
      const bases = target.isClassOrInterface() ? checker.getBaseTypes(target) : [];
      return bases.some((base) => visit(base, false));
    };
    return visit(instanceTypeOf(classNode, typeInfo), true);
  }
  for (const node of sameFileClassChain(classNode, context)) {
    if (node.superClass && kissImportName(node.superClass, context) === 'OptimisticCommand') return true;
  }
  return false;
}

/**
 * True if `node` is `this.state`, or a member of it (like `this.state.items[0]`), or a member of
 * a variable in `aliases`.
 */
function isRootedAtState(node: TSESTree.Node, aliases: Set<string>): boolean {
  let current = unwrap(node);
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    if (current.object.type === AST_NODE_TYPES.ThisExpression && !current.computed &&
      current.property.type === AST_NODE_TYPES.Identifier && current.property.name === 'state') return true;
    current = unwrap(current.object);
  }
  return current.type === AST_NODE_TYPES.Identifier && aliases.has(current.name);
}

/**
 * True if the code seems to mutate `this.state` (or `param`, the state parameter of a returned
 * function): assigns to it, or to one of its members, deletes one of its members, or calls a
 * method of it (or of one of its members) without using the result, like `this.state.items.push(x)`.
 * Local variables initialized with `this.state` (or one of its members) count as `this.state`.
 */
export function mutatesState(body: TSESTree.Node, param: string | null = null): boolean {
  const aliases = new Set<string>(param ? [param] : []);
  walk(body, (node) => {
    if (node.type === AST_NODE_TYPES.VariableDeclarator && node.id.type === AST_NODE_TYPES.Identifier &&
      node.init && isRootedAtState(node.init, aliases)) aliases.add(node.id.name);
  }, true);

  const isTarget = (target: TSESTree.Node) =>
    unwrap(target).type === AST_NODE_TYPES.MemberExpression && isRootedAtState(target, aliases);

  let found = false;
  walk(body, (node) => {
    if (node.type === AST_NODE_TYPES.AssignmentExpression && isTarget(node.left)) found = true;
    else if (node.type === AST_NODE_TYPES.UpdateExpression && isTarget(node.argument)) found = true;
    else if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'delete' && isTarget(node.argument)) found = true;
    else if (node.type === AST_NODE_TYPES.ExpressionStatement) {
      const expression = unwrap(node.expression);
      if (expression.type === AST_NODE_TYPES.CallExpression) {
        const callee = unwrap(expression.callee);
        if (callee.type === AST_NODE_TYPES.MemberExpression && isRootedAtState(callee.object, aliases)) found = true;
        // `Object.assign(this.state, ...)`
        if (callee.type === AST_NODE_TYPES.MemberExpression && callee.object.type === AST_NODE_TYPES.Identifier &&
          callee.object.name === 'Object' && expression.arguments[0] &&
          isRootedAtState(expression.arguments[0], aliases)) found = true;
      }
    }
  }, true);
  return found;
}

/**
 * The override of `name` declared in the class itself: a method, or a property with a function
 * (like `wrapReduce = (reduce) => ...`).
 */
export function findOverride(classNode: ClassNode, name: string): TSESTree.MethodDefinition | TSESTree.PropertyDefinition | null {
  const method = findMethod(classNode, name);
  if (method) return method;
  const property = findProperty(classNode, name);
  if (property?.value) {
    const value = unwrap(property.value);
    if (value.type === AST_NODE_TYPES.ArrowFunctionExpression || value.type === AST_NODE_TYPES.FunctionExpression) return property;
  }
  return null;
}
