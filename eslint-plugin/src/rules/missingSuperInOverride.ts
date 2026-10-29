import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import {
  callsSuper,
  ClassNode,
  extendsLoadPages,
  extendsOptimisticCommand,
  extendsOptimisticSync,
  extendsOptimisticSyncWithPush,
  extendsServerPush,
  isActionClass,
} from '../actionMethods.js';
import { createRule, findMethod, getTypeInfo, memberName } from '../utils.js';

/**
 * Reports an override that silently turns off a Kiss feature, because it doesn't call `super`,
 * or because it overrides a member that must not be overridden:
 *
 * - `reduce()` in a subclass of `OptimisticCommand`, `OptimisticSync`, `OptimisticSyncWithPush`,
 *   `ServerPush` or `LoadPages`, which must not be overridden. The optimistic update (or, in a
 *   `ServerPush`, the revision checks, or, in a `LoadPages`, the loading of the pages) stops
 *   working. (At runtime, the dispatch also throws a `StoreException` for it.)
 *
 * - In a subclass of `LoadPages`: `abortDispatch()` without `super.abortDispatch()` (a `'next'`
 *   or `'previous'` then runs while another load of the list is running, or when there is no
 *   page in that direction), the `ignoreFresh` or `ignoreThrottle` getter without
 *   `super.ignoreFresh` or `super.ignoreThrottle` (a `'next'` or `'previous'` is then aborted
 *   while the list is fresh or throttled), and the `statusKey` getter, which is
 *   `pagesKeyParams()` and must not be overridden (at runtime, the dispatch also throws a
 *   `StoreException` for it).
 *
 * Note: `before()` doesn't need to call `super.before()`, since the default `before()` does
 * nothing. The internet check of `checkInternet` is done by the store, before `before()`.
 */
export default createRule({
  name: 'missing-super-in-override',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow overrides that turn off `OptimisticCommand`, `OptimisticSync`, ' +
        '`OptimisticSyncWithPush`, `ServerPush` or `LoadPages`.',
    },
    schema: [],
    messages: {
      optimisticReduce:
        'Don\'t override `reduce` in an `OptimisticCommand`. Its `reduce` does the optimistic update, ' +
        'so overriding it turns that off. Implement `optimisticValue`, `getValueFromState`, ' +
        '`applyValueToState` and `sendCommandToServer` instead.',
      optimisticSyncReduce:
        'Don\'t override `reduce` in an `OptimisticSync`. Its `reduce` does the optimistic update, and ' +
        'sends the requests to the server, so overriding it turns that off. Implement `valueToApply`, ' +
        '`applyOptimisticValueToState`, `getValueFromState` and `sendValueToServer` instead.',
      optimisticSyncWithPushReduce:
        'Don\'t override `reduce` in an `OptimisticSyncWithPush`. Its `reduce` does the optimistic update, ' +
        'and sends the requests to the server, so overriding it turns that off. Implement `valueToApply`, ' +
        '`applyOptimisticValueToState`, `getValueFromState`, `sendValueToServer` and ' +
        '`getServerRevisionFromState` instead.',
      serverPushReduce:
        'Don\'t override `reduce` in a `ServerPush`. Its `reduce` ignores the stale pushes, and records ' +
        'the server revisions, so overriding it turns that off. Implement `associatedAction`, ' +
        '`pushMetadata`, `applyServerPushToState` and `getServerRevisionFromState` instead.',
      loadPagesReduce:
        'Don\'t override `reduce` in a `LoadPages`. Its `reduce` loads the pages and puts them in the ' +
        'state, so overriding it turns that off. Implement `getPagesFromState`, `applyPagesToState`, ' +
        '`initialPageParam`, `loadPage` and `nextPageParam` instead.',
      loadPagesAbortDispatch:
        'This `abortDispatch` doesn\'t call `super.abortDispatch()`, so the `LoadPages` no longer aborts a ' +
        '`\'next\'` or `\'previous\'` while another load of the list is running, or when there is no page ' +
        'in that direction. Return `super.abortDispatch() || ...`.',
      loadPagesIgnoreFresh:
        'This `{{name}}` doesn\'t read `super.{{name}}`, so a `\'next\'` or `\'previous\'` of this ' +
        '`LoadPages` is aborted while the list is {{period}}. Return `... || super.{{name}}`.',
      loadPagesStatusKey:
        'Don\'t override `statusKey` in a `LoadPages`. It\'s `pagesKeyParams()`, which the `LoadPages` ' +
        'uses to find the other loads of the same list. Override `pagesKeyParams()` instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const reduce = findMethod(classNode, 'reduce');
      const abortDispatch = findMethod(classNode, 'abortDispatch');
      const ignoreFresh = findGetter(classNode, 'ignoreFresh');
      const ignoreThrottle = findGetter(classNode, 'ignoreThrottle');
      const statusKey = findGetter(classNode, 'statusKey');
      if (!reduce && !abortDispatch && !ignoreFresh && !ignoreThrottle && !statusKey) return;
      if (!isActionClass(classNode, context, typeInfo)) return;

      // The overrides of a `LoadPages`.
      if ((abortDispatch || ignoreFresh || ignoreThrottle || statusKey) && extendsLoadPages(classNode, context, typeInfo)) {
        if (abortDispatch && !callsSuper(abortDispatch, 'abortDispatch')) {
          context.report({node: abortDispatch.key, messageId: 'loadPagesAbortDispatch'});
        }
        for (const [getter, name, period] of [[ignoreFresh, 'ignoreFresh', 'fresh'], [ignoreThrottle, 'ignoreThrottle', 'throttled']] as const) {
          if (getter && !callsSuper(getter, name)) {
            context.report({node: getter.key, messageId: 'loadPagesIgnoreFresh', data: {name, period}});
          }
        }
        if (statusKey) {
          context.report({node: statusKey.key, messageId: 'loadPagesStatusKey'});
        }
      }
      if (!reduce) return;

      // `reduce` in an `OptimisticCommand`.
      if (extendsOptimisticCommand(classNode, context, typeInfo)) {
        context.report({node: reduce.key, messageId: 'optimisticReduce'});
      }

      // `reduce` in an `OptimisticSync`.
      else if (extendsOptimisticSync(classNode, context, typeInfo)) {
        context.report({node: reduce.key, messageId: 'optimisticSyncReduce'});
      }

      // `reduce` in an `OptimisticSyncWithPush`.
      else if (extendsOptimisticSyncWithPush(classNode, context, typeInfo)) {
        context.report({node: reduce.key, messageId: 'optimisticSyncWithPushReduce'});
      }

      // `reduce` in a `ServerPush`.
      else if (extendsServerPush(classNode, context, typeInfo)) {
        context.report({node: reduce.key, messageId: 'serverPushReduce'});
      }

      // `reduce` in a `LoadPages`.
      else if (extendsLoadPages(classNode, context, typeInfo)) {
        context.report({node: reduce.key, messageId: 'loadPagesReduce'});
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/** The non-static getter with the given name, declared in the class itself. */
function findGetter(classNode: ClassNode, name: string): TSESTree.MethodDefinition | null {
  for (const member of classNode.body.body) {
    if (member.type === AST_NODE_TYPES.MethodDefinition && !member.static && member.kind === 'get' &&
      memberName(member) === name) return member;
  }
  return null;
}
