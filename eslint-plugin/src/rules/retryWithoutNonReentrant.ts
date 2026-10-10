import { TSESLint } from '@typescript-eslint/utils';
import {
  ClassNode,
  classChain,
  extendsClassNamed,
  findMemberInChain,
  findPropertyInChain,
  initializerTextOf,
  indentationOf,
  instanceTypeOfClass,
  isDeclaredByUser,
  needsOverrideKeyword,
  reduceKind,
  retryOf,
  unlimitedRetryCheckInternetOfClass,
} from '../actionFeatures.js';
import { createRule, findProperty, getTypeInfo, isKissActionClass, isTestFile, TypeInfo } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports an action with `retry`, but not `nonReentrant`:
 *
 * ```ts
 * class LoadText extends Action {
 *   retry = { on: true };   // Warning
 *   nonReentrant = true;    // Without this line.
 *   async reduce() { ... }
 * }
 * ```
 *
 * The Kiss docs recommend `nonReentrant` for most actions with `retry`, so that a new dispatch
 * doesn't run while the previous one is still retrying.
 *
 * Not reported when the action (or a superclass) declares `nonReentrant` (even as `false`, which
 * is a deliberate choice) or overrides `abortDispatch`, for `OptimisticCommand` (which is always
 * non-reentrant), for `OptimisticSync` (which can't use `retry` nor `nonReentrant`), when it turns on `unlimitedRetryCheckInternet` (which is already non-reentrant,
 * and can't be combined with `retry`), when it turns on `throttle` or `fresh` (which can't be
 * combined with `nonReentrant`), for a sync `reduce` (reported by `retry-requires-async-reduce`),
 * or in tests.
 *
 * Suggestion: add `nonReentrant = true;`.
 */
export default createRule({
  name: 'retry-without-non-reentrant',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Recommend `nonReentrant` for actions with `retry`.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      missingNonReentrant:
        'This action has `retry`, but not `nonReentrant = true`. A new dispatch may then run while the ' +
        'previous one is still retrying.',
      addNonReentrant: 'Add `nonReentrant = true;`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const retry = findProperty(classNode, 'retry');
      if (!retry?.value || !retryOf(context.sourceCode.getText(retry.value)).on) return;
      if (!isRelevantAction(classNode, context, typeInfo)) return;
      if (reduceKind(classNode, context, typeInfo) === 'sync') return;
      if (unlimitedRetryCheckInternetOfClass(classNode, context, typeInfo)) return;
      if (usesThrottleOrFresh(classNode, context, typeInfo)) return;

      const override = needsOverrideKeyword(classNode, typeInfo) || retry.override ? 'override ' : '';
      context.report({
        node: retry.key,
        messageId: 'missingNonReentrant',
        suggest: [{
          messageId: 'addNonReentrant',
          fix: (fixer) => fixer.insertTextAfter(retry, `\n${indentationOf(retry, context)}${override}nonReentrant = true;`),
        }],
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/**
 * True if the class is an action that is not an `OptimisticCommand`, an `OptimisticSync`, an
 * `OptimisticSyncWithPush` or a `ServerPush`, and that doesn't declare `nonReentrant` or
 * `abortDispatch` (itself, or its superclasses).
 */
function isRelevantAction(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (!classNode.superClass) return false;
  if (typeInfo) {
    if (!isKissActionClass(classNode, typeInfo)) return false;
    const type = instanceTypeOfClass(classNode, typeInfo);
    if (extendsClassNamed(type, 'OptimisticCommand', typeInfo.checker)) return false;
    if (extendsClassNamed(type, 'OptimisticSync', typeInfo.checker)) return false;
    if (extendsClassNamed(type, 'OptimisticSyncWithPush', typeInfo.checker)) return false;
    if (extendsClassNamed(type, 'ServerPush', typeInfo.checker)) return false;
    return !isDeclaredByUser(type, 'nonReentrant') && !isDeclaredByUser(type, 'abortDispatch');
  }
  const chain = classChain(classNode, context);
  if (chain.end === 'OptimisticCommand' || chain.end === 'OptimisticSync' ||
    chain.end === 'OptimisticSyncWithPush' || chain.end === 'ServerPush') return false;
  // Without type information, the superclass may be an `OptimisticCommand`, an `OptimisticSync`,
  // an `OptimisticSyncWithPush` or a `ServerPush` declared in another file.
  if (findMemberInChain(chain, 'sendCommandToServer') || findMemberInChain(chain, 'optimisticValue')) return false;
  if (findMemberInChain(chain, 'sendValueToServer') || findMemberInChain(chain, 'valueToApply')) return false;
  if (findMemberInChain(chain, 'applyServerPushToState') || findMemberInChain(chain, 'pushMetadata')) return false;
  // It must be an action: it reaches `KissAction`, or declares `reduce`.
  if (chain.end !== 'KissAction' && !findMemberInChain(chain, 'reduce')) return false;
  return !findMemberInChain(chain, 'nonReentrant') && !findMemberInChain(chain, 'abortDispatch');
}

/**
 * True if the action turns on `throttle` or `fresh` (itself, or its superclasses), which can't
 * be combined with `nonReentrant`.
 */
function usesThrottleOrFresh(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  const isOn = (text: string | null) => text !== null && !['false', 'null', 'undefined'].includes(text.trim());
  return ['throttle', 'fresh'].some((name) => {
    if (typeInfo) return isOn(initializerTextOf(instanceTypeOfClass(classNode, typeInfo), name));
    const property = findPropertyInChain(classChain(classNode, context), name);
    return isOn(property?.value ? context.sourceCode.getText(property.value) : null);
  });
}
