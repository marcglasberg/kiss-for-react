import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ClassNode, removeMember } from '../actionFeatures.js';
import { createRule, getTypeInfo } from '../utils.js';
import { featureState, isAction, keyOf, PropertyFeature } from './incompatibleActionFeatures.js';

/**
 * The features that should be added to the action returned by `createPollingAction()`, and not
 * to the action that starts and stops the polling. Each one says why it may prevent a `Poll.stop`
 * from stopping the polling.
 */
const POLLING_CAVEATS: [PropertyFeature, (text: string | null) => string][] = [
  ['checkInternet', (text) => /\babort\s*:\s*true\b/.test(text ?? '')
    ? 'a `Poll.stop` dispatched while there is no internet is aborted'
    : 'a `Poll.stop` dispatched while there is no internet fails'],
  ['nonReentrant', () => 'a `Poll.stop` dispatched while a run is in progress is ignored'],
  ['throttle', () => 'a `Poll.stop` dispatched inside the throttle period is ignored'],
  ['fresh', () => 'a `Poll.stop` dispatched while the data is fresh is ignored'],
  ['sequential', () => 'a `Poll.stop` has to wait for its turn in the queue'],
];

/**
 * Reports an action that uses polling (`poll`), and also `checkInternet`, `nonReentrant`,
 * `throttle`, `fresh` or `sequential`:
 *
 * ```ts
 * class PollPrices extends Action {
 *   constructor(readonly poll = Poll.once) { super(); }
 *   throttle = 5000;  // Error
 *   createPollingAction() { return new LoadPrices(); }
 *   ...
 * }
 * ```
 *
 * These features can be combined with polling, but only in the action returned by
 * `createPollingAction()` (the tick), and not in the action that starts and stops the polling.
 * They can abort, fail or delay a dispatch, and can't tell a `Poll.stop` apart from a regular
 * tick. So a `Poll.stop` may itself be aborted, fail, or wait, and the polling can't be stopped.
 *
 * Features inherited from superclasses count too (in this file, or anywhere with type
 * information), but the problem is only reported in the class that declares the feature or
 * `poll`, in the feature's declaration if it's in the class (otherwise, in `poll`). Also reported
 * in tests. The features that can't be combined with polling at all, like `retry`, are reported
 * by `incompatible-action-features`.
 *
 * Suggestion: remove the feature (and add it to the tick action instead).
 */
export default createRule({
  name: 'polling-with-caveat',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow features that may block `Poll.stop` in the action that starts and stops the polling.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      caveat:
        'Don\'t add `{{feature}}` to the action that starts and stops the polling, because {{reason}}, ' +
        'so you may be unable to stop the polling. Add it to the action returned by ' +
        '`createPollingAction()` instead.',
      remove: 'Remove `{{feature}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const poll = featureState('poll', classNode, context, typeInfo);
      if (!poll.on) return;

      const caveats = POLLING_CAVEATS
        .map(([feature, reasonOf]) => ({feature, reasonOf, state: featureState(feature, classNode, context, typeInfo)}))
        .filter(({state}) => state.on && (state.own || poll.own));
      if (caveats.length === 0) return;
      if (!isAction(classNode, context, typeInfo)) return;

      for (const {feature, reasonOf, state} of caveats) {
        const own = state.own;
        context.report({
          node: keyOf(own ?? poll.own!),
          messageId: 'caveat',
          data: {feature, reason: reasonOf(state.text)},
          suggest: own?.type === AST_NODE_TYPES.PropertyDefinition ? [{
            messageId: 'remove',
            data: {feature},
            fix: (fixer: TSESLint.RuleFixer) => removeMember(fixer, own as TSESTree.PropertyDefinition, context),
          }] : [],
        });
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});
