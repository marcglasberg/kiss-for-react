import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { ClassNode, hasAsyncBefore, hasAwait, intrinsicName, isActionClass, mayBeThenable, mayRetry, overridesMethod } from '../actionMethods.js';
import { createRule, findMethod, getTypeInfo, isFunction, returnedExpressions, TypeInfo, unwrap } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports an async `reduce` without any `await`:
 *
 * ```ts
 * async reduce() {                         // Warning
 *   return (state: State) => state.add(1);
 * }
 * ```
 *
 * In Kiss, this doesn't lose state changes, since the returned function gets the current state.
 * But the `async` makes the action async for nothing: `dispatchSync` throws, `isWaiting` is
 * true for a moment, and the component renders one more time.
 *
 * Not reported when the action is async anyway (its `before` is async, or it sets
 * `checkInternet`), when it uses `retry` (which needs an async `reduce`), when it overrides
 * `wrapReduce`, or when `reduce` may return a promise.
 *
 * Suggestion: make `reduce` sync, turning `return () => x` and `return (state) => x` into
 * `return x` (with `this.state` instead of `state`).
 */
export default createRule({
  name: 'reduce-without-await',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow an async `reduce` without `await`.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      noAwait:
        'This `reduce` is `async`, but has no `await`. This makes the action async for nothing: ' +
        '`dispatchSync` throws, `isWaiting` is true for a moment, and the component renders one more time.',
      makeSync: 'Make `reduce` sync.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const reduce = findMethod(classNode, 'reduce');
      if (!reduce || !reduce.value.async || !reduce.value.body) return;
      if (reduce.value.generator) return;
      if (hasAwait(reduce.value.body)) return;
      if (!isActionClass(classNode, context, typeInfo)) return;

      const returns = returnedExpressions(reduce.value);
      if (!returns.every((expression) => isSurelyNotPromise(expression, typeInfo))) return;

      // The action is async anyway, or it needs an async `reduce`.
      if (hasAsyncBefore(classNode, context, typeInfo)) return;
      if (mayRetry(classNode, context, typeInfo)) return;
      if (overridesMethod(classNode, 'wrapReduce', context, typeInfo)) return;

      const fix = makeSyncFix(reduce, returns, context);
      context.report({
        node: reduce.key,
        messageId: 'noAwait',
        suggest: fix ? [{messageId: 'makeSync', fix}] : [],
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

const isNullOrUndefined = (node: TSESTree.Node) =>
  (node.type === AST_NODE_TYPES.Literal && node.value === null) ||
  (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined');

/** True if the returned value is surely not a promise (if it may be, `reduce` is really async). */
function isSurelyNotPromise(expression: TSESTree.Expression, typeInfo: TypeInfo | null): boolean {
  const node = unwrap(expression);
  if (isNullOrUndefined(node) || isFunction(node)) return true;
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return isSurelyNotPromise(node.consequent, typeInfo) && isSurelyNotPromise(node.alternate, typeInfo);
  }
  if (!typeInfo) return false;
  const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(node) as ts.Node;
  const type = typeInfo.checker.getTypeAtLocation(tsNode);
  if (intrinsicName(type) === 'unknown') return false;
  return !mayBeThenable(type);
}

/**
 * Removes `async`, and turns each `return () => x` and `return (state) => x` into `return x`,
 * with `this.state` instead of `state`. Only when all returns are `null`, or arrow functions
 * with an expression body, and `reduce` has no declared return type.
 */
function makeSyncFix(
  reduce: TSESTree.MethodDefinition,
  returns: TSESTree.Expression[],
  context: Context,
): ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix[]) | null {
  if (reduce.value.returnType) return null;
  const asyncToken = context.sourceCode.getFirstToken(reduce, (token) => token.value === 'async');
  if (!asyncToken) return null;

  const replacements: { node: TSESTree.Node, text: string }[] = [];
  for (const expression of returns) {
    const node = unwrap(expression);
    if (isNullOrUndefined(node)) continue;
    if (node.type !== AST_NODE_TYPES.ArrowFunctionExpression) return null;
    const text = inlinedBody(node, context);
    if (text === null) return null;
    replacements.push({node: expression, text});
  }

  return (fixer) => {
    const nextToken = context.sourceCode.getTokenAfter(asyncToken)!;
    return [
      fixer.removeRange([asyncToken.range[0], nextToken.range[0]]),
      ...replacements.map(({node, text}) => fixer.replaceText(node, text)),
    ];
  };
}

/** The body of the arrow function, with `this.state` instead of its parameter. Null if not possible. */
function inlinedBody(fn: TSESTree.ArrowFunctionExpression, context: Context): string | null {
  if (fn.async || fn.body.type === AST_NODE_TYPES.BlockStatement || fn.params.length > 1) return null;
  const body = fn.body;
  const bodyText = context.sourceCode.getText(body);
  if (fn.params.length === 0) return bodyText;

  const param = fn.params[0];
  if (param.type !== AST_NODE_TYPES.Identifier) return null;
  const variable = context.sourceCode.getDeclaredVariables(fn).find((v) => v.name === param.name);
  if (!variable) return null;

  const edits: { range: [number, number], text: string }[] = [];
  for (const reference of variable.references) {
    const identifier = reference.identifier as TSESTree.Identifier;
    if (identifier.range[0] < body.range[0] || identifier.range[1] > body.range[1]) return null;
    // Inside a non-arrow function, `this` is not the action.
    for (let node: TSESTree.Node | undefined = identifier.parent; node && node !== fn; node = node.parent) {
      if (node.type === AST_NODE_TYPES.FunctionExpression || node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.ClassDeclaration || node.type === AST_NODE_TYPES.ClassExpression) return null;
    }
    if (!reference.isRead() || reference.isWrite()) return null;
    const parent = identifier.parent;
    const isShorthand = parent?.type === AST_NODE_TYPES.Property && parent.shorthand && parent.value === identifier;
    edits.push({range: identifier.range, text: isShorthand ? `${param.name}: this.state` : 'this.state'});
  }

  let result = '';
  let position = body.range[0];
  for (const edit of edits.sort((a, b) => a.range[0] - b.range[0])) {
    result += context.sourceCode.text.slice(position, edit.range[0]) + edit.text;
    position = edit.range[1];
  }
  result += context.sourceCode.text.slice(position, body.range[1]);
  return result;
}
