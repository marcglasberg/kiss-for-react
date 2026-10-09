import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  areInExclusiveBranches,
  dispatchedActions,
  enclosingFunction,
  extendsKissAction,
  isJump,
  kissDispatchMethod,
  statementsOf,
} from '../storeUsage.js';
import { contains, createRule, getTypeInfo, TypeInfo, unwrap, walk } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports the same action object dispatched twice. Kiss throws a `StoreException`, since each
 * dispatch needs a new action:
 *
 * ```ts
 * const action = new LoadUser();
 * store.dispatch(action);
 * store.dispatch(action);           // Error
 * store.dispatch(new LoadUser());   // OK
 * ```
 *
 * Only actions kept in a `const` and created with `new` are checked, between two dispatches in
 * the same function. Not reported when the dispatches are in different branches of an `if`, `?:`,
 * `switch` or `try`/`catch`, or when the code after the first dispatch always leaves (with
 * `return`, `throw`, `break` or `continue`) before reaching the second.
 *
 * Any dispatch counts: the methods of the store, of `useStore()` and of actions (`dispatch`,
 * `dispatchAndWait`, `dispatchSync`, `dispatchWhen`, and the arrays of `dispatchAll` and
 * `dispatchAndWaitAll`), and the functions returned by the dispatch hooks, like `useDispatch()`.
 * With type information, the action must be a Kiss action.
 *
 * Suggestion: dispatch a new action, by repeating the `new` expression.
 */
export default createRule({
  name: 'dispatch-same-action-twice',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow dispatching the same action object twice.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      sameAction:
        '`{{name}}` was already dispatched in line {{line}}. An action can only be dispatched once, ' +
        'so this throws a `StoreException`. Create a new action instead.',
      newAction: 'Dispatch a new action: `{{expression}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    return {
      VariableDeclarator(node) {
        if (node.id.type !== AST_NODE_TYPES.Identifier || !node.init) return;
        if ((node.parent as TSESTree.VariableDeclaration).kind !== 'const') return;
        const creation = unwrap(node.init);
        if (creation.type !== AST_NODE_TYPES.NewExpression) return;
        if (!isKissActionCreation(creation, typeInfo)) return;

        const variable = ASTUtils.findVariable(context.sourceCode.getScope(node), node.id.name);
        if (!variable) return;

        // The places where the action is dispatched, in source order.
        const dispatches = variable.references
          .map((ref) => ref.identifier)
          .filter((identifier): identifier is TSESTree.Identifier =>
            identifier.type === AST_NODE_TYPES.Identifier && isDispatchedHere(identifier, context, typeInfo))
          .sort((a, b) => a.range[0] - b.range[0]);

        const reported = new Set<TSESTree.Node>();
        for (let i = 0; i < dispatches.length; i++) {
          for (let j = i + 1; j < dispatches.length; j++) {
            const first = dispatches[i];
            const second = dispatches[j];
            if (reported.has(second)) continue;
            const fn = enclosingFunction(first);
            if (enclosingFunction(second) !== fn) continue;
            if (areInExclusiveBranches(first, second, fn)) continue;
            if (leavesBefore(first, second)) continue;
            reported.add(second);

            const expression = context.sourceCode.getText(creation);
            const canRepeat = canRepeatAt(creation, second, context);
            context.report({
              node: second,
              messageId: 'sameAction',
              data: {name: node.id.name, line: first.loc.start.line},
              suggest: canRepeat
                ? [{
                  messageId: 'newAction',
                  data: {expression},
                  fix: (fixer: TSESLint.RuleFixer) => fixer.replaceText(second, expression),
                }]
                : [],
            });
          }
        }
      },
    };
  },
});

/** With type information, the class must be a Kiss action. Without it, any class. */
function isKissActionCreation(creation: TSESTree.NewExpression, typeInfo: TypeInfo | null): boolean {
  if (!typeInfo) return true;
  const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(creation));
  return extendsKissAction(type, typeInfo.checker, new Set());
}

/** True if the identifier is an action dispatched by a dispatch call: its argument, or an item of its array. */
function isDispatchedHere(identifier: TSESTree.Identifier, context: Context, typeInfo: TypeInfo | null): boolean {
  let node: TSESTree.Node = identifier;
  while (node.parent && isWrapper(node.parent)) node = node.parent;
  let parent = node.parent;
  if (parent?.type === AST_NODE_TYPES.ArrayExpression) {
    node = parent;
    while (node.parent && isWrapper(node.parent)) node = node.parent;
    parent = node.parent;
  }
  if (parent?.type !== AST_NODE_TYPES.CallExpression || parent.arguments[0] !== node) return false;
  const method = kissDispatchMethod(parent, context, typeInfo, true);
  if (method === null) return false;
  return dispatchedActions(parent, method).some((action) => unwrap(action) === identifier);
}

function isWrapper(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.TSAsExpression || node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression || node.type === AST_NODE_TYPES.TSTypeAssertion;
}

/**
 * True if the code always leaves after `first`, before reaching `second`: in a block that has
 * `first` but not `second`, the statement with `first` (or one after it) is a `return`, `throw`,
 * `break` or `continue`.
 */
function leavesBefore(first: TSESTree.Node, second: TSESTree.Node): boolean {
  let child: TSESTree.Node = first;
  let parent = first.parent;
  for (; parent && !contains(parent, second); child = parent, parent = parent.parent) {
    const statements = statementsOf(parent);
    const index = statements.indexOf(child);
    if (index >= 0 && statements.slice(index).some(isJump)) return true;
  }
  // In the block that has both: a jump between them.
  if (!parent) return false;
  const statements = statementsOf(parent);
  const index = statements.indexOf(child);
  if (index < 0) return false;
  const end = statements.findIndex((statement) => contains(statement, second));
  return statements.slice(index, end).some(isJump);
}

/** True if the `new` expression can be repeated at `place`: its variables are the same there. */
function canRepeatAt(creation: TSESTree.NewExpression, place: TSESTree.Node, context: Context): boolean {
  let canRepeat = true;
  const scopeThere = context.sourceCode.getScope(place);
  walk(creation, (node) => {
    if (node.type !== AST_NODE_TYPES.Identifier) return;
    const parent = node.parent!;
    if (parent.type === AST_NODE_TYPES.MemberExpression && parent.property === node && !parent.computed) return;
    if (parent.type === AST_NODE_TYPES.Property && parent.key === node && !parent.computed && !parent.shorthand) return;
    const here = ASTUtils.findVariable(context.sourceCode.getScope(node), node.name);
    const there = ASTUtils.findVariable(scopeThere, node.name);
    if (here !== there) canRepeat = false;
  }, true);
  return canRepeat;
}
