import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  ClassNode,
  classChain,
  findMemberInChain,
  findPropertyInChain,
  initializerTextOf,
  instanceTypeOfClass,
  isDeclaredByUser,
  isSet,
  isTrue,
  reduceKind,
  removeMember,
  retryOf,
} from '../actionFeatures.js';
import { createRule, findProperty, getTypeInfo, isKissActionClass, isTestFile, TypeInfo } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports `nonReentrant` and `checkInternet` in an action whose `reduce` is sync:
 *
 * ```ts
 * class Increment extends Action {
 *   nonReentrant = true;                    // Warning
 *   reduce() { return this.state.add(1); }
 * }
 * ```
 *
 * A sync action finishes during its dispatch, so it never runs twice at the same time, and
 * `nonReentrant` does nothing. And `checkInternet` makes the action async (its `before` checks
 * the internet), but a sync reducer doesn't use the network. It also makes `dispatchSync`
 * of the action throw.
 *
 * Not reported when the action overrides `before` or `wrapReduce` (which may make it async),
 * or in tests. `retry` is reported by `retry-requires-async-reduce`.
 *
 * Suggestion: remove the property.
 */
export default createRule({
  name: 'async-feature-in-sync-action',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `nonReentrant` and `checkInternet` in actions whose `reduce` is sync.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      nonReentrant:
        '`nonReentrant` does nothing in a sync action. Its `reduce` is sync, so the action finishes ' +
        'during its dispatch, and never runs twice at the same time.',
      checkInternet:
        '`checkInternet` is meant for actions that use the network, but this `reduce` is sync. ' +
        'It makes the action async, so `dispatchSync` of it throws.',
      remove: 'Remove `{{property}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    const report = (property: TSESTree.PropertyDefinition, name: 'nonReentrant' | 'checkInternet') => {
      context.report({
        node: property.key,
        messageId: name,
        suggest: [{
          messageId: 'remove',
          data: {property: name},
          fix: (fixer) => removeMember(fixer, property, context),
        }],
      });
    };

    const checkClass = (classNode: ClassNode) => {
      const nonReentrant = findProperty(classNode, 'nonReentrant');
      const checkInternet = findProperty(classNode, 'checkInternet');
      const reportNonReentrant = !!nonReentrant && isTrue(nonReentrant);
      const reportCheckInternet = !!checkInternet && isSet(checkInternet);
      if (!reportNonReentrant && !reportCheckInternet) return;

      if (!classNode.superClass) return;
      if (typeInfo && !isKissActionClass(classNode, typeInfo)) return;
      if (reduceKind(classNode, context, typeInfo) !== 'sync') return;
      const features = featuresOf(classNode, context, typeInfo);
      if (features.overridesBeforeOrWrapReduce) return;

      if (reportCheckInternet) report(checkInternet!, 'checkInternet');
      // With `checkInternet` or `retry`, the action is async anyway.
      if (reportNonReentrant && !features.setsCheckInternet && !features.retryOn) report(nonReentrant!, 'nonReentrant');
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/**
 * What the action (or its superclasses) do that may make it async. Without type information,
 * only the superclasses declared in this file are known.
 */
function featuresOf(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null) {
  if (typeInfo) {
    const type = instanceTypeOfClass(classNode, typeInfo);
    const checkInternet = initializerTextOf(type, 'checkInternet');
    const retry = initializerTextOf(type, 'retry');
    return {
      overridesBeforeOrWrapReduce: isDeclaredByUser(type, 'before') || isDeclaredByUser(type, 'wrapReduce'),
      setsCheckInternet: checkInternet !== null && !['null', 'undefined'].includes(checkInternet.trim()),
      retryOn: retry !== null && retryOf(retry).on,
    };
  }
  const chain = classChain(classNode, context);
  const checkInternet = findPropertyInChain(chain, 'checkInternet');
  const retry = findPropertyInChain(chain, 'retry');
  return {
    overridesBeforeOrWrapReduce: !!findMemberInChain(chain, 'before') || !!findMemberInChain(chain, 'wrapReduce'),
    setsCheckInternet: !!checkInternet && isSet(checkInternet),
    retryOn: !!retry?.value && retryOf(context.sourceCode.getText(retry.value)).on,
  };
}
