import { AST_NODE_TYPES, TSESLint } from '@typescript-eslint/utils';
import { actionKindOfExpression } from '../actions.js';
import { createRule, getTypeInfo } from '../utils.js';

/**
 * Reports `dispatchSync` of an async action, since `dispatchSync` only accepts sync actions.
 * An action is async if its `reduce` or `before` returns a promise. This includes the default
 * `before`, when the action sets `checkInternet`:
 *
 * ```ts
 * class LoadUser extends Action {
 *   async reduce() { ... }
 * }
 *
 * store.dispatchSync(new LoadUser()); // Error: `reduce` returns a promise.
 * ```
 *
 * The rule only reports when the action's class is known. With type information, that's
 * whenever the type of the action is a specific action class. Without it, the action must be
 * created with `new` (in the call, or in a variable), and its class declared in the same file.
 *
 * Suggestions: replace `dispatchSync` with `dispatch` or `dispatchAndWait`.
 */
export default createRule({
  name: 'dispatch-sync-async-action',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `dispatchSync` of async actions.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      asyncAction:
        '`dispatchSync` only accepts sync actions, but `{{action}}` is async: {{reason}}. ' +
        'Dispatching it throws a `StoreException`.',
      replaceWith: 'Replace with `{{method}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        const callee = node.callee;
        const isDispatchSync =
          (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'dispatchSync') ||
          (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
            callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === 'dispatchSync');
        if (!isDispatchSync) return;

        const action = node.arguments[0];
        if (!action || action.type === AST_NODE_TYPES.SpreadElement) return;

        const result = actionKindOfExpression(action, context, typeInfo);
        if (result.kind !== 'async') return;

        const property = callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : null;
        context.report({
          node: callee,
          messageId: 'asyncAction',
          data: {action: result.className, reason: result.reason},
          suggest: property
            ? ['dispatch', 'dispatchAndWait'].map((method) => ({
              messageId: 'replaceWith' as const,
              data: {method},
              fix: (fixer: TSESLint.RuleFixer) => fixer.replaceText(property, method),
            }))
            : [],
        });
      },
    };
  },
});
