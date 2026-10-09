import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { contains, enclosingClass, isFunction, isKissActionClass, kissImportName, TypeInfo, unwrap, isAnyOrUnknown } from './utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

/**
 * What a Kiss object is:
 * - `store`: a `Store`.
 * - `dispatchers`: what `useStore()` returns (it has the dispatch and wait methods of the store).
 * - `action`: a Kiss action (it has the dispatch and wait methods too, like `this.waitCondition`).
 */
export type KissObjectKind = 'store' | 'dispatchers' | 'action';

/** The dispatch methods of the store, of `useStore()`, and of actions. */
export const DISPATCH_METHODS = new Set(['dispatch', 'dispatchAndWait', 'dispatchSync', 'dispatchWhen', 'dispatchAll', 'dispatchAndWaitAll']);

/** The hooks that return a dispatch function, and the method they're equivalent to. */
export const DISPATCH_HOOKS: Record<string, string> = {
  useDispatch: 'dispatch',
  useDispatcher: 'dispatch',
  useDispatchAndWait: 'dispatchAndWait',
  useDispatchSync: 'dispatchSync',
  useDispatchWhen: 'dispatchWhen',
  useDispatchAll: 'dispatchAll',
  useDispatchAndWaitAll: 'dispatchAndWaitAll',
};

/** The name of a non-computed member, like `dispatch` in `store.dispatch`. */
export function memberPropertyName(node: TSESTree.Node): string | null {
  if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed) return null;
  return node.property.type === AST_NODE_TYPES.Identifier ? node.property.name : null;
}

/**
 * What Kiss object the expression is, or null if it's not one (or it's not known).
 *
 * With type information, it's decided by the type. Without it (or when the type is `any`), the
 * expression must clearly be a Kiss object:
 * - A `const` initialized with `createStore(...)` or `new Store(...)` (a store), or
 *   `useStore()` (dispatchers), imported from Kiss.
 * - `useStore()` itself.
 * - `this` inside a method of a Kiss action (an action), and `this.store` (a store).
 * - `x.store`, where `x` is what `useStore()` returns (a store).
 */
export function kissObjectKind(node: TSESTree.Node, context: Context, typeInfo: TypeInfo | null): KissObjectKind | null {
  const expression = unwrap(node);
  if (typeInfo) {
    const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(expression);
    const type = typeInfo.checker.getTypeAtLocation(tsNode);
    if (!isAnyType(type)) return kissObjectKindOfType(type, typeInfo.checker);
  }
  return kissObjectKindSyntactic(expression, context, typeInfo);
}

function isAnyType(type: ts.Type): boolean {
  return isAnyOrUnknown(type);
}

/** With type information: a `Store`, what `useStore()` returns, or a Kiss action. */
export function kissObjectKindOfType(type: ts.Type, checker: ts.TypeChecker): KissObjectKind | null {
  // The apparent type turns `this` (a type parameter) into the class.
  const nonNullable = checker.getApparentType(checker.getNonNullableType(type));
  const target = (nonNullable as ts.TypeReference).target ?? nonNullable;
  const name = target.getSymbol()?.getName();
  const has = (property: string) => nonNullable.getProperty(property) !== undefined;
  if (name === 'Store' && has('mocks') && has('dispatchAndWait') && has('waitCondition')) return 'store';
  if (name === 'StoreDispatchers' && has('store') && has('dispatchAndWait')) return 'dispatchers';
  if (extendsKissAction(nonNullable, checker, new Set())) return 'action';
  return null;
}

/** True if the type is `KissAction`, or a class that extends it (directly or not). */
export function extendsKissAction(type: ts.Type, checker: ts.TypeChecker, seen: Set<ts.Type>): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  const target = (type as ts.TypeReference).target ?? type;
  if (target.getSymbol()?.getName() === 'KissAction') return true;
  const bases = target.isClassOrInterface() ? checker.getBaseTypes(target) : [];
  return bases.some((base) => extendsKissAction(base, checker, seen));
}

/** True if the type is Kiss's `ActionStatus`. */
export function isActionStatusType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const nonNullable = checker.getNonNullableType(type);
  return nonNullable.getSymbol()?.getName() === 'ActionStatus' &&
    nonNullable.getProperty('hasFinishedMethodAfter') !== undefined &&
    nonNullable.getProperty('isCompletedOk') !== undefined;
}

