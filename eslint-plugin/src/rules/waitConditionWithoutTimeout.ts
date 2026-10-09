import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { kissDispatchMethod, kissObjectKind, memberPropertyName } from '../storeUsage.js';
import { createRule, getTypeInfo, isTestFile, unwrap, isAnyOrUnknown } from '../utils.js';

/**
 * Reports `waitCondition`, `dispatchWhen` or `useDispatchWhen` with no timeout
 * (`{ timeoutMillis: 0 }`, or a negative number), outside tests:
 *
 * ```ts
 * store.dispatchWhen(new BuyStock('IBM'), (state) => state.price >= 100, { timeoutMillis: 0 });      // Warning
 * store.dispatchWhen(new BuyStock('IBM'), (state) => state.price >= 100, { timeoutMillis: 60_000 }); // OK
 * ```
 *
 * While the wait is pending, its condition runs on every state change, and there's no way to
 * cancel it. A wait without a timeout may never end.
 *
 * It checks the methods of the store, of `useStore()`, and of actions (`this.waitCondition`), and
 * the function returned by `useDispatchWhen()`. With type information, the object must be a Kiss
 * store or action. Without it, any object with these methods is checked, since the
 * `{ timeoutMillis }` option is specific to Kiss. Not reported in tests.
 */
export default createRule({
  name: 'wait-condition-without-timeout',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `waitCondition` and `dispatchWhen` without a timeout, outside tests.',
    },
    schema: [],
    messages: {
      noTimeout:
        '`{{method}}` without a timeout may never end. While it waits, its condition runs on every ' +
        'state change, and it can\'t be cancelled. Give it a timeout, or put the logic in an action.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        const callee = unwrap(node.callee);
        let method: string | null = null;

        const property = memberPropertyName(callee);
        if (property === 'waitCondition' || property === 'dispatchWhen') {
          // With type information, the object must be a Kiss store or action (or `any`).
          const object = (callee as TSESTree.MemberExpression).object;
          if (typeInfo && kissObjectKind(object, context, typeInfo) === null && !isAny(object)) return;
          method = property;
        } else if (property === null && kissDispatchMethod(node, context, typeInfo) === 'dispatchWhen') {
          // The function returned by `useDispatchWhen()`.
          method = 'dispatchWhen';
        }
        if (method === null) return;
        const optionsIndex = method === 'waitCondition' ? 1 : 2;

        const options = node.arguments[optionsIndex];
        if (!options || options.type === AST_NODE_TYPES.SpreadElement) return;
        const timeout = timeoutProperty(unwrap(options));
        if (!timeout || !isNoTimeout(unwrap(timeout.value))) return;
        context.report({node: timeout, messageId: 'noTimeout', data: {method}});
      },
    };

    function isAny(node: TSESTree.Node): boolean {
      const type = typeInfo!.checker.getTypeAtLocation(typeInfo!.services.esTreeNodeToTSNodeMap.get(unwrap(node)));
      return isAnyOrUnknown(type);
    }
  },
});

/** The `timeoutMillis` property of an object literal. */
function timeoutProperty(options: TSESTree.Node): TSESTree.Property | null {
  if (options.type !== AST_NODE_TYPES.ObjectExpression) return null;
  for (const property of options.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.computed) continue;
    const key = property.key;
    const name = key.type === AST_NODE_TYPES.Identifier ? key.name : key.type === AST_NODE_TYPES.Literal ? String(key.value) : null;
    if (name === 'timeoutMillis') return property;
  }
  return null;
}

/** True for `0`, and for negative numbers like `-1`. */
function isNoTimeout(value: TSESTree.Node): boolean {
  if (value.type === AST_NODE_TYPES.Literal) return value.value === 0;
  if (value.type === AST_NODE_TYPES.UnaryExpression && value.operator === '-') {
    const argument = unwrap(value.argument);
    return argument.type === AST_NODE_TYPES.Literal && typeof argument.value === 'number' && argument.value >= 0;
  }
  return false;
}
