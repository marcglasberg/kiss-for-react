import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { createRule, getTypeInfo, isThisState, TypeInfo, walk } from '../utils.js';
import { asyncReducerOf, stateParamName } from './asyncReducers.js';

/**
 * Reports `this.state` inside the function returned by an async `reduce`:
 *
 * ```ts
 * async reduce() {
 *   const user = await loadUser();
 *   return (state: State) => this.state.copy({ user }); // Use `state`.
 * }
 * ```
 *
 * That function gets the current state as its parameter, so use it. When the function runs,
 * `this.state` is the same, but reading it there hides that the function gets the state.
 *
 * Fix: replace `this.state` with the parameter. If the function has no parameter, and the
 * code is linted with type information, the fix also adds the parameter.
 */
export default createRule({
  name: 'prefer-state-parameter',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Use the state parameter, instead of `this.state`, in the function returned by an async reducer.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useParameter: 'Use the `{{name}}` parameter instead of `this.state`. This function gets the current state as its parameter.',
      addParameter: 'Use a `state` parameter instead of `this.state`. This function gets the current state as its parameter.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression) => {
      const reducer = asyncReducerOf(classNode, context, typeInfo);
      if (!reducer) return;

      for (const fn of reducer.returnedFunctions) {
        // Nested arrow functions keep the same `this`, so look into them too.
        const thisStates: TSESTree.MemberExpression[] = [];
        walk(fn.body, (node) => {
          if (isThisState(node) && hasSameThis(node, fn)) thisStates.push(node);
        }, true);
        if (thisStates.length === 0) continue;

        const name = stateParamName(fn);
        if (name) {
          // Don't fix if the parameter name is shadowed where `this.state` is used.
          for (const thisState of thisStates) {
            const shadowed = ASTUtils.findVariable(context.sourceCode.getScope(thisState), name)?.defs[0]?.node !== fn;
            context.report({
              node: thisState,
              messageId: 'useParameter',
              data: {name},
              fix: shadowed ? null : (fixer) => fixer.replaceText(thisState, name),
            });
          }
        } else {
          const fixAll = addParameterFix(fn, thisStates, context, typeInfo);
          thisStates.forEach((thisState, index) => {
            context.report({
              node: thisState,
              messageId: 'addParameter',
              // All the `this.state` in the function are fixed together, with the first report.
              fix: (index === 0 && fixAll) ? fixAll : null,
            });
          });
        }
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/** True if `node` sees the same `this` as `fn`: no non-arrow function (or class) between them. */
function hasSameThis(node: TSESTree.Node, fn: TSESTree.ArrowFunctionExpression): boolean {
  for (let current = node.parent; current && current !== fn; current = current.parent) {
    if (current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.ClassDeclaration ||
      current.type === AST_NODE_TYPES.ClassExpression) return false;
  }
  return true;
}

/**
 * Adds a `state` parameter to the function, typed with the type of `this.state`, and replaces
 * all `this.state` with it. Only with type information, since the parameter needs a type.
 */
function addParameterFix(
  fn: TSESTree.ArrowFunctionExpression,
  thisStates: TSESTree.MemberExpression[],
  context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
  typeInfo: TypeInfo | null,
): ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix[]) | null {
  if (!typeInfo || fn.params.length > 0) return null;

  // The name `state` must be free inside the function.
  for (const thisState of thisStates) {
    if (ASTUtils.findVariable(context.sourceCode.getScope(thisState), 'state')) return null;
  }

  const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(thisStates[0]) as ts.Node;
  const type = typeInfo.checker.getTypeAtLocation(tsNode);
  const typeName = typeInfo.checker.typeToString(type);
  if (!typeName || typeName === 'any' || typeName.includes('{')) return null;

  // The `(` and `)` of the empty parameter list.
  const arrow = context.sourceCode.getTokenBefore(fn.body, (token) => token.value === '=>');
  if (!arrow) return null;
  const beforeArrow = fn.returnType ?? arrow;
  const closeParen = context.sourceCode.getTokenBefore(beforeArrow);
  if (!closeParen || closeParen.value !== ')') return null;

  return (fixer) => [
    fixer.insertTextBefore(closeParen, `state: ${typeName}`),
    ...thisStates.map((thisState) => fixer.replaceText(thisState, 'state')),
  ];
}
