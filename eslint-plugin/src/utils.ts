import { AST_NODE_TYPES, ASTUtils, ESLintUtils, ParserServicesWithTypeInformation, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

export const KISS_PACKAGE = 'kiss-for-react';

export const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/marcglasberg/kiss-for-react/tree/main/eslint-plugin#${name}`,
);

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

export interface TypeInfo {
  services: ParserServicesWithTypeInformation;
  checker: ts.TypeChecker;
}

/**
 * Returns the type checker, or null if the code is linted without type information.
 * The rules work without type information, but with it they find more problems.
 */
export function getTypeInfo(context: Context): TypeInfo | null {
  try {
    const services = ESLintUtils.getParserServices(context, true);
    if (!services.program) return null;
    return {services: services as ParserServicesWithTypeInformation, checker: services.program.getTypeChecker()};
  } catch {
    return null;
  }
}

/** Removes TypeScript wrappers like `x as T`, `x satisfies T` and `x!`. */
export function unwrap(node: TSESTree.Node): TSESTree.Node {
  while (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion
    ) {
    node = node.expression;
  }
  return node;
}

export function isFunction(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration {
  return node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration;
}

/**
 * Visits all the nodes inside `root`, in source order. Doesn't go into nested functions
 * (or classes), unless `intoFunctions` is true.
 */
export function walk(
  root: TSESTree.Node,
  visit: (node: TSESTree.Node) => void,
  intoFunctions = false,
): void {
  const visitNode = (node: TSESTree.Node, isRoot: boolean) => {
    if (!isRoot && !intoFunctions && (isFunction(node) ||
      node.type === AST_NODE_TYPES.ClassDeclaration || node.type === AST_NODE_TYPES.ClassExpression)) return;
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as any)[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visitNode(child, false);
      } else if (value && typeof value.type === 'string') {
        visitNode(value, false);
      }
    }
  };
  visitNode(root, true);
}

/** The expressions a function returns: its expression body, or the arguments of its `return`s. */
export function returnedExpressions(fn: TSESTree.FunctionLike): TSESTree.Expression[] {
  if (!fn.body) return [];
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) return [fn.body as TSESTree.Expression];
  const result: TSESTree.Expression[] = [];
  walk(fn.body, (node) => {
    if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) result.push(node.argument);
  });
  return result;
}

/** True if the node is `this.state`. */
export function isThisState(node: TSESTree.Node): node is TSESTree.MemberExpression {
  return node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.object.type === AST_NODE_TYPES.ThisExpression &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === 'state';
}

/** The name of a class member (method or property), if it's a simple name. */
export function memberName(member: TSESTree.ClassElement): string | null {
  if (!('key' in member) || member.computed) return null;
  if (member.key.type === AST_NODE_TYPES.Identifier) return member.key.name;
  if (member.key.type === AST_NODE_TYPES.Literal && typeof member.key.value === 'string') return member.key.value;
  return null;
}

/** The non-static method with the given name, declared in the class itself. */
export function findMethod(classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression, name: string): TSESTree.MethodDefinition | null {
  for (const member of classNode.body.body) {
    if (member.type === AST_NODE_TYPES.MethodDefinition && !member.static && member.kind === 'method' &&
      memberName(member) === name) return member;
  }
  return null;
}

/** The non-static property with the given name, declared in the class itself. */
export function findProperty(classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression, name: string): TSESTree.PropertyDefinition | null {
  for (const member of classNode.body.body) {
    if (member.type === AST_NODE_TYPES.PropertyDefinition && !member.static && !member.declare &&
      memberName(member) === name) return member;
  }
  return null;
}

/**
 * True if the method is async: it has the `async` keyword, or (without type information) its
 * declared return type is a `Promise`, or (with type information) it returns a promise.
 */
export function isAsyncMethod(method: TSESTree.MethodDefinition, context: Context, typeInfo: TypeInfo | null): boolean {
  if (method.value.async) return true;
  if (typeInfo) {
    const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(method) as ts.MethodDeclaration;
    const signature = typeInfo.checker.getSignatureFromDeclaration(tsNode);
    if (signature) return isThenable(typeInfo.checker.getReturnTypeOfSignature(signature));
  }
  const returnType = method.value.returnType;
  if (!returnType) return false;
  return /\bPromise\s*</.test(context.sourceCode.getText(returnType));
}

