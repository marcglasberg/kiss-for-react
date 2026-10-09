import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  DISPATCH_METHODS,
  enclosingFunction,
  indentationOf,
  memberPropertyName,
  statementInList,
} from '../storeUsage.js';
import { createRule, kissImportName, unwrap, walk } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports a dispatch right after creating a store with a persistor, without waiting for
 * `store.ready()`. Kiss throws a `StoreException`, since the persisted state is still being read:
 *
 * ```ts
 * const store = createStore<State>({ initialState: State.initialState, persistor });
 * store.dispatch(new InitApp());   // Error
 * await store.ready();
 * store.dispatch(new InitApp());   // OK
 * ```
 *
 * The store must be a `const`, created with Kiss's `createStore` or `new Store`, with a
 * `persistor` option. Only the code of the same function (or module) that creates the store is
 * checked, in source order: a dispatch is OK after any `await` that waits for `store.ready()`.
 * Dispatches inside other functions (like callbacks) are not checked.
 *
 * Suggestion: add `await store.ready();` before the dispatch, when the function is `async`, or at
 * the top level of a module.
 */
export default createRule({
  name: 'dispatch-before-store-ready',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow dispatching before a store with a persistor is ready.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      notReady:
        '`{{store}}` has a persistor, and is not ready until it reads the persisted state. Dispatching ' +
        'before that throws a `StoreException`. Wait for `{{store}}.ready()` first.',
      addReady: 'Add `await {{store}}.ready();` before the dispatch.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.id.type !== AST_NODE_TYPES.Identifier || !node.init) return;
        if ((node.parent as TSESTree.VariableDeclaration).kind !== 'const') return;
        if (!createsStoreWithPersistor(node.init, context)) return;

        const name = node.id.name;
        const variable = ASTUtils.findVariable(context.sourceCode.getScope(node), name);
        if (!variable) return;
        const fn = enclosingFunction(node);
        const root: TSESTree.Node = fn ? fn.body : context.sourceCode.ast;
        const isStore = (expression: TSESTree.Node) => {
          const unwrapped = unwrap(expression);
          return unwrapped.type === AST_NODE_TYPES.Identifier &&
            variable.references.some((ref) => ref.identifier === unwrapped);
        };

        // In source order: the `await`s of `store.ready()`, and the dispatches.
        let isReady = false;
        walk(root, (child) => {
          if (isReady || child.range[0] < node.range[1]) return;
          if (child.type === AST_NODE_TYPES.AwaitExpression && waitsForReady(child, isStore)) {
            isReady = true;
            return;
          }
          if (child.type !== AST_NODE_TYPES.CallExpression) return;
          const callee = unwrap(child.callee);
          const method = memberPropertyName(callee);
          if (method === null || !DISPATCH_METHODS.has(method) || method === 'dispatchWhen') return;
          if (!isStore((callee as TSESTree.MemberExpression).object)) return;

          const statement = statementInList(child);
          const canAwait = fn ? fn.async : true;
          context.report({
            node: callee,
            messageId: 'notReady',
            data: {store: name},
            suggest: statement && canAwait
              ? [{
                messageId: 'addReady',
                data: {store: name},
                fix: (fixer: TSESLint.RuleFixer) =>
                  fixer.insertTextBefore(statement, `await ${name}.ready();\n${indentationOf(statement, context)}`),
              }]
              : [],
          });
        });
      },
    };
  },
});

/** True for `createStore({ ..., persistor })` or `new Store({ ..., persistor })`, of Kiss. */
function createsStoreWithPersistor(init: TSESTree.Expression, context: Context): boolean {
  const expression = unwrap(init);
  let isCreation = false;
  if (expression.type === AST_NODE_TYPES.NewExpression) isCreation = kissImportName(expression.callee, context) === 'Store';
  if (expression.type === AST_NODE_TYPES.CallExpression) isCreation = kissImportName(expression.callee, context) === 'createStore';
  if (!isCreation) return false;
  const options = (expression as TSESTree.NewExpression | TSESTree.CallExpression).arguments[0];
  if (!options || options.type === AST_NODE_TYPES.SpreadElement) return false;
  const object = unwrap(options);
  if (object.type !== AST_NODE_TYPES.ObjectExpression) return false;
  return object.properties.some((property) => {
    if (property.type !== AST_NODE_TYPES.Property || property.computed) return false;
    const key = property.key;
    const keyName = key.type === AST_NODE_TYPES.Identifier ? key.name : key.type === AST_NODE_TYPES.Literal ? key.value : null;
    if (keyName !== 'persistor') return false;
    const value = unwrap(property.value);
    return !(value.type === AST_NODE_TYPES.Identifier && value.name === 'undefined');
  });
}

/** True if the `await` waits for `store.ready()`, like `await store.ready()` or `await Promise.all([store.ready(), ...])`. */
function waitsForReady(awaitNode: TSESTree.AwaitExpression, isStore: (node: TSESTree.Node) => boolean): boolean {
  let found = false;
  walk(awaitNode.argument, (node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression) return;
    const callee = unwrap(node.callee);
    if (memberPropertyName(callee) === 'ready' && isStore((callee as TSESTree.MemberExpression).object)) found = true;
  });
  return found;
}
