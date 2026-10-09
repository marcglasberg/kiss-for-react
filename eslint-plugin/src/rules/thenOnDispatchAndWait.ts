import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Context, dispatchMethodOf, FunctionNode } from '../components.js';
import { createRule, getTypeInfo, isFunction, TypeInfo, unwrap, walk } from '../utils.js';

/**
 * Reports `.then(...)` on the promise returned by `dispatchAndWait`, when the callback ignores
 * the status:
 *
 * ```ts
 * dispatchAndWait(new SaveUser()).then(() => navigate('/home'));        // Warning
 * dispatchAndWait(new SaveUser()).then((status) => {                    // OK
 *   if (status.isCompletedOk) navigate('/home');
 * });
 * ```
 *
 * When the action fails with a `UserException` (shown to the user), or is aborted, the promise
 * still resolves, so the callback runs anyway.
 *
 * Not reported when the callback's parameter starts with `_`, like `_status`.
 *
 * Suggestion: wrap the callback's body in `if (status.isCompletedOk) { ... }`, adding the
 * parameter if needed.
 */
export default createRule({
  name: 'then-on-dispatch-and-wait',
  meta: {
    type: 'problem',
    docs: {
      description: 'Check the action status in `.then(...)` of `dispatchAndWait`.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      ignoresStatus:
        'This callback runs even when the action fails with a `UserException`, or is aborted, since the promise ' +
        'of `dispatchAndWait` resolves anyway. Check `status.isCompletedOk` first. If it must always run, use ' +
        '`.finally(...)` instead.',
      checkStatus: 'Run the callback only if `{{name}}.isCompletedOk`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        if (!isDispatchAndWait(node, context, typeInfo)) return;

        // `dispatchAndWait(...).then(callback)`
        const member = node.parent;
        if (member?.type !== AST_NODE_TYPES.MemberExpression || member.object !== node || member.computed ||
          member.property.type !== AST_NODE_TYPES.Identifier || member.property.name !== 'then') return;
        const thenCall = member.parent;
        if (thenCall?.type !== AST_NODE_TYPES.CallExpression || thenCall.callee !== member) return;
        const callback = thenCall.arguments[0];
        if (!callback || !isFunction(callback)) return;

        const param = callback.params[0];
        if (param) {
          if (param.type !== AST_NODE_TYPES.Identifier || param.name.startsWith('_')) return;
          const variable = context.sourceCode.getDeclaredVariables(callback).find((v) => v.name === param.name);
          if (!variable || variable.references.length > 0) return;
        }

        const name = param ? (param as TSESTree.Identifier).name : freeName(callback, context);
        context.report({
          node: member.property,
          messageId: 'ignoresStatus',
          suggest: name ? [{
            messageId: 'checkStatus' as const,
            data: {name},
            fix: (fixer: TSESLint.RuleFixer) => wrapInStatusCheck(callback, name, !param, isResultUsed(thenCall), fixer, context),
          }] : [],
        });
      },
    };
  },
});

/**
 * True for a call of `dispatchAndWait`: `store.dispatchAndWait(...)`, `this.dispatchAndWait(...)`,
 * `useStore().dispatchAndWait(...)`, or the function returned by `useDispatchAndWait()`.
 * With type information, it must also return a `Promise<ActionStatus>`.
 */
function isDispatchAndWait(call: TSESTree.CallExpression, context: Context, typeInfo: TypeInfo | null): boolean {
  const callee = unwrap(call.callee);
  const isByName =
    (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'dispatchAndWait') ||
    (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
      callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === 'dispatchAndWait');
  if (!isByName && dispatchMethodOf(callee, context, typeInfo) !== 'dispatchAndWait') return false;
  if (!typeInfo) return true;

  const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(call));
  const awaited = typeInfo.checker.getAwaitedType(type);
  return awaited?.getSymbol()?.getName() === 'ActionStatus';
}

/** True if the value of the `.then(...)` call is used (not just a statement, or `await`ed as a statement). */
function isResultUsed(thenCall: TSESTree.CallExpression): boolean {
  let node: TSESTree.Node = thenCall;
  if (node.parent?.type === AST_NODE_TYPES.AwaitExpression) node = node.parent;
  const parent = node.parent;
  if (parent?.type === AST_NODE_TYPES.ExpressionStatement) return false;
  if (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'void') return false;
  return true;
}

/** `status`, or `actionStatus`, if the name is not used inside or around the callback. */
function freeName(callback: FunctionNode, context: Context): string | null {
  const used = new Set<string>();
  walk(callback, (node) => {
    if (node.type === AST_NODE_TYPES.Identifier) used.add(node.name);
  }, true);
  const scope = context.sourceCode.getScope(callback);
  return ['status', 'actionStatus'].find((name) => !used.has(name) && !ASTUtils.findVariable(scope, name)) ?? null;
}

function wrapInStatusCheck(
  callback: FunctionNode,
  name: string,
  addParameter: boolean,
  isUsed: boolean,
  fixer: TSESLint.RuleFixer,
  context: Context,
): TSESLint.RuleFix[] | null {
  const sourceCode = context.sourceCode;
  const fixes: TSESLint.RuleFix[] = [];

  if (addParameter) {
    const openParen = sourceCode.getFirstToken(callback, {filter: (token) => token.value === '('});
    if (!openParen) return null;
    fixes.push(fixer.insertTextAfter(openParen, name));
  }

  const condition = `if (${name}.isCompletedOk)`;
  const body = callback.body;

  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    // `() => expr` becomes `(status) => { if (status.isCompletedOk) expr; }`. The range includes
    // the parentheses around the expression, if any.
    const arrow = sourceCode.getTokenBefore(body, (token) => token.value === '=>');
    if (!arrow) return null;
    const start = sourceCode.getTokenAfter(arrow)!.range[0];
    const needsParens = body.type === AST_NODE_TYPES.ObjectExpression || body.type === AST_NODE_TYPES.SequenceExpression;
    const text = needsParens ? `(${sourceCode.getText(body)})` : sourceCode.getText(body);
    fixes.push(fixer.replaceTextRange([start, callback.range[1]], `{ ${condition} ${isUsed ? 'return ' : ''}${text}; }`));
    return fixes;
  }

  // `{ ... }` becomes `{ if (status.isCompletedOk) { ... } }`, indenting the statements.
  const inner = sourceCode.text.slice(body.range[0] + 1, body.range[1] - 1);
  if (!inner.includes('\n')) {
    fixes.push(fixer.replaceText(body, `{ ${condition} {${inner}} }`));
    return fixes;
  }
  const line = sourceCode.lines[body.loc.start.line - 1];
  const indent = /^\s*/.exec(line)![0];
  const lines = inner.replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, '').split('\n');
  const indented = lines.map((l) => l.trim() ? `  ${l}` : l).join('\n');
  fixes.push(fixer.replaceText(body, `{\n${indent}  ${condition} {\n${indented}\n${indent}  }\n${indent}}`));
  return fixes;
}
