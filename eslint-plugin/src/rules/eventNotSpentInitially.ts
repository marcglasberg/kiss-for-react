import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { contains, createRule, isTestFile, kissImportName, memberName } from '../utils.js';
import { initialStateOption } from '../stateClasses.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports a `new Evt()` or `new EvtState()` in the initial state, which fires when the first
 * component that uses it mounts. The initial state should use `Evt.spent()`:
 *
 * ```ts
 * class State {
 *   static initialState = new State(new Evt());     // Warning
 *   static initialState = new State(Evt.spent());   // OK
 * }
 * ```
 *
 * Checked in a static `initialState` (property, getter or method) of any class, and in the
 * `initialState` given to `createStore`, `new Store` or `logOut`. Not reported in tests.
 *
 * Fix (suggestion): replace it with `Evt.spent()` (or `EvtState.spent()`), keeping the type
 * arguments, if any: `new Evt<string>('x')` becomes `Evt.spent<string>()`.
 */
export default createRule({
  name: 'event-not-spent-initially',
  meta: {
    type: 'problem',
    docs: {
      description: 'Use `Evt.spent()` in the initial state, not `new Evt()`, which fires when the first component mounts.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      notSpent:
        'The initial state has a new event, `{{text}}`, which fires when the first component that uses it mounts. ' +
        'Use `{{replacement}}` instead, so that nothing fires when the app starts.',
      replace: 'Replace with `{{replacement}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const sourceCode = context.sourceCode;

    return {
      NewExpression(node) {
        const name = kissImportName(node.callee, context);
        if (name !== 'Evt' && name !== 'EvtState') return;
        if (!isInInitialState(node, context)) return;

        const typeArguments = node.typeArguments ? sourceCode.getText(node.typeArguments) : '';
        const replacement = `${sourceCode.getText(node.callee)}.spent${typeArguments}()`;
        context.report({
          node,
          messageId: 'notSpent',
          data: {text: sourceCode.getText(node), replacement},
          suggest: [{
            messageId: 'replace',
            data: {replacement},
            fix: (fixer) => fixer.replaceText(node, replacement),
          }],
        });
      },
    };
  },
});

/**
 * True if the node is inside a static `initialState` member of a class (a property, getter or
 * method), or inside the `initialState` option of `createStore(...)`, `new Store(...)` or
 * `store.logOut(...)`.
 */
function isInInitialState(node: TSESTree.Node, context: Context): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if ((current.type === AST_NODE_TYPES.PropertyDefinition || current.type === AST_NODE_TYPES.MethodDefinition) &&
      current.static && memberName(current) === 'initialState') return true;

    if (current.type === AST_NODE_TYPES.CallExpression || current.type === AST_NODE_TYPES.NewExpression) {
      const initialState = isStoreCreation(current, context) || isLogOut(current) ? initialStateOption(current) : null;
      if (initialState && contains(initialState, node)) return true;
    }
  }
  return false;
}

/** `createStore(...)` or `new Store(...)`, from Kiss. */
function isStoreCreation(node: TSESTree.CallExpression | TSESTree.NewExpression, context: Context): boolean {
  const kissName = kissImportName(node.callee, context);
  return (node.type === AST_NODE_TYPES.CallExpression && kissName === 'createStore') ||
    (node.type === AST_NODE_TYPES.NewExpression && kissName === 'Store');
}

/** `something.logOut(...)`. */
function isLogOut(node: TSESTree.CallExpression | TSESTree.NewExpression): boolean {
  return node.type === AST_NODE_TYPES.CallExpression && node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed && node.callee.property.type === AST_NODE_TYPES.Identifier && node.callee.property.name === 'logOut';
}
