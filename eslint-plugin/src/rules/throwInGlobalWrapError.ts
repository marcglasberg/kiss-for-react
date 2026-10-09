import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule, walk } from '../utils.js';
import { findObjectProperty, FunctionNode, isCaughtInSameFunction, resolveFunction, storeOptions } from '../errors.js';

/**
 * Reports a `throw` in the store's `globalWrapError`:
 *
 * ```ts
 * createStore<State>({
 *   globalWrapError: (error) => {
 *     throw new UserException('Failed').withHardCause(error);  // Return it instead.
 *   },
 * });
 * ```
 *
 * Kiss uses a thrown error just like a returned one, but its docs recommend returning it.
 *
 * Fix: change `throw` to `return`.
 */
export default createRule({
  name: 'throw-in-global-wrap-error',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Return the error from `globalWrapError`, instead of throwing it.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      throwInGlobalWrapError: 'Return the error instead of throwing it. `globalWrapError` replaces the error with the one it returns. Kiss also uses a thrown error, but returning it makes this clear.',
    },
  },
  defaultOptions: [],
  create(context) {
    const checked = new Set<FunctionNode>();

    const checkStore = (node: TSESTree.CallExpression | TSESTree.NewExpression) => {
      const options = storeOptions(node, context);
      const property = options && findObjectProperty(options, 'globalWrapError');
      const fn = property && resolveFunction(property.value, context);
      if (!fn || checked.has(fn)) return;
      checked.add(fn);
      // An async (or generator) function is wrong anyway: Kiss would use the promise as the error.
      if (fn.async || fn.generator) return;

      // Changing `throw` to `return` doesn't compile if the declared return type doesn't accept it.
      const returnType = fn.returnType?.typeAnnotation;
      const canFix = !returnType ||
        returnType.type === AST_NODE_TYPES.TSAnyKeyword || returnType.type === AST_NODE_TYPES.TSUnknownKeyword;

      walk(fn.body, (inner) => {
        if (inner.type !== AST_NODE_TYPES.ThrowStatement || isCaughtInSameFunction(inner)) return;
        const throwToken = context.sourceCode.getFirstToken(inner)!;
        context.report({
          node: inner,
          messageId: 'throwInGlobalWrapError',
          fix: canFix ? (fixer) => fixer.replaceText(throwToken, 'return') : null,
        });
      });
    };

    return {
      CallExpression: checkStore,
      NewExpression: checkStore,
    };
  },
});
