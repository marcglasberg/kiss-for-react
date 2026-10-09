import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { ClassNode, intrinsicName, isActionClass, mutatesState } from '../actionMethods.js';
import { createRule, findMethod, getTypeInfo, isAsyncMethod, isThisState, returnedExpressions, TypeInfo, unwrap } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports a reducer that returns the state unchanged:
 *
 * ```ts
 * reduce() {
 *   if (this.state.user === null) return this.state; // Warning
 *   if (this.state.user === null) return null;       // OK
 * }
 *
 * async reduce() {
 *   await save();
 *   return (state: State) => state;                  // Warning
 *   return null;                                     // OK
 * }
 * ```
 *
 * Kiss treats both the same way (the state didn't change), but `null` says it clearly.
 *
 * Not reported when the reducer seems to mutate the state (like `this.state.items.push(x)`),
 * since the problem there is the mutation.
 *
 * Fix (automatic): return `null`. Only when the declared return type of `reduce` accepts `null`.
 */
export default createRule({
  name: 'prefer-return-null',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Return `null`, instead of the unchanged state, from a reducer.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      returnNull:
        'Return `null` instead of the unchanged state. Kiss treats both the same way, but `null` ' +
        'says clearly that the state didn\'t change.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const reduce = findMethod(classNode, 'reduce');
      if (!reduce || !reduce.value.body || reduce.value.generator) return;
      if (!isActionClass(classNode, context, typeInfo)) return;
      // Returning `this.state` after mutating it is a different problem.
      if (mutatesState(reduce.value.body)) return;

      const isAsync = isAsyncMethod(reduce, context, typeInfo);
      const canFix = acceptsNull(reduce, isAsync, context, typeInfo);

      for (const expression of returnedExpressions(reduce.value)) {
        if (!(isAsync ? isUnchangedStateFunction(expression) : isThisState(unwrap(expression)))) continue;
        context.report({
          node: expression,
          messageId: 'returnNull',
          fix: canFix ? (fixer) => fixer.replaceText(expression, 'null') : null,
        });
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/**
 * True for a function that returns the state unchanged: `(state) => state`, `() => this.state`,
 * or the same with a block body that only has the `return`.
 */
function isUnchangedStateFunction(expression: TSESTree.Expression): boolean {
  const fn = unwrap(expression);
  if (fn.type !== AST_NODE_TYPES.ArrowFunctionExpression || fn.async || fn.params.length > 1) return false;
  let returned: TSESTree.Node | null = fn.body;
  if (fn.body.type === AST_NODE_TYPES.BlockStatement) {
    const statements = fn.body.body;
    returned = statements.length === 1 && statements[0].type === AST_NODE_TYPES.ReturnStatement
      ? statements[0].argument : null;
  }
  if (!returned) return false;
  returned = unwrap(returned);
  if (isThisState(returned)) return true;
  const param = fn.params[0];
  return param?.type === AST_NODE_TYPES.Identifier && returned.type === AST_NODE_TYPES.Identifier &&
    returned.name === param.name;
}

/** True if `return null` compiles: `reduce` has no declared return type, or it accepts `null`. */
function acceptsNull(reduce: TSESTree.MethodDefinition, isAsync: boolean, context: Context, typeInfo: TypeInfo | null): boolean {
  const returnType = reduce.value.returnType;
  if (!returnType) return true;
  if (!typeInfo) return /\bnull\b/.test(context.sourceCode.getText(returnType));

  const {checker} = typeInfo;
  const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(reduce) as ts.MethodDeclaration;
  const signature = checker.getSignatureFromDeclaration(tsNode);
  if (!signature) return false;
  let type: ts.Type | undefined = checker.getReturnTypeOfSignature(signature);
  if (isAsync) type = checker.getAwaitedType(type);
  if (!type) return false;
  const types = type.isUnion() ? type.types : [type];
  return types.some((t) => ['any', 'unknown', 'null'].includes(intrinsicName(t) ?? ''));
}
