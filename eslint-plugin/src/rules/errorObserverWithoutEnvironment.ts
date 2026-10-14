import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule, isTestFile } from '../utils.js';
import { findObjectProperty, storeOptions } from '../errors.js';

/**
 * Reports a store created with an `errorObserver`, but no `environment`:
 *
 * ```ts
 * createStore<State>({
 *   initialState: State.initialState,
 *   errorObserver: ({ error, store }) => { ... },
 *   environment: Environment.production, // Without it: Warning
 * });
 * ```
 *
 * The Kiss docs suggest passing both, so that the observer can handle the errors differently
 * in production, staging and tests (for example, sending them to a monitoring service only in
 * production). Opt-in. Not reported in tests, nor when the options are spread from another
 * object (which may have the environment).
 */
export default createRule({
  name: 'error-observer-without-environment',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Pass the `environment` to a store that has an `errorObserver`.',
    },
    schema: [],
    messages: {
      withoutEnvironment:
        'The store has an `errorObserver`, but no `environment`. Pass the `environment` too, so that the observer can ' +
        'handle the errors differently in production, staging and tests (for example, sending them to a monitoring ' +
        'service only in production).',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};

    const checkStore = (node: TSESTree.CallExpression | TSESTree.NewExpression) => {
      const options = storeOptions(node, context);
      if (!options) return;
      if (options.properties.some((property) => property.type === AST_NODE_TYPES.SpreadElement)) return;
      const errorObserver = findObjectProperty(options, 'errorObserver');
      if (!errorObserver || findObjectProperty(options, 'environment')) return;
      context.report({node: errorObserver.key, messageId: 'withoutEnvironment'});
    };

    return {
      CallExpression: checkStore,
      NewExpression: checkStore,
    };
  },
});