function kissObjectKindSyntactic(expression: TSESTree.Node, context: Context, typeInfo: TypeInfo | null): KissObjectKind | null {
  if (expression.type === AST_NODE_TYPES.ThisExpression) {
    return isThisOfKissAction(expression, typeInfo) ? 'action' : null;
  }
  if (expression.type === AST_NODE_TYPES.MemberExpression && memberPropertyName(expression) === 'store') {
    const objectKind = kissObjectKindSyntactic(unwrap(expression.object), context, typeInfo);
    return objectKind === 'action' || objectKind === 'dispatchers' ? 'store' : null;
  }
  if (expression.type === AST_NODE_TYPES.Identifier) {
    const init = constInitializer(expression, context);
    return init ? kissObjectKindOfCreation(init, context) : null;
  }
  return kissObjectKindOfCreation(expression, context);
}

/** `createStore(...)` or `new Store(...)` is a store, and `useStore()` is dispatchers. */
function kissObjectKindOfCreation(node: TSESTree.Node, context: Context): KissObjectKind | null {
  const expression = unwrap(node);
  if (expression.type === AST_NODE_TYPES.NewExpression && kissImportName(expression.callee, context) === 'Store') return 'store';
  if (expression.type !== AST_NODE_TYPES.CallExpression) return null;
  const name = kissImportName(expression.callee, context);
  if (name === 'createStore') return 'store';
  if (name === 'useStore') return 'dispatchers';
  return null;
}

/** The initializer of the `const` the identifier refers to, if any. */
export function constInitializer(identifier: TSESTree.Identifier, context: Context): TSESTree.Expression | null {
  const variable = ASTUtils.findVariable(context.sourceCode.getScope(identifier), identifier.name);
  const def = variable?.defs[0];
  if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator || !def.node.init) return null;
  if (def.node.id.type !== AST_NODE_TYPES.Identifier) return null;
  if ((def.parent as TSESTree.VariableDeclaration).kind !== 'const') return null;
  return def.node.init;
}

/**
 * True if `this` is a Kiss action: it's inside a method (or a property initializer) of a class
 * that is a Kiss action, and not inside a nested `function`.
 */
export function isThisOfKissAction(node: TSESTree.ThisExpression, typeInfo: TypeInfo | null): boolean {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (current.type === AST_NODE_TYPES.FunctionExpression || current.type === AST_NODE_TYPES.FunctionDeclaration) {
      const parent = current.parent;
      if (parent?.type !== AST_NODE_TYPES.MethodDefinition || parent.static) return false;
      break;
    }
    if (current.type === AST_NODE_TYPES.PropertyDefinition) {
      if (current.static) return false;
      break;
    }
    if (current.type === AST_NODE_TYPES.ClassDeclaration || current.type === AST_NODE_TYPES.ClassExpression) return false;
    current = current.parent;
  }
  if (!current) return false;
  const classNode = enclosingClass(current);
  return classNode !== null && isKissActionClass(classNode, typeInfo);
}

/**
 * If the call dispatches with Kiss, returns the dispatch method (like `dispatch` or
 * `dispatchAndWait`). That's a dispatch method of a Kiss object (see `kissObjectKind`), or a
 * function returned by a dispatch hook, like `const dispatch = useDispatch()`.
 *
 * With `acceptAnyReceiver`, any `x.dispatch(...)` (with a dispatch method name) is accepted,
 * unless type information says `x` is not a Kiss object.
 */
export function kissDispatchMethod(
  call: TSESTree.CallExpression,
  context: Context,
  typeInfo: TypeInfo | null,
  acceptAnyReceiver = false,
): string | null {
  const callee = unwrap(call.callee);
  const property = memberPropertyName(callee);
  if (property !== null) {
    if (!DISPATCH_METHODS.has(property)) return null;
    const object = (callee as TSESTree.MemberExpression).object;
    const kind = kissObjectKind(object, context, typeInfo);
    if (kind !== null) return property;
    if (!acceptAnyReceiver) return null;
    if (typeInfo && !isAnyType(typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(unwrap(object))))) return null;
    return property;
  }
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const init = constInitializer(callee, context);
    return init ? dispatchHookMethod(init, context) : null;
  }
  // `useDispatchWhen()(...)`.
  return dispatchHookMethod(callee, context);
}

