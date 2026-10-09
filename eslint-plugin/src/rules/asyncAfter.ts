import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { ClassNode, hasAwait, intrinsicName, isActionClass, mayBeThenable } from '../actionMethods.js';
import { createRule, findMethod, getTypeInfo, TypeInfo, walk } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports an `async after()` method, or an `after()` that returns a promise:
 *
 * ```ts
 * async after() { await this.cleanup(); } // Error
 * after() { this.cleanup(); }             // OK
 * ```
 *
 * Kiss requires `after` to be sync. It doesn't wait for the promise, so the code after the
 * first `await` runs after the action finished, and its errors are only logged. TypeScript
 * allows it, since `void` methods can be overridden with async ones.
 *
 * Suggestion: remove `async`, when `after` has no `await`.
 */
export default createRule({
  name: 'async-after',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow an async `after` method in actions.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      asyncAfter:
        'The `after` method must be sync. Kiss doesn\'t wait for the promise it returns, so the code ' +
        'after the first `await` runs after the action finished, and its errors are only logged.',
      removeAsync: 'Remove `async`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const after = findMethod(classNode, 'after');
      if (!after || !returnsPromise(after, context, typeInfo)) return;
      if (!isActionClass(classNode, context, typeInfo)) return;

      const fix = removeAsyncFix(after, context);
      context.report({
        node: after.key,
        messageId: 'asyncAfter',
        suggest: fix ? [{messageId: 'removeAsync', fix}] : [],
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/**
 * True if `after` is async, or its declared return type has a `Promise`, or (with type
 * information) it returns a promise (or may return one).
 */
function returnsPromise(method: TSESTree.MethodDefinition, context: Context, typeInfo: TypeInfo | null): boolean {
  if (method.value.async) return true;
  const returnType = method.value.returnType;
  if (returnType && /\b(Promise|PromiseLike)\s*</.test(context.sourceCode.getText(returnType))) return true;
  if (!typeInfo || !method.value.body) return false;
  const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(method) as ts.MethodDeclaration;
  const signature = typeInfo.checker.getSignatureFromDeclaration(tsNode);
  if (!signature) return false;
  const type = typeInfo.checker.getReturnTypeOfSignature(signature);
  // `any` is not reported.
  if (intrinsicName(type) === 'any') return false;
  return mayBeThenable(type);
}

/** Removes `async`. Only when `after` has no `await`, no declared return type, and returns no value. */
function removeAsyncFix(
  method: TSESTree.MethodDefinition,
  context: Context,
): ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix) | null {
  const body = method.value.body;
  if (!method.value.async || method.value.generator || method.value.returnType || !body || hasAwait(body)) return null;
  let returnsValue = false;
  walk(body, (node) => {
    if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) returnsValue = true;
  });
  if (returnsValue) return null;
  const asyncToken = context.sourceCode.getFirstToken(method, (token) => token.value === 'async');
  if (!asyncToken) return null;
  const nextToken = context.sourceCode.getTokenAfter(asyncToken)!;
  return (fixer) => fixer.removeRange([asyncToken.range[0], nextToken.range[0]]);
}
