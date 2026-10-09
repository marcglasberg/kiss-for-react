import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { actionKindOfExpression } from '../actions.js';
import { kissObjectKind, memberPropertyName, statementsOf } from '../storeUsage.js';
import { createRule, getTypeInfo, isFunction, isTestFile, TypeInfo, unwrap, walk, isAnyOrUnknown } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/** Array methods that call their callback without waiting for it. Making the callback `async` would break the test. */
const ARRAY_METHODS = new Set(['forEach', 'map', 'filter', 'reduce', 'reduceRight', 'some', 'every', 'find', 'findIndex', 'flatMap', 'sort']);

/**
 * Reports, in tests, `store.dispatch(...)` of an async action, followed by an `expect` that reads
 * `store.state`, without waiting in between. The `expect` checks the state before the action
 * finishes:
 *
 * ```ts
 * store.dispatch(new LoadUser());               // Warning
 * await store.dispatchAndWait(new LoadUser());  // OK
 * expect(store.state.user.name).toBe('Mary');
 * ```
 *
 * The `expect` must be a statement of the same block, after the dispatch. Any `await` between
 * them counts as waiting. Not reported when, later in the same block, the test waits and checks
 * `store.state` again, since then the first `expect` checks the state while the action runs, on
 * purpose.
 *
 * An action is async if its `reduce` or `before` returns a promise (see `actionKindOfExpression`).
 * Without type information, its class must be declared in the same file.
 *
 * Automatic fix: use `await store.dispatchAndWait(...)`. If the function is not `async`, it's
 * made `async`, but only when it's a callback (like the test function of `it(...)`), with no
 * declared return type (other than a `Promise`), and no `return` of a value.
 */
export default createRule({
  name: 'expect-without-waiting',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow checking `store.state` right after dispatching an async action in a test, without waiting.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      notWaiting:
        '`{{action}}` is async, so the `expect` in line {{line}} checks `{{store}}.state` before the action ' +
        'finishes. Use `await {{store}}.dispatchAndWait(...)` to wait for it.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    const checkStatements = (statements: TSESTree.Node[]) => {
      statements.forEach((statement, index) => {
        if (statement.type !== AST_NODE_TYPES.ExpressionStatement) return;
        const call = unwrap(statement.expression);
        if (call.type !== AST_NODE_TYPES.CallExpression) return;
        const callee = unwrap(call.callee);
        if (memberPropertyName(callee) !== 'dispatch') return;
        const store = (callee as TSESTree.MemberExpression).object;
        if (!isStoreLike(store, context, typeInfo)) return;
        const action = call.arguments[0];
        if (!action || action.type === AST_NODE_TYPES.SpreadElement) return;
        const kind = actionKindOfExpression(action, context, typeInfo);
        if (kind.kind !== 'async') return;

        const storeText = context.sourceCode.getText(store);
        const rest = statements.slice(index + 1);

        // The first `expect` that reads `store.state`, before any `await`.
        const awaitIndex = rest.findIndex(hasAwait);
        const beforeAwait = awaitIndex < 0 ? rest : rest.slice(0, awaitIndex);
        const expectStatement = beforeAwait.find((s) => isExpectReadingState(s, storeText, context));
        if (!expectStatement) return;

        // Later, the test waits and checks the state again: the first `expect` is on purpose.
        if (awaitIndex >= 0 && rest.slice(awaitIndex).some((s) => isExpectReadingState(s, storeText, context))) return;

        const fix = fixFor(call, callee as TSESTree.MemberExpression, context);
        context.report({
          node: call,
          messageId: 'notWaiting',
          data: {action: kind.className, line: expectStatement.loc.start.line, store: storeText},
          fix,
        });
      });
    };

    return {
      BlockStatement: (node) => checkStatements(node.body),
      SwitchCase: (node) => checkStatements(node.consequent),
      Program: (node) => checkStatements(statementsOf(node)),
    };
  },
});

/** With type information, the object must be a Kiss store (or `any`). Without it, any object. */
function isStoreLike(node: TSESTree.Node, context: Context, typeInfo: TypeInfo | null): boolean {
  if (!typeInfo) return true;
  const kind = kissObjectKind(node, context, typeInfo);
  if (kind === 'store' || kind === 'dispatchers') return true;
  const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(unwrap(node)));
  return isAnyOrUnknown(type);
}

/** True if the statement has an `await` (not inside nested functions). */
function hasAwait(statement: TSESTree.Node): boolean {
  let found = false;
  walk(statement, (node) => {
    if (node.type === AST_NODE_TYPES.AwaitExpression) found = true;
    if ((node.type === AST_NODE_TYPES.ForOfStatement && node.await)) found = true;
  });
  return found;
}

/** True if the statement has an `expect(...)` call, and reads `store.state` (not inside nested functions). */
function isExpectReadingState(statement: TSESTree.Node, storeText: string, context: Context): boolean {
  let hasExpect = false;
  let readsState = false;
  walk(statement, (node) => {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = unwrap(node.callee);
      if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'expect') hasExpect = true;
    }
    if (memberPropertyName(node) === 'state' &&
      context.sourceCode.getText(unwrap((node as TSESTree.MemberExpression).object)) === storeText) readsState = true;
  });
  return hasExpect && readsState;
}

/** The fix: `await store.dispatchAndWait(...)`, making the function `async` if needed and possible. */
function fixFor(
  call: TSESTree.CallExpression,
  callee: TSESTree.MemberExpression,
  context: Context,
): TSESLint.ReportFixFunction | null {
  const fn = enclosingFunctionOf(call);
  if (!fn) return null;
  const property = callee.property;
  const replaceCall = (fixer: TSESLint.RuleFixer) => [
    fixer.insertTextBefore(call, 'await '),
    fixer.replaceText(property, 'dispatchAndWait'),
  ];
  if (fn.async) return (fixer) => replaceCall(fixer);
  if (!canMakeAsync(fn, context)) return null;
  return (fixer) => {
    const fixes = replaceCall(fixer);
    const firstToken = context.sourceCode.getFirstToken(fn)!;
    fixes.push(fixer.insertTextBefore(firstToken, 'async '));
    return fixes;
  };
}

function enclosingFunctionOf(node: TSESTree.Node) {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunction(current)) return current;
  }
  return null;
}

/**
 * A function can be made `async` when it's a callback (an argument of a call, but not of an array
 * method like `forEach`), not a generator, with no declared return type (other than a `Promise`),
 * and no `return` of a value.
 */
function canMakeAsync(
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration,
  context: Context,
): boolean {
  if (fn.generator || fn.type === AST_NODE_TYPES.FunctionDeclaration) return false;
  const parent = fn.parent;
  if (parent?.type !== AST_NODE_TYPES.CallExpression || !parent.arguments.includes(fn)) return false;
  const calleeName = memberPropertyName(unwrap(parent.callee));
  if (calleeName !== null && ARRAY_METHODS.has(calleeName)) return false;
  if (fn.returnType && !/^\s*:?\s*Promise\s*</.test(context.sourceCode.getText(fn.returnType))) return false;
  let returnsValue = false;
  walk(fn.body, (node) => {
    if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) returnsValue = true;
  });
  return !returnsValue;
}