/** If the expression is a call to a dispatch hook, like `useDispatch()`, its dispatch method. */
function dispatchHookMethod(node: TSESTree.Node, context: Context): string | null {
  const expression = unwrap(node);
  if (expression.type !== AST_NODE_TYPES.CallExpression) return null;
  const name = kissImportName(expression.callee, context);
  return name !== null && Object.prototype.hasOwnProperty.call(DISPATCH_HOOKS, name) ? DISPATCH_HOOKS[name] : null;
}

/** The actions a dispatch call dispatches: its first argument, or the items of the array for `dispatchAll`. */
export function dispatchedActions(call: TSESTree.CallExpression, method: string): TSESTree.Expression[] {
  const first = call.arguments[0];
  if (!first || first.type === AST_NODE_TYPES.SpreadElement) return [];
  if (method === 'dispatchAll' || method === 'dispatchAndWaitAll') {
    const array = unwrap(first);
    if (array.type !== AST_NODE_TYPES.ArrayExpression) return [];
    return array.elements.filter((element): element is TSESTree.Expression =>
      element !== null && element.type !== AST_NODE_TYPES.SpreadElement);
  }
  return [first];
}

/** The nearest function that contains the node, or null at the top level of the module. */
export function enclosingFunction(node: TSESTree.Node): FunctionNode | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (isFunction(current)) return current;
    current = current.parent;
  }
  return null;
}

/** True if `a` and `b` can't both run: they're in different branches of an `if`, `?:`, `switch`, or `try`/`catch`. */
export function areInExclusiveBranches(a: TSESTree.Node, b: TSESTree.Node, root: TSESTree.Node | null): boolean {
  for (let parent = a.parent; parent && parent !== root; parent = parent.parent) {
    if (!contains(parent, b)) continue;
    switch (parent.type) {
      case AST_NODE_TYPES.IfStatement:
      case AST_NODE_TYPES.ConditionalExpression: {
        const {consequent, alternate} = parent;
        if (!alternate) break;
        if ((contains(consequent, a) && contains(alternate, b)) || (contains(alternate, a) && contains(consequent, b))) return true;
        break;
      }
      case AST_NODE_TYPES.SwitchStatement: {
        const caseOfA = parent.cases.find((c) => contains(c, a));
        const caseOfB = parent.cases.find((c) => contains(c, b));
        if (caseOfA && caseOfB && caseOfA !== caseOfB) return true;
        break;
      }
      case AST_NODE_TYPES.TryStatement: {
        const {block, handler} = parent;
        if (handler && ((contains(block, a) && contains(handler, b)) || (contains(handler, a) && contains(block, b)))) return true;
        break;
      }
    }
    return false;
  }
  return false;
}

/** The statement that contains the node, and is directly inside a block, a `switch` case, or the module. */
export function statementInList(node: TSESTree.Node): TSESTree.Statement | null {
  let current: TSESTree.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if (parent.type === AST_NODE_TYPES.BlockStatement || parent.type === AST_NODE_TYPES.Program ||
      parent.type === AST_NODE_TYPES.SwitchCase && parent.consequent.includes(current as TSESTree.Statement)) {
      return current as TSESTree.Statement;
    }
    if (isFunction(parent)) return null;
    current = parent;
  }
  return null;
}

/** The statements of a block, a `switch` case, or the module. */
export function statementsOf(node: TSESTree.Node): TSESTree.Node[] {
  if (node.type === AST_NODE_TYPES.BlockStatement || node.type === AST_NODE_TYPES.Program) return node.body;
  if (node.type === AST_NODE_TYPES.SwitchCase) return node.consequent;
  return [];
}

/** True for `return`, `throw`, `break` and `continue`. */
export function isJump(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.ReturnStatement || node.type === AST_NODE_TYPES.ThrowStatement ||
    node.type === AST_NODE_TYPES.BreakStatement || node.type === AST_NODE_TYPES.ContinueStatement;
}

/** The indentation of the line where the node starts. */
export function indentationOf(node: TSESTree.Node, context: Context): string {
  const line = context.sourceCode.lines[node.loc.start.line - 1];
  return /^\s*/.exec(line)![0];
}
