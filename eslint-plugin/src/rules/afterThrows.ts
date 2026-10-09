import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { ClassNode, isActionClass } from '../actionMethods.js';
import { contains, createRule, findMethod, getTypeInfo, walk } from '../utils.js';

/**
 * Reports a `throw` in the `after` method of an action, outside a `try` that catches it:
 *
 * ```ts
 * after() {
 *   if (this.state.user === null) throw new Error('No user'); // Warning
 * }
 * ```
 *
 * Kiss logs errors thrown by `after`, and ignores them. Throws inside functions declared in
 * `after` (like callbacks) are not reported, since they may run somewhere else.
 */
export default createRule({
  name: 'after-throws',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow throwing errors in the `after` method of an action.',
    },
    schema: [],
    messages: {
      throwInAfter:
        'Don\'t throw in `after`. Kiss ignores errors thrown by `after`, and only logs them, ' +
        'so this error is lost.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const after = findMethod(classNode, 'after');
      const body = after?.value.body;
      if (!body) return;
      if (!isActionClass(classNode, context, typeInfo)) return;

      walk(body, (node) => {
        if (node.type === AST_NODE_TYPES.ThrowStatement && !isCaught(node, body)) {
          context.report({node, messageId: 'throwInAfter'});
        }
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/** True if the throw is inside the `try` block of a `try` with a `catch`, inside `body`. */
function isCaught(node: TSESTree.ThrowStatement, body: TSESTree.BlockStatement): boolean {
  for (let current: TSESTree.Node | undefined = node.parent; current && current !== body; current = current.parent) {
    if (current.type === AST_NODE_TYPES.TryStatement && current.handler && contains(current.block, node)) return true;
  }
  return false;
}
