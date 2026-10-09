import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { findMethod, findProperty, isAsyncMethod, isThenable, TypeInfo, unwrap } from './utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * If an action is sync or async. It's `unknown` when its class is not known well enough, for
 * example when the action is typed as `KissAction<State>`, or (without type information) when
 * its class is declared in another file.
 */
export type ActionKind =
  | { kind: 'async', className: string, reason: string }
  | { kind: 'sync', className: string }
  | { kind: 'unknown' };

export const REDUCE_REASON = '`reduce` returns a promise';
export const BEFORE_REASON = '`before` returns a promise';
export const CHECK_INTERNET_REASON = 'it sets `checkInternet`, so its `before` returns a promise';

/**
 * Sync or async, for an expression that is an action, like `new LoadUser()` or `action`.
 * An action is async if its `reduce` or `before` returns a promise. This includes the default
 * `before`, when the action sets `checkInternet`.
 */
export function actionKindOfExpression(action: TSESTree.Expression, context: Context, typeInfo: TypeInfo | null): ActionKind {
  if (typeInfo) {
    const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(action);
    return actionKindOfType(typeInfo.checker.getTypeAtLocation(tsNode), tsNode, typeInfo);
  }

  let expression = unwrap(action);

  // `const action = new LoadUser(); dispatchSync(action);`
  if (expression.type === AST_NODE_TYPES.Identifier) {
    const def = ASTUtils.findVariable(context.sourceCode.getScope(expression), expression.name)?.defs[0];
    if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator || !def.node.init) return {kind: 'unknown'};
    if ((def.parent as TSESTree.VariableDeclaration).kind !== 'const') return {kind: 'unknown'};
    expression = unwrap(def.node.init);
  }
  if (expression.type !== AST_NODE_TYPES.NewExpression || expression.callee.type !== AST_NODE_TYPES.Identifier) return {kind: 'unknown'};
  return actionKindOfClassNode(classDeclarationOf(expression.callee, context), expression.callee.name, context);
}

/**
 * Sync or async, for an expression that is an action class, like `LoadUser` in
 * `useIsWaiting(LoadUser)`.
 */
export function actionKindOfClassReference(classRef: TSESTree.Expression, context: Context, typeInfo: TypeInfo | null): ActionKind {
  const expression = unwrap(classRef);
  if (typeInfo) {
    const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(expression);
    const classType = typeInfo.checker.getTypeAtLocation(tsNode);
    const signatures = classType.getConstructSignatures();
    if (signatures.length === 0) return {kind: 'unknown'};
    // Abstract classes can't be dispatched, so their subclasses decide.
    const declaration = classType.getSymbol()?.valueDeclaration as ts.ClassLikeDeclaration | undefined;
    if (declaration?.modifiers?.some((modifier) => modifier.getText() === 'abstract')) return {kind: 'unknown'};
    const instanceType = typeInfo.checker.getReturnTypeOfSignature(signatures[0]);
    return actionKindOfType(instanceType, tsNode, typeInfo);
  }
  if (expression.type !== AST_NODE_TYPES.Identifier) return {kind: 'unknown'};
  const classNode = classDeclarationOf(expression, context);
  if (classNode?.abstract) return {kind: 'unknown'};
  return actionKindOfClassNode(classNode, expression.name, context);
}

