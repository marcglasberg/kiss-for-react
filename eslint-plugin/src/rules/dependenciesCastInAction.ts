import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule, enclosingClass, getTypeInfo, isTestFile, unwrap } from '../utils.js';
import { isActionClass } from '../errors.js';
import { kissObjectKind } from '../storeUsage.js';

type CastNode = TSESTree.TSAsExpression | TSESTree.TSTypeAssertion;

/** The store members, and the name of the typed getter the message suggests for each. */
const GETTERS: Record<string, string> = {
  environment: 'env',
  dependencies: 'deps',
  configuration: 'config',
};

/**
 * Reports a cast of `store.environment`, `store.dependencies` or `store.configuration` inside
 * an action. They are typed `unknown`, and the docs recommend declaring a typed getter for
 * each one, once, in the base action:
 *
 * ```ts
 * abstract class Action extends KissAction<State> {
 *   get deps() { return this.store.dependencies as Dependencies; }
 * }
 *
 * class LoadUser extends Action {
 *   async reduce() {
 *     const user = await (this.store.dependencies as Dependencies).loadUser(); // Warning
 *     const user = await this.deps.loadUser();                                 // OK
 *     ...
 *   }
 * }
 * ```
 *
 * A chain of casts (`as unknown as Dependencies`) is reported once, on the whole chain. The
 * store is `this.store`, or, with type information, any expression of type `Store`. Casts in
 * abstract classes (like the base action) are not reported, nor casts outside actions, nor
 * casts in tests, whose actions may not extend the base action.
 *
 * No quick fix: the getter has to be declared in the base action.
 */
export default createRule({
  name: 'dependencies-cast-in-action',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Use a typed getter of the base action, instead of casting `store.environment`, `store.dependencies` or `store.configuration` in actions.',
    },
    schema: [],
    messages: {
      cast:
        '`store.{{name}}` is cast here. Declare a typed getter once, in your base action, like ' +
        '`get {{getter}}() { return this.store.{{name}} as {{type}}; }`, and use `this.{{getter}}` in all your actions.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    const check = (node: CastNode) => {
      // Only the outermost cast of a chain is reported.
      if (isCast(outerExpression(node))) return;

      const member = innerExpression(node);
      if (member.type !== AST_NODE_TYPES.MemberExpression || member.computed ||
        member.property.type !== AST_NODE_TYPES.Identifier) return;
      const name = member.property.name;
      if (!(name in GETTERS)) return;
      if (kissObjectKind(member.object, context, typeInfo) !== 'store') return;

      const classNode = enclosingClass(node);
      if (!classNode || classNode.abstract || !isActionClass(classNode, context, typeInfo)) return;

      context.report({
        node,
        messageId: 'cast',
        data: {name, getter: GETTERS[name], type: context.sourceCode.getText(node.typeAnnotation)},
      });
    };

    return {
      TSAsExpression: check,
      TSTypeAssertion: check,
    };
  },
});

function isCast(node: TSESTree.Node | undefined): node is CastNode {
  return node?.type === AST_NODE_TYPES.TSAsExpression || node?.type === AST_NODE_TYPES.TSTypeAssertion;
}

/** The parent of the node, skipping parentheses. */
function outerExpression(node: TSESTree.Node): TSESTree.Node | undefined {
  let parent = node.parent;
  while (parent?.type === AST_NODE_TYPES.TSNonNullExpression) parent = parent.parent;
  return parent;
}

/** The expression being cast, skipping nested casts and non-null assertions. */
function innerExpression(node: CastNode): TSESTree.Node {
  return unwrap(node.expression);
}
