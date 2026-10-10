import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { isUnlimitedRetryCheckInternetOn } from '../actionFeatures.js';
import {
  createRule,
  findMethod,
  findProperty,
  getTypeInfo,
  isAsyncMethod,
  isKissActionClass,
  memberName,
  unwrap,
  walk,
} from '../utils.js';

/**
 * Reports an action with `retry` or `unlimitedRetryCheckInternet` whose `reduce` is sync:
 *
 * ```ts
 * class LoadText extends Action {
 *   retry = { on: true };          // Error
 *   reduce() { return ...; }
 * }
 *
 * class LoadText extends Action {
 *   unlimitedRetryCheckInternet = true; // Error
 *   reduce() { return ...; }
 * }
 * ```
 *
 * Retry only works with async reducers. Dispatching this action fails with a `StoreException`,
 * even if the reducer succeeds.
 *
 * Suggestions: remove the property, or make `reduce` async (each `return x` becomes
 * `return () => x`).
 */
export default createRule({
  name: 'retry-requires-async-reduce',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `retry` and `unlimitedRetryCheckInternet` in actions whose `reduce` is sync.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      syncReduce:
        'Retry only works with an async `reduce`, but this `reduce` is sync. Dispatching this action ' +
        'fails with a `StoreException`.',
      syncReduceUnlimitedRetryCheckInternet:
        '`unlimitedRetryCheckInternet` only works with an async `reduce`, but this `reduce` is sync. ' +
        'Dispatching this action fails with a `StoreException`.',
      remove: 'Remove `{{property}}`.',
      makeAsync: 'Make `reduce` async.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression) => {
      const retry = findProperty(classNode, 'retry');
      const unlimited = findProperty(classNode, 'unlimitedRetryCheckInternet');
      const properties = [
        ...(retry && isRetryOn(retry) ? [{property: retry, name: 'retry', messageId: 'syncReduce'}] as const : []),
        ...(unlimited?.value && isUnlimitedRetryCheckInternetOn(context.sourceCode.getText(unlimited.value))
          ? [{property: unlimited, name: 'unlimitedRetryCheckInternet', messageId: 'syncReduceUnlimitedRetryCheckInternet'}] as const
          : []),
      ];
      if (properties.length === 0) return;

      const reduce = findMethod(classNode, 'reduce');
      if (!reduce || !reduce.value.body) return;
      if (!isKissActionClass(classNode, typeInfo)) return;
      if (isAsyncMethod(reduce, context, typeInfo)) return;

      for (const {property, name, messageId} of properties) {
        const suggest: TSESLint.SuggestionReportDescriptor<'remove' | 'makeAsync'>[] = [
          {messageId: 'remove', data: {property: name}, fix: (fixer) => removeMember(fixer, property, context)},
        ];
        const makeAsync = makeAsyncFix(reduce, context);
        if (makeAsync) suggest.push({messageId: 'makeAsync', fix: makeAsync});

        context.report({node: property.key, messageId, suggest});
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/** False only for `retry = { on: false }` (and `retry = undefined` or `null`). */
function isRetryOn(retry: TSESTree.PropertyDefinition): boolean {
  if (!retry.value) return false;
  const value = unwrap(retry.value);
  if (value.type === AST_NODE_TYPES.Literal && value.value === null) return false;
  if (value.type === AST_NODE_TYPES.Identifier && value.name === 'undefined') return false;
  if (value.type === AST_NODE_TYPES.ObjectExpression) {
    for (const property of value.properties) {
      if (property.type === AST_NODE_TYPES.Property && !property.computed &&
        property.key.type === AST_NODE_TYPES.Identifier && property.key.name === 'on' &&
        property.value.type === AST_NODE_TYPES.Literal && property.value.value === false) return false;
    }
  }
  return true;
}

/** Removes a class member, with its line if it's alone in it. */
function removeMember(
  fixer: TSESLint.RuleFixer,
  member: TSESTree.ClassElement,
  context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
): TSESLint.RuleFix {
  const text = context.sourceCode.getText();
  let start = member.range[0];
  let end = member.range[1];
  while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--;
  const lineStart = start === 0 || text[start - 1] === '\n';
  let after = end;
  while (after < text.length && (text[after] === ' ' || text[after] === '\t')) after++;
  if (lineStart && (text[after] === '\n' || text.startsWith('\r\n', after))) {
    end = after + (text[after] === '\n' ? 1 : 2);
    return fixer.removeRange([start, end]);
  }
  return fixer.remove(member);
}

/**
 * Makes `reduce` async, and turns each `return x` into `return () => x`, since an async reducer
 * returns a function. Only when `reduce` has no declared return type, which would also need to change.
 */
function makeAsyncFix(
  reduce: TSESTree.MethodDefinition,
  context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
): ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix[]) | null {
  if (reduce.value.returnType || memberName(reduce) !== 'reduce') return null;
  const body = reduce.value.body;
  if (!body) return null;

  const returns: TSESTree.Expression[] = [];
  walk(body, (node) => {
    if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) returns.push(node.argument);
  });

  return (fixer) => [
    fixer.insertTextBefore(reduce.key, 'async '),
    ...returns
      .filter((argument) => !(argument.type === AST_NODE_TYPES.Literal && argument.value === null))
      .map((argument) => {
        const text = context.sourceCode.getText(argument);
        const needsParens = unwrap(argument).type === AST_NODE_TYPES.ObjectExpression ||
          argument.type === AST_NODE_TYPES.SequenceExpression;
        return fixer.replaceText(argument, `() => ${needsParens ? `(${text})` : text}`);
      }),
  ];
}
