import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { contains, createRule, getTypeInfo, isThisState, unwrap, walk } from '../utils.js';
import { asyncReducerOf, stateParamName } from './asyncReducers.js';

/**
 * Reports an async `reduce` that copies `this.state` to a local variable before an `await`,
 * and uses that variable after the `await` to build the state it returns:
 *
 * ```ts
 * async reduce() {
 *   const s = this.state;
 *   const user = await api.loadUser();
 *   return (state: State) => s.copy({ user });     // Error
 *   return (state: State) => state.copy({ user }); // OK
 * }
 * ```
 *
 * `this.state` always has the current state, but the variable keeps the old one. If other
 * actions change the state during the `await`, their changes are lost.
 *
 * Uses that build the returned state are the ones in the `return`, and in other local variables
 * that end up in the `return`. Uses in a condition, like `if (s.user === null)`, and inside an
 * `await`, like `await api.load(s.id)`, are not reported. The order is the source order, so an
 * `await` inside an `if` counts for the code after the `if`, but not for the `else` branch.
 *
 * Suggestion: use the state parameter of the returned function (or `this.state`) instead.
 */
export default createRule({
  name: 'stale-state-after-await',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow building the new state from a copy of `this.state` made before an `await`.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      staleState:
        '`{{name}}` has the state from before the `await`. If other actions changed the state during ' +
        'the `await`, their changes are lost. Use {{replacement}} instead.',
      useReplacement: 'Use {{replacement}} instead of `{{name}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression) => {
      const reducer = asyncReducerOf(classNode, context, typeInfo);
      if (!reducer) return;
      const {body, returnedFunctions} = reducer;

      // The `await`s of the reducer (not of nested functions).
      const awaits: TSESTree.Node[] = [];
      walk(body, (node) => {
        if (node.type === AST_NODE_TYPES.AwaitExpression) awaits.push(node);
        if (node.type === AST_NODE_TYPES.ForOfStatement && node.await) awaits.push(node.right);
      });
      if (awaits.length === 0) return;

      // The `return` arguments, and the local variables of the reducer.
      const returnArguments: TSESTree.Node[] = [];
      const declarators: TSESTree.VariableDeclarator[] = [];
      walk(body, (node) => {
        if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) returnArguments.push(node.argument);
        if (node.type === AST_NODE_TYPES.VariableDeclarator) declarators.push(node);
      });

      // The expressions that build the returned state: the `return` arguments, and the
      // initializers of the local variables used in them (and so on).
      const buildsReturn = new Set<TSESTree.Node>(returnArguments);
      const usedInReturn = new Set<TSESTree.VariableDeclarator>();
      let changed = true;
      while (changed) {
        changed = false;
        for (const declarator of declarators) {
          if (usedInReturn.has(declarator) || !declarator.init || declarator.id.type !== AST_NODE_TYPES.Identifier) continue;
          const variable = ASTUtils.findVariable(context.sourceCode.getScope(declarator), declarator.id.name);
          const isUsed = variable?.references.some((ref) =>
            ref.isRead() && [...buildsReturn].some((expression) => contains(expression, ref.identifier)));
          if (isUsed) {
            usedInReturn.add(declarator);
            buildsReturn.add(declarator.init);
            changed = true;
          }
        }
      }

      // The variables with a copy of `this.state`.
      for (const declarator of declarators) {
        if (!declarator.init || !isThisState(unwrap(declarator.init))) continue;
        if (declarator.id.type !== AST_NODE_TYPES.Identifier) continue;
        const name = declarator.id.name;
        const variable = ASTUtils.findVariable(context.sourceCode.getScope(declarator), name);
        if (!variable) continue;

        for (const ref of variable.references) {
          if (!ref.isRead()) continue;
          const use = ref.identifier;
          if (![...buildsReturn].some((expression) => contains(expression, use))) continue;
          if (isInAwaitOrCondition(use, body)) continue;
          const isAfterAwait = awaits.some((awaitNode) =>
            awaitNode.range[0] >= declarator.range[1] &&
            awaitNode.range[1] <= use.range[0] &&
            !areInExclusiveBranches(awaitNode, use, body));
          if (!isAfterAwait) continue;

          // Inside the returned function, use its state parameter. Elsewhere, use `this.state`.
          const fn = returnedFunctions.find((returned) => contains(returned, use));
          const paramName = fn ? stateParamName(fn) : null;
          const replacement = paramName ?? 'this.state';
          const data = {name, replacement: `\`${replacement}\``};

          context.report({
            node: use,
            messageId: 'staleState',
            data,
            suggest: [{
              messageId: 'useReplacement',
              data,
              fix: (fixer: TSESLint.RuleFixer) => fixer.replaceText(use, replacement),
            }],
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

/** True if `node` is inside an `await` argument, or in a condition (of an `if`, `?:`, loop or `switch`). */
function isInAwaitOrCondition(node: TSESTree.Node, root: TSESTree.Node): boolean {
  for (let child = node, parent = node.parent; parent && child !== root; child = parent, parent = parent.parent) {
    switch (parent.type) {
      case AST_NODE_TYPES.AwaitExpression:
        return true;
      case AST_NODE_TYPES.IfStatement:
      case AST_NODE_TYPES.ConditionalExpression:
      case AST_NODE_TYPES.WhileStatement:
      case AST_NODE_TYPES.DoWhileStatement:
      case AST_NODE_TYPES.ForStatement:
        if (parent.test === child) return true;
        break;
      case AST_NODE_TYPES.SwitchStatement:
        if (parent.discriminant === child) return true;
        break;
    }
  }
  return false;
}

/** True if `a` and `b` are in different branches of the same `if` or `?:`. */
function areInExclusiveBranches(a: TSESTree.Node, b: TSESTree.Node, root: TSESTree.Node): boolean {
  for (let parent = a.parent; parent && parent !== root; parent = parent.parent) {
    if (parent.type !== AST_NODE_TYPES.IfStatement && parent.type !== AST_NODE_TYPES.ConditionalExpression) continue;
    const {consequent, alternate} = parent;
    if (!alternate) continue;
    if ((contains(consequent, a) && contains(alternate, b)) || (contains(alternate, a) && contains(consequent, b))) return true;
  }
  return false;
}
