import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { classDeclarationOf } from '../actions.js';
import {
  initializerTextOf,
  isUnlimitedRetryCheckInternetOn,
  retryOf,
  retryOfClass,
  unlimitedRetryCheckInternetOfClass,
} from '../actionFeatures.js';
import type * as ts from 'typescript';
import { kissDispatchMethod } from '../storeUsage.js';
import { createRule, getTypeInfo, isTestFile, TypeInfo, unwrap } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports `dispatchAndWait` and `dispatchAndWaitAll` with an action that retries forever, with
 * `retry = { maxRetries: -1 }`, `retry = { unlimitedRetries: true }`, or
 * `unlimitedRetryCheckInternet`:
 *
 * ```ts
 * class LoadText extends Action {
 *   retry = { maxRetries: -1 };
 *   async reduce() { ... }
 * }
 *
 * await store.dispatchAndWait(new LoadText()); // Warning
 * store.dispatch(new LoadText());              // OK
 * ```
 *
 * The promise never resolves while the action keeps failing (or, with
 * `unlimitedRetryCheckInternet`, while there is no internet).
 *
 * It checks any call to a method or function called `dispatchAndWait` or `dispatchAndWaitAll`,
 * and the functions returned by `useDispatchAndWait()` and `useDispatchAndWaitAll()`, whatever
 * their names. The action's class must be known: with type information, from the action's type.
 * Without it, the action must be created with `new` (in the call, or in a `const`), and its class
 * (and the superclasses up to the one with the feature) must be declared in the same file. The
 * array of `dispatchAndWaitAll` can be written in the call or in a `const`, or, with type
 * information, be any array or tuple of actions. Not reported in tests.
 */
export default createRule({
  name: 'dispatch-and-wait-unlimited-retries',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `dispatchAndWait` and `dispatchAndWaitAll` with actions that retry forever.',
    },
    schema: [],
    messages: {
      unlimitedRetries:
        '`{{action}}` retries forever (`{{option}}`), so the promise of `{{method}}` never resolves ' +
        'while the action keeps failing. Use `dispatch`, or limit the retries.',
      unlimitedRetryCheckInternet:
        '`{{action}}` uses `unlimitedRetryCheckInternet`, so it retries forever, and the promise of ' +
        '`{{method}}` never resolves while there is no internet, or while the action keeps failing. ' +
        'Use `dispatch`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        const callee = node.callee;
        const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name
          : callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier ? callee.property.name : null;
        const method = name === 'dispatchAndWait' || name === 'dispatchAndWaitAll' ? name
          : kissDispatchMethod(node, context, typeInfo);
        if (method !== 'dispatchAndWait' && method !== 'dispatchAndWaitAll') return;

        const argument = node.arguments[0];
        if (!argument || argument.type === AST_NODE_TYPES.SpreadElement) return;

        const report = (action: TSESTree.Node, result: { className: string, option: string }) => context.report({
          node: action,
          messageId: result.option === UNLIMITED_RETRY_CHECK_INTERNET ? 'unlimitedRetryCheckInternet' : 'unlimitedRetries',
          data: {action: result.className, option: result.option, method},
        });

        if (method === 'dispatchAndWait') {
          const result = unlimitedRetriesOf(argument, context, typeInfo);
          if (result) report(argument, result);
          return;
        }

        // `dispatchAndWaitAll`: the array written in the call, or in a `const`.
        const array = arrayLiteralOf(argument, context);
        if (array) {
          for (const action of array.elements) {
            if (!action || action.type === AST_NODE_TYPES.SpreadElement) continue;
            const result = unlimitedRetriesOf(action, context, typeInfo);
            if (result) report(action, result);
          }
          return;
        }

        // With type information, any array or tuple of actions.
        if (!typeInfo) return;
        const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(argument));
        const elementType = type.getNumberIndexType();
        if (!elementType) return;
        const reported = new Set<string>();
        for (const actionType of elementType.isUnion() ? elementType.types : [elementType]) {
          const result = unlimitedRetriesOfType(actionType);
          if (!result || reported.has(result.className)) continue;
          reported.add(result.className);
          report(argument, result);
        }
      },
    };
  },
});

const UNLIMITED_RETRY_CHECK_INTERNET = 'unlimitedRetryCheckInternet';

/** The array literal of the expression: written there, or in a `const` it refers to. */
function arrayLiteralOf(expression: TSESTree.Expression, context: Context): TSESTree.ArrayExpression | null {
  let node = unwrap(expression);
  if (node.type === AST_NODE_TYPES.Identifier) {
    const def = ASTUtils.findVariable(context.sourceCode.getScope(node), node.name)?.defs[0];
    if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator || !def.node.init) return null;
    if ((def.parent as TSESTree.VariableDeclaration).kind !== 'const') return null;
    node = unwrap(def.node.init);
  }
  return node.type === AST_NODE_TYPES.ArrayExpression ? node : null;
}

/** If the action type retries forever: its class name, and the option that does it. */
function unlimitedRetriesOfType(type: ts.Type): { className: string, option: string } | null {
  const text = initializerTextOf(type, 'retry');
  const unlimited = initializerTextOf(type, UNLIMITED_RETRY_CHECK_INTERNET);
  const option = unlimited !== null && isUnlimitedRetryCheckInternetOn(unlimited) ? UNLIMITED_RETRY_CHECK_INTERNET
    : text === null ? null : retryOf(text).unlimited;
  const className = type.getSymbol()?.getName();
  return option && className ? {className, option} : null;
}

/**
 * If the action retries forever: its class name, and the option that does it (an option of
 * `retry`, or `unlimitedRetryCheckInternet`).
 */
function unlimitedRetriesOf(
  action: TSESTree.Expression,
  context: Context,
  typeInfo: TypeInfo | null,
): { className: string, option: string } | null {
  if (typeInfo) {
    const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(action));
    return type.isUnion() ? null : unlimitedRetriesOfType(type);
  }

  // `const action = new LoadText(); dispatchAndWait(action);`
  let expression = unwrap(action);
  if (expression.type === AST_NODE_TYPES.Identifier) {
    const def = ASTUtils.findVariable(context.sourceCode.getScope(expression), expression.name)?.defs[0];
    if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator || !def.node.init) return null;
    if ((def.parent as TSESTree.VariableDeclaration).kind !== 'const') return null;
    expression = unwrap(def.node.init);
  }
  if (expression.type !== AST_NODE_TYPES.NewExpression || expression.callee.type !== AST_NODE_TYPES.Identifier) return null;
  const classNode = classDeclarationOf(expression.callee, context);
  if (!classNode) return null;
  const option = unlimitedRetryCheckInternetOfClass(classNode, context, null) ? UNLIMITED_RETRY_CHECK_INTERNET
    : retryOfClass(classNode, context, null)?.unlimited;
  return option ? {className: expression.callee.name, option} : null;
}
