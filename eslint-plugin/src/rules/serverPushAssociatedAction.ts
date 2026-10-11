import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { classDeclarationOf } from '../actions.js';
import {
  ClassNode,
  classChain,
  findMemberInChain,
  instanceTypeOfClass,
  isDeclaredByUser,
  userDeclarations,
} from '../actionFeatures.js';
import { createRule, findMethod, getTypeInfo, returnedExpressions, TypeInfo, unwrap } from '../utils.js';
import { isServerPush } from './incompatibleActionFeatures.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

// TypeScript flags (their values are stable across TypeScript versions).
const SYMBOL_FLAGS_CLASS = 32; // ts.SymbolFlags.Class
const SYMBOL_FLAGS_ALIAS = 2097152; // ts.SymbolFlags.Alias

const COMPUTE_KEY = 'computeOptimisticSyncKey';
const KEY_PARAMS = 'optimisticSyncKeyParams';

/**
 * A class: its name, if it's abstract, and if it (or its superclasses) declares a method. The
 * result is `null` when that's not known.
 */
interface ClassInfo {
  name: string;
  abstract: boolean;
  declares(method: string): boolean | null;
}

/**
 * Reports a `ServerPush` whose key never matches the key of its associated action, the
 * `OptimisticSyncWithPush` class that `associatedAction()` returns. Its pushes are then never
 * matched with that action's requests:
 *
 * ```ts
 * class ToggleLike extends OptimisticSyncWithPush<State, boolean> {
 *   optimisticSyncKeyParams() { return this.itemId; }
 *   ...
 * }
 *
 * class PushLike extends ServerPush<State> {
 *   associatedAction() { return ToggleLike; } // Error: no `optimisticSyncKeyParams()`.
 *   ...
 * }
 * ```
 *
 * By default, the key of an `OptimisticSyncWithPush` is `[this.constructor, optimisticSyncKeyParams()]`,
 * and the key of a `ServerPush` is `[associatedAction(), optimisticSyncKeyParams()]`. They don't
 * match when:
 *
 * - `associatedAction()` returns an abstract class. The actions dispatched are of its subclasses,
 *   so their keys use the subclasses. Not reported if the push overrides `computeOptimisticSyncKey()`.
 * - The associated action overrides `computeOptimisticSyncKey()`, and the push doesn't.
 * - Only one of them overrides `optimisticSyncKeyParams()` (checked in concrete push classes only,
 *   and when neither overrides `computeOptimisticSyncKey()`).
 *
 * The methods inherited from superclasses count too. `associatedAction()` must return a class
 * directly, like `return ToggleLike;`. Without type information, that class (and the
 * superclasses of both) must be declared in the same file. A class that is not an
 * `OptimisticSyncWithPush` is already a TypeScript error, so it's not reported here. Also
 * reported in tests.
 */
