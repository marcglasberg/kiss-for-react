import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  callsSuper,
  ClassNode,
  declaresCheckInternet,
  extendsLoadPages,
  extendsOptimisticCommand,
  extendsOptimisticSync,
  extendsOptimisticSyncWithPush,
  extendsServerPush,
  inheritedBeforeWithoutSuper,
  isActionClass,
  readsThisMember,
  setsCheckInternet,
} from '../actionMethods.js';
import { createRule, findMethod, getTypeInfo, memberName } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports an override that silently turns off a Kiss feature, because it doesn't call `super`:
 *
 * - `before()` without `super.before()`, in an action that sets `checkInternet` (or inherits
 *   it). The internet check stops working. Also reported in `checkInternet`, when the action
 *   inherits such a `before` from a superclass.
 *
 *   ```ts
 *   class LoadUser extends Action {
 *     checkInternet = { dialog: true };
 *     async before() { await this.prepare(); }                      // Error
 *     async before() { await super.before(); await this.prepare(); } // OK
 *   }
 *   ```
 *
 * - `reduce()` in a subclass of `OptimisticCommand`, `OptimisticSync`, `OptimisticSyncWithPush`,
 *   `ServerPush` or `LoadPages`, which must not be overridden. The optimistic update (or, in a
 *   `ServerPush`, the revision checks, or, in a `LoadPages`, the loading of the pages) stops
 *   working.
 *
 * - In a subclass of `LoadPages`: `abortDispatch()` without `super.abortDispatch()` (a `'next'`
 *   or `'previous'` then runs while another load of the list is running, or when there is no
 *   page in that direction), the `ignoreFresh` or `ignoreThrottle` getter without
 *   `super.ignoreFresh` or `super.ignoreThrottle` (a `'next'` or `'previous'` is then aborted
 *   while the list is fresh or throttled), and the `statusKey` getter, which is
 *   `pagesKeyParams()` and must not be overridden.
 *
 * A `before` that reads `this.checkInternet` is assumed to check the internet by itself.
 *
 * Suggestion, for `before`: add `await super.before();` as the first statement (and make
 * `before` async, if needed).
 */
export default createRule({
  name: 'missing-super-in-override',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow overrides that turn off `checkInternet`, `OptimisticCommand`, `OptimisticSync`, ' +
        '`OptimisticSyncWithPush`, `ServerPush` or `LoadPages`, because they don\'t call `super`.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      beforeWithoutSuper:
        'This `before` doesn\'t call `super.before()`, so `checkInternet` doesn\'t work: the action ' +
        'never checks the internet connection. Call `await super.before()` first.',
      inheritedBeforeWithoutSuper:
        'This `checkInternet` doesn\'t work, because the `before` of `{{className}}` doesn\'t call ' +
        '`super.before()`: the action never checks the internet connection.',
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
      addSuper: 'Call `await super.before()` first.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const before = findMethod(classNode, 'before');
      const reduce = findMethod(classNode, 'reduce');
      const checkInternet = declaresCheckInternet(classNode);
      const abortDispatch = findMethod(classNode, 'abortDispatch');
      const ignoreFresh = findGetter(classNode, 'ignoreFresh');
      const ignoreThrottle = findGetter(classNode, 'ignoreThrottle');
      const statusKey = findGetter(classNode, 'statusKey');
      if (!before && !reduce && !checkInternet && !abortDispatch && !ignoreFresh && !ignoreThrottle && !statusKey) return;
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
      if (!before && !reduce && !checkInternet) return;

      // `before` without `super.before()`.
      if (before?.value.body && setsCheckInternet(classNode, context, typeInfo) &&
        !callsSuper(before, 'before') && !readsThisMember(before, 'checkInternet')) {
        const fix = addSuperFix(before, context);
        context.report({
          node: before.key,
          messageId: 'beforeWithoutSuper',
          suggest: fix ? [{messageId: 'addSuper', fix}] : [],
        });
      }
      // An inherited `before` without `super.before()`.
      else if (checkInternet && (!before || callsSuper(before, 'before'))) {
        const className = inheritedBeforeWithoutSuper(classNode, context, typeInfo);
        if (className) {
          context.report({node: checkInternet.key, messageId: 'inheritedBeforeWithoutSuper', data: {className}});
        }
      }

      // `reduce` in an `OptimisticCommand`.
      if (reduce && extendsOptimisticCommand(classNode, context, typeInfo)) {
        context.report({node: reduce.key, messageId: 'optimisticReduce'});
      }

      // `reduce` in an `OptimisticSync`.
      else if (reduce && extendsOptimisticSync(classNode, context, typeInfo)) {
        context.report({node: reduce.key, messageId: 'optimisticSyncReduce'});
      }

      // `reduce` in an `OptimisticSyncWithPush`.
      else if (reduce && extendsOptimisticSyncWithPush(classNode, context, typeInfo)) {
        context.report({node: reduce.key, messageId: 'optimisticSyncWithPushReduce'});
      }

      // `reduce` in a `ServerPush`.
      else if (reduce && extendsServerPush(classNode, context, typeInfo)) {
        context.report({node: reduce.key, messageId: 'serverPushReduce'});
      }

      // `reduce` in a `LoadPages`.
      else if (reduce && extendsLoadPages(classNode, context, typeInfo)) {
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

/**
 * Adds `await super.before();` as the first statement of `before`, and makes it async if it's
 * not. Only when `before` has no declared return type, or one with a `Promise`.
 */
function addSuperFix(
  before: TSESTree.MethodDefinition,
  context: Context,
): ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix[]) | null {
  const body = before.value.body;
  if (!body || before.value.generator) return null;
  const returnType = before.value.returnType;
  if (returnType && !/\bPromise\s*</.test(context.sourceCode.getText(returnType))) return null;
  const isAsync = before.value.async;

  return (fixer) => {
    const fixes: TSESLint.RuleFix[] = [];
    if (!isAsync) fixes.push(fixer.insertTextBefore(before.key, 'async '));

    const statement = 'await super.before();';
    const first = body.body[0];
    if (!first) {
      fixes.push(fixer.replaceText(body, `{ ${statement} }`));
    } else if (first.loc.start.line === body.loc.start.line) {
      fixes.push(fixer.insertTextBefore(first, `${statement} `));
    } else {
      const indent = context.sourceCode.lines[first.loc.start.line - 1].slice(0, first.loc.start.column);
      fixes.push(fixer.insertTextBefore(first, `${statement}\n${/^\s*$/.test(indent) ? indent : ''}`));
    }
    return fixes;
  };
}
