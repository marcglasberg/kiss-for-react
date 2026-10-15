import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { isActionClass } from '../actionMethods.js';
import { classDeclarationOf } from '../actions.js';
import { constInitializer, kissObjectKindOfType, memberPropertyName } from '../storeUsage.js';
import { createRule, getTypeInfo, isAnyOrUnknown, TypeInfo, unwrap } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * The lifecycle methods of the actions, which Kiss calls when the action is dispatched. They are
 * `protected` in `KissAction`, `OptimisticCommand`, `OptimisticSync`, `OptimisticSyncWithPush`
 * and `ServerPush`.
 */
const LIFECYCLE_METHODS = new Set([
  // KissAction.
  'reduce', 'before', 'after', 'wrapError', 'wrapReduce', 'abortDispatch', 'abortReduce',
  'hasInternet', 'nonReentrantKeyParams', 'computeNonReentrantKey', 'debounceLockBuilder',
  'ignoreOldKeyParams', 'computeIgnoreOldKey', 'throttleLockBuilder', 'freshKeyParams',
  'computeFreshKey', 'sequentialKeyParams', 'discardQueueOnError', 'createPollingAction',
  'pollingKeyParams', 'computePollingKey', 'shouldRetry',
  // OptimisticCommand.
  'optimisticValue', 'applyValueToState', 'getValueFromState', 'sendCommandToServer',
  'applyServerResponseToState', 'reloadFromServer', 'rollbackState', 'shouldRollback',
  'shouldReload', 'shouldApplyReload', 'applyReloadResultToState',
  // OptimisticSync and OptimisticSyncWithPush.
  'optimisticSyncKeyParams', 'computeOptimisticSyncKey', 'valueToApply',
  'applyOptimisticValueToState', 'sendValueToServer', 'onFinish', 'ifShouldSendAnotherRequest',
  'getServerRevisionFromState',
  // ServerPush.
  'associatedAction', 'pushMetadata', 'applyServerPushToState',
]);

/**
 * Reports calls to the lifecycle methods of an action, like `reduce`, `before`, `after` or
 * `wrapError`, from outside the action:
 *
 * ```ts
 * const state = new LoadUser().reduce();                // Error
 * const status = await store.dispatchAndWait(new LoadUser()); // OK
 * ```
 *
 * Kiss calls them when the action is dispatched, in the right order, with the store, the state
 * and the action features set up. Calling them directly skips all that. They are `protected` in
 * `KissAction`, but an action that overrides one without writing `protected` makes it public, so
 * TypeScript doesn't catch these calls.
 *
 * Not reported: calls with `this` or `super`, inside the action itself. Also reported in tests.
 *
 * With type information, the object must be a Kiss action. Without it, the object must be
 * `new X(...)`, or a `const` initialized with it, where `X` is an action class declared in this
 * file.
 */
export default createRule({
  name: 'lifecycle-method-call',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow calling the lifecycle methods of an action, like `reduce`, `before` or `after`.',
    },
    schema: [],
    messages: {
      call:
        'Don\'t call `{{name}}` of an action yourself. Kiss calls it when the action is dispatched, ' +
        'so dispatch the action instead (in tests, with `await store.dispatchAndWait(action)`).',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        const callee = unwrap(node.callee);
        const name = memberPropertyName(callee);
        if (name === null || !LIFECYCLE_METHODS.has(name)) return;
        const object = unwrap((callee as TSESTree.MemberExpression).object);
        if (object.type === AST_NODE_TYPES.ThisExpression || object.type === AST_NODE_TYPES.Super) return;
        if (!isAction(object, context, typeInfo)) return;
        context.report({node: (callee as TSESTree.MemberExpression).property, messageId: 'call', data: {name}});
      },
    };
  },
});

function isAction(node: TSESTree.Node, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) {
    const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(node));
    if (!isAnyOrUnknown(type)) return kissObjectKindOfType(type, typeInfo.checker) === 'action';
  }

  // `const action = new LoadUser(); action.reduce();`
  let expression = node;
  if (expression.type === AST_NODE_TYPES.Identifier) {
    const init = constInitializer(expression, context);
    if (!init) return false;
    expression = unwrap(init);
  }

  // `new LoadUser().reduce()`
  if (expression.type !== AST_NODE_TYPES.NewExpression || expression.callee.type !== AST_NODE_TYPES.Identifier) return false;
  const classNode = classDeclarationOf(expression.callee, context);
  return classNode !== null && isActionClass(classNode, context, null);
}
