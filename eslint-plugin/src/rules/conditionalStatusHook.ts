import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule, getTypeInfo, isFunction, kissImportName, TypeInfo, unwrap } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

const STATUS_HOOKS = new Set(['useIsWaiting', 'useIsFailed', 'useExceptionFor']);

/**
 * Reports `useIsWaiting`, `useIsFailed` and `useExceptionFor` called after `||`, `&&` or `??`,
 * or in a branch of `? :`. The hook is not called in every render, which breaks React's rules
 * of hooks:
 *
 * ```tsx
 * const isLoading = useIsWaiting(LoadUser) || useIsWaiting(LoadPosts); // Error
 * const isLoading = useIsWaiting([LoadUser, LoadPosts]);               // OK
 * ```
 *
 * Fix: when all the operands call the same hook, with the same options, and the operator means
 * "any of them", the hooks are replaced with one call with an array of all the action types:
 * `||` for `useIsWaiting` and `useIsFailed`, and `||` or `??` for `useExceptionFor` (which
 * returns the exception of the first type in the array that has one). This gives the same
 * result. The action types must be known to be classes or arrays: with type information, from
 * their types. Without it, a name that starts with an uppercase letter is taken as a class.
 *
 * Other cases are reported with no fix, like `useIsWaiting(A) && useIsWaiting(B)`, which means
 * "both run". There, each hook must be called in its own line.
 */
export default createRule({
  name: 'conditional-status-hook',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow status hooks called after `||`, `&&`, `??` or inside `? :`, which breaks the rules of hooks. Use an array of action types.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useArray:
        '`{{hook}}` is called after `{{operator}}`, so it is not called in every render. This ' +
        'breaks React\'s rules of hooks. Pass all the action types in one array: `{{suggestion}}`.',
      conditional:
        '`{{hook}}` is called inside a condition, so it is not called in every render. This ' +
        'breaks React\'s rules of hooks. Call each hook in its own line, before the condition, ' +
        'and then combine the results. To know if any of several actions runs or failed, pass ' +
        'an array of action types, like `useIsWaiting([LoadUser, LoadPosts])`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);
    // The hook calls already reported with their chain, as `useArray`.
    const reported = new Set<TSESTree.Node>();

    return {
      LogicalExpression(node) {
        if (isInSameChain(node)) return;
        const operands = chainOperands(node);
        const calls = operands.map((operand) => unwrap(operand));
        if (!calls.every((call) => call.type === AST_NODE_TYPES.CallExpression)) return;
        const hookCalls = calls as TSESTree.CallExpression[];
        const hook = kissImportName(hookCalls[0].callee, context);
        if (!hook || !STATUS_HOOKS.has(hook)) return;
        if (!hookCalls.every((call) => kissImportName(call.callee, context) === hook)) return;
        if (!meansAny(hook, node.operator)) return;
        const optionsText = sameOptionsText(hookCalls, context);
        if (optionsText === undefined) return;

        const elements = arrayElements(hookCalls, context, typeInfo);
        const callee = context.sourceCode.getText(hookCalls[0].callee);
        const replacement = elements === null
          ? null
          : `${callee}([${elements.join(', ')}]${optionsText === null ? '' : `, ${optionsText}`})`;
        const canFix = replacement !== null && context.sourceCode.getCommentsInside(node).length === 0;

        hookCalls.forEach((call) => reported.add(call));
        context.report({
          node,
          messageId: 'useArray',
          data: {hook, operator: node.operator, suggestion: replacement ?? `${callee}([...])`},
          fix: canFix ? (fixer) => fixer.replaceText(node, replacement!) : null,
        });
      },

      CallExpression(node) {
        if (reported.has(node)) return;
        const hook = kissImportName(node.callee, context);
        if (!hook || !STATUS_HOOKS.has(hook)) return;
        if (!isCalledConditionally(node)) return;
        context.report({node: node.callee, messageId: 'conditional', data: {hook}});
      },
    };
  },
});

