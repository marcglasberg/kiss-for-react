import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  callsSuper,
  ClassNode,
  declaresCheckInternet,
  extendsOptimisticCommand,
  extendsOptimisticSync,
  inheritedBeforeWithoutSuper,
  isActionClass,
  readsThisMember,
  setsCheckInternet,
} from '../actionMethods.js';
import { createRule, findMethod, getTypeInfo } from '../utils.js';

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
 * - `reduce()` in a subclass of `OptimisticCommand` or `OptimisticSync`, which must not be
 *   overridden. The optimistic update stops working.
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
      description: 'Disallow overrides that turn off `checkInternet`, `OptimisticCommand` or `OptimisticSync`, because they don\'t call `super`.',
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
      if (!before && !reduce && !checkInternet) return;
      if (!isActionClass(classNode, context, typeInfo)) return;

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
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

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
