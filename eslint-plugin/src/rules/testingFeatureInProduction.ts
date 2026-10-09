import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { kissObjectKind, memberPropertyName } from '../storeUsage.js';
import { createRule, getTypeInfo, isTestFile, unwrap } from '../utils.js';

/** The wait methods that the Kiss docs say are only for tests. */
const TEST_WAIT_METHODS = new Set(['waitActionType', 'waitAllActionTypes', 'waitAnyActionTypeFinishes', 'waitActionCondition']);

/**
 * Reports Kiss features meant for tests, used in code that is not a test:
 *
 * ```ts
 * store.mocks.add(LoadUser, () => null);  // Warning
 * store.record.start();                   // Warning
 * await store.waitActionType(LoadUser);   // Warning
 * await store.waitAllActions([]);         // Warning: waits for all actions.
 * await store.waitAllActions([action]);   // OK
 * ```
 *
 * The features are `store.mocks`, `store.record`, the wait methods that the docs say are only
 * for tests (`waitActionType`, `waitAllActionTypes`, `waitAnyActionTypeFinishes` and
 * `waitActionCondition`), and `waitAllActions` with no actions (it waits until no actions are
 * running, which may deadlock). The wait methods are also checked in the store returned by
 * `useStore()`, and in actions (`this.waitActionType(...)`).
 *
 * The store must clearly be a Kiss store. With type information, its type tells. Without it, the
 * store must be created in the same file, with `createStore` or `new Store`, or come from
 * `useStore()`. Not reported in tests.
 */
export default createRule({
  name: 'testing-feature-in-production',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Kiss features meant for tests, outside tests.',
    },
    schema: [],
    messages: {
      mocks:
        '`mocks` is meant for tests. It replaces the actions you dispatch with other actions (or ignores ' +
        'them). Don\'t use it outside tests.',
      record:
        '`record` is meant for tests. It records every state change of every action. Don\'t use it ' +
        'outside tests.',
      waitMethod:
        '`{{method}}` is meant for tests. Outside tests, waiting for actions that other code dispatches ' +
        'can easily deadlock. Use `dispatchAndWait`, or `waitAllActions` with the actions you dispatched.',
      waitAllActions:
        '`waitAllActions` with no actions waits until no actions are running. It\'s meant for tests, ' +
        'and outside tests it can easily deadlock. Pass the actions to wait for, or use `dispatchAndWait`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    return {
      MemberExpression(node) {
        const name = memberPropertyName(node);
        if (name !== 'mocks' && name !== 'record') return;
        if (kissObjectKind(node.object, context, typeInfo) !== 'store') return;
        context.report({node, messageId: name});
      },

      CallExpression(node) {
        const callee = unwrap(node.callee);
        const name = memberPropertyName(callee);
        if (name === null) return;
        const isWaitMethod = TEST_WAIT_METHODS.has(name);
        if (!isWaitMethod && !(name === 'waitAllActions' && hasNoActions(node))) return;
        if (kissObjectKind((callee as TSESTree.MemberExpression).object, context, typeInfo) === null) return;
        if (isWaitMethod) context.report({node: callee, messageId: 'waitMethod', data: {method: name}});
        else context.report({node: callee, messageId: 'waitAllActions'});
      },
    };
  },
});

/** True for `waitAllActions()`, `waitAllActions([])`, `waitAllActions(null)` and `waitAllActions(undefined)`. */
function hasNoActions(call: TSESTree.CallExpression): boolean {
  const first = call.arguments[0];
  if (!first) return true;
  const actions = unwrap(first);
  if (actions.type === AST_NODE_TYPES.ArrayExpression) return actions.elements.length === 0;
  if (actions.type === AST_NODE_TYPES.Literal) return actions.value === null;
  return actions.type === AST_NODE_TYPES.Identifier && actions.name === 'undefined';
}
