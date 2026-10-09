import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { constInitializer, isActionStatusType, memberPropertyName } from '../storeUsage.js';
import { createRule, getTypeInfo, isTestFile, TypeInfo, unwrap, isAnyOrUnknown } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

const DETAILS = new Set(['hasFinishedMethodBefore', 'hasFinishedMethodReduce', 'hasFinishedMethodAfter']);

/**
 * Reports `hasFinishedMethodBefore`, `hasFinishedMethodReduce` and `hasFinishedMethodAfter` of an
 * action's status, outside tests. They are meant for tests and debugging. In the app, use
 * `isCompleted`, `isCompletedOk` or `isCompletedFailed`:
 *
 * ```ts
 * if (action.status.hasFinishedMethodReduce) ...   // Warning
 * if (action.status.isCompletedOk) ...             // OK
 * ```
 *
 * With type information, the object must be an `ActionStatus`. Without it, the object must be
 * `something.status`, or a `const` with the result of `await ...dispatchAndWait(...)`.
 *
 * Automatic fix: replace `hasFinishedMethodAfter` with `isCompleted`, which has the same value.
 */
export default createRule({
  name: 'action-status-details-in-production',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow the `hasFinishedMethod...` details of an action status, outside tests.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      details:
        '`{{name}}` is meant for tests and debugging. In the app, use `isCompleted`, `isCompletedOk` ' +
        'or `isCompletedFailed`.',
      afterDetails:
        '`hasFinishedMethodAfter` is meant for tests and debugging. In the app, use `isCompleted` ' +
        '(it has the same value), `isCompletedOk` or `isCompletedFailed`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    return {
      MemberExpression(node) {
        const name = memberPropertyName(node);
        if (name === null || !DETAILS.has(name)) return;
        if (!isActionStatus(node.object, context, typeInfo)) return;
        if (name === 'hasFinishedMethodAfter') {
          context.report({
            node: node.property,
            messageId: 'afterDetails',
            fix: (fixer) => fixer.replaceText(node.property, 'isCompleted'),
          });
        } else {
          context.report({node: node.property, messageId: 'details', data: {name}});
        }
      },

      // `const { hasFinishedMethodReduce } = action.status;`
      VariableDeclarator(node) {
        if (node.id.type !== AST_NODE_TYPES.ObjectPattern || !node.init) return;
        if (!isActionStatus(node.init, context, typeInfo)) return;
        for (const property of node.id.properties) {
          if (property.type !== AST_NODE_TYPES.Property || property.computed) continue;
          if (property.key.type !== AST_NODE_TYPES.Identifier || !DETAILS.has(property.key.name)) continue;
          context.report({node: property.key, messageId: 'details', data: {name: property.key.name}});
        }
      },
    };
  },
});

function isActionStatus(node: TSESTree.Node, context: Context, typeInfo: TypeInfo | null): boolean {
  const expression = unwrap(node);
  if (typeInfo) {
    const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(expression));
    if (!isAnyOrUnknown(type)) return isActionStatusType(type, typeInfo.checker);
  }
  // `action.status`.
  if (memberPropertyName(expression) === 'status') return true;
  // `const status = await store.dispatchAndWait(...)`.
  if (expression.type === AST_NODE_TYPES.Identifier) {
    const init = constInitializer(expression, context);
    if (!init) return false;
    const awaited = unwrap(init);
    if (awaited.type !== AST_NODE_TYPES.AwaitExpression) return false;
    const call = unwrap(awaited.argument);
    if (call.type !== AST_NODE_TYPES.CallExpression) return false;
    const callee = unwrap(call.callee);
    return memberPropertyName(callee) === 'dispatchAndWait' ||
      (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'dispatchAndWait');
  }
  return false;
}