// With type information: looks at the members of the action's type.
function actionKindOfType(type: ts.Type, location: ts.Node, {checker}: TypeInfo): ActionKind {
  const className = type.getSymbol()?.getName() ?? checker.typeToString(type);

  // A member declared in KissAction itself is the default.
  const isOwnMember = (symbol: ts.Symbol | undefined) =>
    !!symbol?.getDeclarations()?.some((declaration) => {
      const owner = declaration.parent as ts.Node & { name?: ts.Identifier };
      return owner?.name?.text !== 'KissAction';
    });

  // True, false, or null if not known.
  const returnsPromise = (name: string): boolean | null => {
    const symbol = type.getProperty(name);
    if (!symbol) return null;
    if (!isOwnMember(symbol)) return false;
    const signatures = checker.getTypeOfSymbolAtLocation(symbol, location).getCallSignatures();
    if (signatures.length === 0) return null;
    const returnTypes = signatures.map((signature) => checker.getReturnTypeOfSignature(signature));
    if (returnTypes.every((returnType) => isThenable(returnType))) return true;
    if (returnTypes.some((returnType) => returnType.isUnion() && returnType.types.some((t) => isThenable(t)))) return null;
    return false;
  };

  const reduce = type.getProperty('reduce');
  // Without its own `reduce`, it's not a specific action class (for example, `KissAction<State>`).
  if (!reduce || !isOwnMember(reduce)) return {kind: 'unknown'};

  const reduceIsAsync = returnsPromise('reduce');
  if (reduceIsAsync) return {kind: 'async', className, reason: REDUCE_REASON};
  const beforeIsAsync = returnsPromise('before');
  if (beforeIsAsync) return {kind: 'async', className, reason: BEFORE_REASON};

  // The default `before` is async when `checkInternet` is set.
  const before = type.getProperty('before');
  const checkInternet = type.getProperty('checkInternet');
  if (before && !isOwnMember(before) && isOwnMember(checkInternet)) {
    const declaration = checkInternet!.getDeclarations()!.find((d) => (d as ts.PropertyDeclaration).initializer);
    const initializer = (declaration as ts.PropertyDeclaration | undefined)?.initializer;
    const isUnset = !initializer || ['null', 'undefined'].includes(initializer.getText());
    if (!isUnset) return {kind: 'async', className, reason: CHECK_INTERNET_REASON};
  }

  if (reduceIsAsync === null || beforeIsAsync === null) return {kind: 'unknown'};
  return {kind: 'sync', className};
}

// Without type information: the class and its superclasses must be declared in this file.
function actionKindOfClassNode(
  start: TSESTree.ClassDeclaration | null,
  className: string,
  context: Context,
): ActionKind {
  let classNode = start;
  let decidedReduce = false;
  let decidedBefore = false;
  let setsCheckInternet = false;
  let reachedKissAction = false;
  const seen = new Set<TSESTree.Node>();

  // From the class to its superclasses: the first class that declares a method decides it.
  while (classNode && !seen.has(classNode)) {
    seen.add(classNode);
    const reduce = findMethod(classNode, 'reduce');
    if (reduce && !decidedReduce) {
      decidedReduce = true;
      if (isAsyncMethod(reduce, context, null)) return {kind: 'async', className, reason: REDUCE_REASON};
    }
    const before = findMethod(classNode, 'before');
    if (before && !decidedBefore) {
      decidedBefore = true;
      if (isAsyncMethod(before, context, null)) return {kind: 'async', className, reason: BEFORE_REASON};
    }
    const checkInternet = findProperty(classNode, 'checkInternet');
    if (checkInternet && !setsCheckInternet && checkInternet.value) {
      const value = unwrap(checkInternet.value);
      setsCheckInternet = !(value.type === AST_NODE_TYPES.Literal && value.value === null) &&
        !(value.type === AST_NODE_TYPES.Identifier && value.name === 'undefined');
    }
    const superClass = classNode.superClass;
    if (superClass && isKissActionReference(superClass)) reachedKissAction = true;
    classNode = superClass?.type === AST_NODE_TYPES.Identifier ? classDeclarationOf(superClass, context) : null;
  }

  if (setsCheckInternet && !decidedBefore) return {kind: 'async', className, reason: CHECK_INTERNET_REASON};

  // Sync only if all the classes are known, up to `KissAction`.
  if (decidedReduce && reachedKissAction) return {kind: 'sync', className};
  return {kind: 'unknown'};
}

// `KissAction`, or `kiss.KissAction` (the type arguments are not part of the expression).
function isKissActionReference(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) return node.name === 'KissAction';
  return node.type === AST_NODE_TYPES.MemberExpression && !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'KissAction';
}

/** The class declaration that the identifier refers to, if it's declared in this file. */
export function classDeclarationOf(identifier: TSESTree.Identifier, context: Context): TSESTree.ClassDeclaration | null {
  const def = ASTUtils.findVariable(context.sourceCode.getScope(identifier), identifier.name)?.defs[0];
  return def?.type === 'ClassName' && def.node.type === AST_NODE_TYPES.ClassDeclaration ? def.node : null;
}
