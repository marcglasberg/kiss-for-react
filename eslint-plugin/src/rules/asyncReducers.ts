import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { findMethod, isKissActionClass, isAsyncMethod, returnedExpressions, TypeInfo, unwrap } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/** An async `reduce` method of a Kiss action. */
export interface AsyncReducer {
  method: TSESTree.MethodDefinition;
  body: TSESTree.BlockStatement;
  /** The arrow functions returned by the reducer: `return (state: State) => ...`. */
  returnedFunctions: TSESTree.ArrowFunctionExpression[];
}

/** If the class is a Kiss action with an async `reduce`, returns that reducer. */
export function asyncReducerOf(
  classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
  context: Context,
  typeInfo: TypeInfo | null,
): AsyncReducer | null {
  const method = findMethod(classNode, 'reduce');
  if (!method || !method.value.body) return null;
  if (!isAsyncMethod(method, context, typeInfo)) return null;
  if (!isKissActionClass(classNode, typeInfo)) return null;

  const returnedFunctions = returnedExpressions(method.value)
    .map((expression) => unwrap(expression))
    .filter((expression): expression is TSESTree.ArrowFunctionExpression =>
      expression.type === AST_NODE_TYPES.ArrowFunctionExpression);

  return {method, body: method.value.body, returnedFunctions};
}

/** The name of the first parameter of the function, if it's a simple identifier. */
export function stateParamName(fn: TSESTree.ArrowFunctionExpression): string | null {
  const param = fn.params[0];
  return param?.type === AST_NODE_TYPES.Identifier ? param.name : null;
}