export default createRule({
  name: 'server-push-associated-action',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require the key of a `ServerPush` to match the key of its associated action.',
    },
    schema: [],
    messages: {
      abstractClass:
        '`{{target}}` is abstract, so the actions dispatched are of its subclasses, and their keys use ' +
        'their own class. The key of this push never matches them. Return the class of the action ' +
        'that is dispatched.',
      customKey:
        '`{{target}}` overrides `computeOptimisticSyncKey()`, but this push doesn\'t, so the key of this ' +
        'push never matches it. Override `computeOptimisticSyncKey()` here too, to compute the same key.',
      keyParamsInTarget:
        '`{{target}}` overrides `optimisticSyncKeyParams()`, but this push doesn\'t, so the key of this ' +
        'push never matches it. Override `optimisticSyncKeyParams()` here too, returning the same params.',
      keyParamsInPush:
        'This push overrides `optimisticSyncKeyParams()`, but `{{target}}` doesn\'t, so the key of this ' +
        'push never matches it. Both must return the same params.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const own = findMethod(classNode, 'associatedAction');
      if (!own && classNode.abstract) return;
      if (!isServerPush(classNode, context, typeInfo)) return;

      const found = associatedActionOf(classNode, own, context, typeInfo);
      if (!found) return;
      const {target, node} = found;
      const push = classInfo(classNode, context, typeInfo);
      const pushComputesKey = push.declares(COMPUTE_KEY);
      const report = (messageId: 'abstractClass' | 'customKey' | 'keyParamsInTarget' | 'keyParamsInPush') =>
        context.report({node: node ?? classNode.id ?? classNode, messageId, data: {target: target.name}});

      // `associatedAction()` itself: reported in the class that declares it.
      if (own) {
        if (target.abstract && pushComputesKey === false) return report('abstractClass');
        if (target.declares(COMPUTE_KEY) === true && pushComputesKey === false) return report('customKey');
      }
      if (target.abstract) return;

      // The key params: reported in the concrete classes.
      if (classNode.abstract || pushComputesKey !== false || target.declares(COMPUTE_KEY) !== false) return;
      const pushParams = push.declares(KEY_PARAMS);
      const targetParams = target.declares(KEY_PARAMS);
      if (pushParams === null || targetParams === null || pushParams === targetParams) return;
      report(targetParams ? 'keyParamsInTarget' : 'keyParamsInPush');
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/**
 * The class that `associatedAction()` returns, and the node to report (its `return` value, when
 * the class declares `associatedAction()` itself).
 */
function associatedActionOf(
  classNode: ClassNode,
  own: TSESTree.MethodDefinition | null,
  context: Context,
  typeInfo: TypeInfo | null,
): { target: ClassInfo, node: TSESTree.Node | null } | null {
  // Declared in this file: in the class itself, or (without type information) in a superclass.
  let method: TSESTree.Node | null = own;
  if (!method && !typeInfo) method = findMemberInChain(classChain(classNode, context), 'associatedAction');
  if (method) {
    if (method.type !== AST_NODE_TYPES.MethodDefinition) return null;
    const returned = returnedExpressions(method.value);
    if (returned.length !== 1) return null;
    const expression = unwrap(returned[0]);
    if (expression.type !== AST_NODE_TYPES.Identifier) return null;
    const node = own ? expression : null;
    if (typeInfo) {
      const target = classInfoOfSymbol(symbolOf(typeInfo.services.esTreeNodeToTSNodeMap.get(expression), typeInfo.checker), typeInfo);
      return target ? {target, node} : null;
    }
    const targetNode = classDeclarationOf(expression, context);
    return targetNode ? {target: classInfo(targetNode, context, null), node} : null;
  }

  // Inherited, with type information.
  if (!typeInfo) return null;
  const declaration = userDeclarations(instanceTypeOfClass(classNode, typeInfo), 'associatedAction')[0] as ts.MethodDeclaration | undefined;
  const statements = declaration?.body?.statements;
  const statement = statements?.length === 1 ? statements[0] as ts.ReturnStatement : null;
  if (!statement?.expression || !statement.getText(declaration!.getSourceFile()).startsWith('return')) return null;
  const target = classInfoOfSymbol(symbolOf(statement.expression, typeInfo.checker), typeInfo);
  return target ? {target, node: null} : null;
}

/** A class declared in this file. */
function classInfo(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): ClassInfo {
  const name = classNode.id?.name ?? 'this action';
  if (typeInfo) {
    const type = instanceTypeOfClass(classNode, typeInfo);
    return {name, abstract: !!classNode.abstract, declares: (method) => isDeclaredByUser(type, method)};
  }
  const chain = classChain(classNode, context);
  return {
    name,
    abstract: !!classNode.abstract,
    declares: (method) => findMemberInChain(chain, method) ? true : chain.end !== null ? false : null,
  };
}

/** A class, from its symbol (with type information). */
function classInfoOfSymbol(symbol: ts.Symbol | undefined, {checker}: TypeInfo): ClassInfo | null {
  if (!symbol || (symbol.flags & SYMBOL_FLAGS_CLASS) === 0) return null;
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const declaration = symbol.valueDeclaration as ts.ClassLikeDeclaration | undefined;
  const isAbstract = !!declaration?.modifiers?.some((modifier) => modifier.getText() === 'abstract');
  return {name: symbol.getName(), abstract: isAbstract, declares: (method) => isDeclaredByUser(type, method)};
}

/** The symbol of an identifier, following imports. */
function symbolOf(node: ts.Node, checker: ts.TypeChecker): ts.Symbol | undefined {
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol && (symbol.flags & SYMBOL_FLAGS_ALIAS) !== 0) symbol = checker.getAliasedSymbol(symbol);
  return symbol;
}
