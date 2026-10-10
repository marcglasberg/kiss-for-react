import { AST_NODE_TYPES, ASTUtils, TSESTree } from '@typescript-eslint/utils';
import { createRule, getTypeInfo, isFunction, isTestFile, kissImportName, unwrap } from '../utils.js';
import { isMethodOf, outermost, storeOptionNameOf } from '../errors.js';

/**
 * Reports a `UserException` that replaces another error without keeping it as its `hardCause`:
 *
 * ```ts
 * try {
 *   return this.state.copy({ count: parseNumber(text) });
 * } catch (error) {
 *   throw new UserException('Please enter a valid number'); // Add `.withHardCause(error)`.
 * }
 * ```
 *
 * Checks the `UserException`s created in a `catch` clause, in the `wrapError` of an action or
 * persistor, and in the store's `errorObserver`. Not reported in tests.
 *
 * Fix: add `.withHardCause(error)`.
 */
export default createRule({
  name: 'user-exception-without-cause',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Keep the original error as the `hardCause` of the `UserException` that replaces it.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      withoutCause: 'This `UserException` replaces the error `{{name}}`, but loses it. Add `.withHardCause({{name}})`, so that the original error can still be logged (for example, in the `errorObserver`).',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    /**
     * The error that the `UserException` replaces, if any: its name (the text the fix uses), and
     * the parameter that declares it.
     */
    const replacedError = (node: TSESTree.Node): { name: string, binding: TSESTree.Identifier } | null => {
      let child: TSESTree.Node = node;
      for (let current = node.parent; current; current = current.parent) {
        if (current.type === AST_NODE_TYPES.CatchClause && child === current.body) {
          return current.param?.type === AST_NODE_TYPES.Identifier ? {name: current.param.name, binding: current.param} : null;
        }
        if (isFunction(current)) {
          const param = current.params[0];
          if (isMethodOf(current, 'wrapError', context, typeInfo, {actions: true, persistors: true})) {
            return param?.type === AST_NODE_TYPES.Identifier ? {name: param.name, binding: param} : null;
          }
          if (storeOptionNameOf(current, context) === 'errorObserver') return observedError(param);
          return null;
        }
        child = current;
      }
      return null;
    };

    return {
      NewExpression(node) {
        if (kissImportName(node.callee, context) !== 'UserException') return;
        const error = replacedError(node);
        // A name starting with `_` says the error is ignored on purpose.
        if (!error || error.binding.name.startsWith('_')) return;
        if (hasCause(node) || isStoredInVariable(node)) return;

        // The fix uses the parameter, so its name must not be shadowed here.
        const variable = ASTUtils.findVariable(context.sourceCode.getScope(node), error.binding.name);
        const canFix = variable?.defs[0]?.name === error.binding && context.sourceCode.getLastToken(node)?.value === ')';

        context.report({
          node,
          messageId: 'withoutCause',
          data: {name: error.name},
          fix: canFix ? (fixer) => fixer.insertTextAfter(node, `.withHardCause(${error.name})`) : null,
        });
      },
    };
  },
});

/**
 * The `error` given to the `errorObserver`, from its (single object) parameter:
 * `({ error }) => ...`, `({ error: e }) => ...`, or `(params) => ...` (as `params.error`).
 */
function observedError(param: TSESTree.Parameter | undefined): { name: string, binding: TSESTree.Identifier } | null {
  if (param?.type === AST_NODE_TYPES.Identifier) return {name: `${param.name}.error`, binding: param};
  if (param?.type !== AST_NODE_TYPES.ObjectPattern) return null;
  for (const property of param.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.computed) continue;
    const key = property.key.type === AST_NODE_TYPES.Identifier ? property.key.name :
      property.key.type === AST_NODE_TYPES.Literal ? property.key.value : null;
    if (key !== 'error') continue;
    const value = property.value.type === AST_NODE_TYPES.AssignmentPattern ? property.value.left : property.value;
    return value.type === AST_NODE_TYPES.Identifier ? {name: value.name, binding: value} : null;
  }
  return null;
}

/**
 * True if the `UserException` has a `hardCause`: in its options (or options we can't see), or
 * with a method called on it, like `.withHardCause(error)`.
 */
function hasCause(node: TSESTree.NewExpression): boolean {
  const options = node.arguments[1];
  if (options) {
    const object = unwrap(options);
    if (object.type !== AST_NODE_TYPES.ObjectExpression) return true;
    if (object.properties.some((property) => property.type === AST_NODE_TYPES.SpreadElement ||
      (property.type === AST_NODE_TYPES.Property && (property.computed ||
        (property.key.type === AST_NODE_TYPES.Identifier && property.key.name === 'hardCause') ||
        (property.key.type === AST_NODE_TYPES.Literal && property.key.value === 'hardCause'))))) return true;
  }
  if (node.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)) return true;

  // A method called on it, like `.withHardCause(error)` or `.copy({...})`.
  const outer = outermost(node);
  const member = outer.parent;
  return member?.type === AST_NODE_TYPES.MemberExpression && member.object === outer;
}

/** True if the `UserException` is stored in a variable, which may get a cause later. */
function isStoredInVariable(node: TSESTree.NewExpression): boolean {
  const parent = outermost(node).parent;
  return parent?.type === AST_NODE_TYPES.VariableDeclarator ||
    parent?.type === AST_NODE_TYPES.AssignmentExpression ||
    parent?.type === AST_NODE_TYPES.PropertyDefinition;
}