/**
 * The name of a TypeScript intrinsic type, like `any`, `unknown`, `undefined`, `null`, `string`
 * or `never`, or `undefined` if it's not intrinsic. (We don't use `type.flags`, because the
 * values of `ts.TypeFlags` change between TypeScript versions.)
 */
export function intrinsicName(type: ts.Type): string | undefined {
  return (type as ts.Type & { intrinsicName?: string }).intrinsicName;
}

/** True if the type is `any` or `unknown`. */
export function isAnyOrUnknown(type: ts.Type): boolean {
  const name = intrinsicName(type);
  return name === 'any' || name === 'unknown';
}

/** True if the type is a promise (or a union of promises). */
export function isThenable(type: ts.Type): boolean {
  if (type.isUnion()) return type.types.every((t) => isThenable(t));
  return type.getProperty('then') !== undefined;
}

/**
 * True if the class is a Kiss action. With type information, it must extend `KissAction`,
 * directly or not. Without it, it must extend some class, and declare a `reduce` method.
 */
export function isKissActionClass(
  classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
  typeInfo: TypeInfo | null,
): boolean {
  if (!classNode.superClass) return false;
  if (!typeInfo) return findMethod(classNode, 'reduce') !== null;
  const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(classNode) as ts.ClassLikeDeclaration;
  const type = typeInfo.checker.getTypeAtLocation(tsNode);
  return extendsKissAction(type, typeInfo.checker, new Set());
}

function extendsKissAction(type: ts.Type, checker: ts.TypeChecker, seen: Set<ts.Type>): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  const target = (type as ts.TypeReference).target ?? type;
  if (target.getSymbol()?.getName() === 'KissAction') return true;
  const bases = target.isClassOrInterface() ? checker.getBaseTypes(target) : [];
  return bases.some((base) => extendsKissAction(base, checker, seen));
}

/**
 * If `node` refers to a function exported by Kiss (imported by name from 'kiss-for-react', or
 * used as `kiss.name` with `import * as kiss from 'kiss-for-react'`), returns its exported name.
 */
export function kissImportName(node: TSESTree.Node, context: Context): string | null {
  const scope = context.sourceCode.getScope(node);
  if (node.type === AST_NODE_TYPES.Identifier) {
    const def = ASTUtils.findVariable(scope, node.name)?.defs[0];
    if (!def || def.type !== 'ImportBinding') return null;
    if (def.node.type !== AST_NODE_TYPES.ImportSpecifier) return null;
    if ((def.parent as TSESTree.ImportDeclaration).source.value !== KISS_PACKAGE) return null;
    const imported = def.node.imported;
    return imported.type === AST_NODE_TYPES.Identifier ? imported.name : String(imported.value);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed &&
    node.object.type === AST_NODE_TYPES.Identifier && node.property.type === AST_NODE_TYPES.Identifier) {
    const def = ASTUtils.findVariable(scope, node.object.name)?.defs[0];
    if (!def || def.type !== 'ImportBinding') return null;
    if (def.node.type !== AST_NODE_TYPES.ImportNamespaceSpecifier) return null;
    if ((def.parent as TSESTree.ImportDeclaration).source.value !== KISS_PACKAGE) return null;
    return node.property.name;
  }
  return null;
}

/** The enclosing class of a node (the class whose method contains it), if any. */
export function enclosingClass(node: TSESTree.Node): TSESTree.ClassDeclaration | TSESTree.ClassExpression | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (current.type === AST_NODE_TYPES.ClassDeclaration || current.type === AST_NODE_TYPES.ClassExpression) return current;
    current = current.parent;
  }
  return null;
}

/**
 * True if the linted file is a test: its name ends with `.test` or `.spec` (like
 * `user.test.ts`), or it's inside a `__tests__` directory.
 */
export function isTestFile(context: Context): boolean {
  const filename = context.filename.replace(/\\/g, '/');
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(filename) || /(^|\/)__tests__\//.test(filename);
}

/** True if `inner` is inside `outer` (or is `outer`). */
export function contains(outer: TSESTree.Node, inner: TSESTree.Node): boolean {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}