/** True if the node is an operand of a logical expression with the same operator, like `b` in `a || b`. */
function isInSameChain(node: TSESTree.LogicalExpression): boolean {
  let parent: TSESTree.Node | undefined = node.parent;
  while (parent && parent.type !== AST_NODE_TYPES.LogicalExpression && unwrap(parent) !== parent) {
    parent = parent.parent;
  }
  return parent?.type === AST_NODE_TYPES.LogicalExpression && parent.operator === node.operator;
}

/** The operands of `a || b || c`, as `[a, b, c]`. The same for `&&` and `??`. */
function chainOperands(node: TSESTree.LogicalExpression): TSESTree.Expression[] {
  const result: TSESTree.Expression[] = [];
  const visit = (expression: TSESTree.Expression) => {
    const unwrapped = unwrap(expression);
    if (unwrapped.type === AST_NODE_TYPES.LogicalExpression && unwrapped.operator === node.operator) {
      visit(unwrapped.left);
      visit(unwrapped.right);
    } else {
      result.push(expression);
    }
  };
  visit(node.left);
  visit(node.right);
  return result;
}

/**
 * True if `hook(A) operator hook(B)` gives the same result as `hook([A, B])`: `||` for the
 * booleans, and `||` or `??` for `useExceptionFor`, which returns an exception or `null`.
 */
function meansAny(hook: string, operator: string): boolean {
  if (operator === '||') return true;
  return operator === '??' && hook === 'useExceptionFor';
}

/**
 * The text of the options (the second argument) of the calls, if they all have the same, or
 * `null` if none has options. `undefined` if they differ, or a call has other arguments.
 */
function sameOptionsText(calls: TSESTree.CallExpression[], context: Context): string | null | undefined {
  const texts = calls.map((call) => {
    if (call.arguments.length < 1 || call.arguments.length > 2) return undefined;
    if (call.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)) return undefined;
    return call.arguments.length === 2 ? context.sourceCode.getText(call.arguments[1]) : null;
  });
  return texts.every((text) => text === texts[0]) ? texts[0] : undefined;
}

/**
 * The elements of the array that replaces the calls, from their first arguments: a class as is,
 * the elements of an array literal, and `...types` for an array variable. `null` if an argument
 * is not known to be a class or an array.
 */
function arrayElements(calls: TSESTree.CallExpression[], context: Context, typeInfo: TypeInfo | null): string[] | null {
  const elements: string[] = [];
  for (const call of calls) {
    const argument = call.arguments[0] as TSESTree.Expression;
    const expression = unwrap(argument);
    if (expression.type === AST_NODE_TYPES.ArrayExpression) {
      for (const element of expression.elements) {
        if (!element) return null;
        elements.push(context.sourceCode.getText(element));
      }
      continue;
    }
    const kind = argumentKind(argument, typeInfo);
    if (kind === null) return null;
    elements.push(kind === 'array' ? `...${context.sourceCode.getText(argument)}` : context.sourceCode.getText(argument));
  }
  return elements;
}

/** If the argument is a class or an array of classes. With no type information, from its name. */
function argumentKind(argument: TSESTree.Expression, typeInfo: TypeInfo | null): 'class' | 'array' | null {
  if (typeInfo) {
    const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(argument));
    if (typeInfo.checker.isArrayType(type) || typeInfo.checker.isTupleType(type)) return 'array';
    return type.getConstructSignatures().length > 0 ? 'class' : null;
  }
  const expression = unwrap(argument);
  const name = expression.type === AST_NODE_TYPES.Identifier ? expression.name
    : expression.type === AST_NODE_TYPES.MemberExpression && !expression.computed &&
      expression.property.type === AST_NODE_TYPES.Identifier ? expression.property.name
      : null;
  return name !== null && /^[A-Z]/.test(name) ? 'class' : null;
}

/**
 * True if the call is not always run when the function runs: it's on the right of `||`, `&&`
 * or `??`, or in a branch of `? :`.
 */
function isCalledConditionally(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (isFunction(parent)) return false;
    if (parent.type === AST_NODE_TYPES.LogicalExpression && parent.right === child) return true;
    if (parent.type === AST_NODE_TYPES.ConditionalExpression && parent.test !== child) return true;
  }
  return false;
}
