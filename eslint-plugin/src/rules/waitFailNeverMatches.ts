import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { actionKindOfClassReference, classDeclarationOf } from '../actions.js';
import {
  classChain,
  findMemberInChain,
  findPropertyInChain,
  hasSubclasses,
  initializerTextOf,
  isDeclaredByUser,
  isUnlimitedRetryCheckInternetOn,
  retryOf,
  unlimitedRetryCheckInternetOfClass,
} from '../actionFeatures.js';
import { createRule, getTypeInfo, isTestFile, kissImportName, TypeInfo, unwrap } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports `isWaiting` (or `useIsWaiting`) with a sync action class, which is always `false`:
 *
 * ```ts
 * class Increment extends Action {
 *   reduce() { return this.state.add(1); }
 * }
 *
 * const isWaiting = useIsWaiting(Increment); // Warning: `Increment` is sync.
 * ```
 *
 * A sync action finishes during its dispatch, before anything can wait for it.
 *
 * In an array, like `useIsWaiting([LoadUser, Increment])`, each sync action is reported, since it
 * never makes the result `true`.
 *
 * Abstract classes are not reported, since `isWaiting` also matches their subclasses. Neither
 * are classes that may become async: classes with subclasses (which `isWaiting` also matches),
 * and classes that override `wrapReduce`, or turn on `retry` or `unlimitedRetryCheckInternet`.
 *
 * Inside the action class itself, `isWaiting` of its own class is not reported either, since it's
 * `true` there: the action is being processed while it runs.
 */
export default createRule({
  name: 'wait-fail-never-matches',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `isWaiting` and `useIsWaiting` with sync actions, since they are always `false`.',
    },
    schema: [],
    messages: {
      syncAction:
        '`{{action}}` is sync, so `{{method}}({{action}})` is always `false`. A sync action finishes ' +
        'during its dispatch, before anything can wait for it.',
      syncActionInArray:
        '`{{action}}` is sync, so it never makes `{{method}}([...])` true. A sync action finishes ' +
        'during its dispatch, before anything can wait for it.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        const method = isWaitingMethod(node.callee, context);
        if (!method) return;
        const argument = node.arguments[0];
        if (!argument || argument.type === AST_NODE_TYPES.SpreadElement) return;

        // `isWaiting([A, B])` checks each class in the array.
        const unwrapped = unwrap(argument);
        const inArray = unwrapped.type === AST_NODE_TYPES.ArrayExpression;
        const classRefs = inArray ? unwrapped.elements : [argument];

        for (const classRef of classRefs) {
          if (!classRef || classRef.type === AST_NODE_TYPES.SpreadElement) continue;
          if (isInsideOwnClass(node, classRef, context)) continue;
          const result = actionKindOfClassReference(classRef, context, typeInfo);
          if (result.kind !== 'sync') continue;
          if (mayBecomeAsync(classRef, context, typeInfo)) continue;

          context.report({
            node: classRef,
            messageId: inArray ? 'syncActionInArray' : 'syncAction',
            data: {action: context.sourceCode.getText(classRef), method},
          });
        }
      },
    };
  },
});

// `isWaiting` for any `x.isWaiting(...)` (like `store.isWaiting` or `this.isWaiting`), and
// `useIsWaiting` when imported from Kiss.
function isWaitingMethod(callee: TSESTree.Expression, context: Context): string | null {
  if (kissImportName(callee, context) === 'useIsWaiting') return 'useIsWaiting';
  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === 'isWaiting') return 'isWaiting';
  return null;
}

/**
 * True if the call is inside the class it checks, like `this.isWaiting(Increment)` inside
 * `Increment`. There, the action is being processed, so it's `true` even for a sync action.
 */
function isInsideOwnClass(node: TSESTree.Node, classRef: TSESTree.Expression, context: Context): boolean {
  const expression = unwrap(classRef);
  if (expression.type !== AST_NODE_TYPES.Identifier) return false;
  const classNode = classDeclarationOf(expression, context);
  if (!classNode) return false;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent === classNode) return true;
  }
  return false;
}

/**
 * True if the action may be async after all: it has subclasses (which `isWaiting` also matches),
 * or it overrides `wrapReduce` (which may return a promise), or it turns on `retry` or
 * `unlimitedRetryCheckInternet` (which run the reducer asynchronously).
 */
function mayBecomeAsync(classRef: TSESTree.Expression, context: Context, typeInfo: TypeInfo | null): boolean {
  const expression = unwrap(classRef);
  if (typeInfo) {
    if (hasSubclasses(classRef, null, context, typeInfo)) return true;
    const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(expression);
    const classType = typeInfo.checker.getTypeAtLocation(tsNode);
    const signatures = classType.getConstructSignatures();
    if (signatures.length === 0) return true;
    const type: ts.Type = typeInfo.checker.getReturnTypeOfSignature(signatures[0]);
    if (isDeclaredByUser(type, 'wrapReduce')) return true;
    const unlimited = initializerTextOf(type, 'unlimitedRetryCheckInternet');
    if (unlimited !== null && isUnlimitedRetryCheckInternetOn(unlimited)) return true;
    const retry = initializerTextOf(type, 'retry');
    return retry !== null && retryOf(retry).on;
  }
  if (expression.type !== AST_NODE_TYPES.Identifier) return true;
  const classNode = classDeclarationOf(expression, context);
  if (!classNode || hasSubclasses(expression, classNode, context, null)) return true;
  const chain = classChain(classNode, context);
  if (findMemberInChain(chain, 'wrapReduce')) return true;
  if (unlimitedRetryCheckInternetOfClass(classNode, context, null)) return true;
  const retry = findPropertyInChain(chain, 'retry');
  return !!retry?.value && retryOf(context.sourceCode.getText(retry.value)).on;
}
