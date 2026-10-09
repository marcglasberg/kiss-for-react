import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { classDeclarationOf } from '../actions.js';
import { initializerTextOf, retryOf, retryOfClass } from '../actionFeatures.js';
import { createRule, getTypeInfo, isTestFile, TypeInfo, unwrap } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports `dispatchAndWait` and `dispatchAndWaitAll` with an action that retries forever, with
 * `retry = { maxRetries: -1 }` or `retry = { unlimitedRetries: true }`:
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
 * The promise never resolves while the action keeps failing.
 *
 * It checks any call to a method or function called `dispatchAndWait` or `dispatchAndWaitAll`.
 * The action's class must be known: with type information, from the action's type. Without it,
 * the action must be created with `new` (in the call, or in a `const`), and its class (and the
 * superclasses up to the one with `retry`) must be declared in the same file. Not reported in tests.
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
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        const callee = node.callee;
        const method = callee.type === AST_NODE_TYPES.Identifier ? callee.name
          : callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier ? callee.property.name : null;
        if (method !== 'dispatchAndWait' && method !== 'dispatchAndWaitAll') return;

        const argument = node.arguments[0];
        if (!argument || argument.type === AST_NODE_TYPES.SpreadElement) return;

        let actions: TSESTree.Expression[] = [argument];
        if (method === 'dispatchAndWaitAll') {
          const array = unwrap(argument);
          if (array.type !== AST_NODE_TYPES.ArrayExpression) return;
          actions = array.elements.filter((e): e is TSESTree.Expression => !!e && e.type !== AST_NODE_TYPES.SpreadElement);
        }

        for (const action of actions) {
          const result = unlimitedRetriesOf(action, context, typeInfo);
          if (!result) continue;
          context.report({
            node: action,
            messageId: 'unlimitedRetries',
            data: {action: result.className, option: result.option, method},
          });
        }
      },
    };
  },
});

/** If the action retries forever: its class name, and the option that does it. */
function unlimitedRetriesOf(
  action: TSESTree.Expression,
  context: Context,
  typeInfo: TypeInfo | null,
): { className: string, option: string } | null {
  if (typeInfo) {
    const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(action));
    if (type.isUnion()) return null;
    const text = initializerTextOf(type, 'retry');
    const option = text === null ? null : retryOf(text).unlimited;
    const className = type.getSymbol()?.getName();
    return option && className ? {className, option} : null;
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
  const option = retryOfClass(classNode, context, null)?.unlimited;
  return option ? {className: expression.callee.name, option} : null;
}
